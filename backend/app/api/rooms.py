import functools
import json
import logging
import os
import socket
import subprocess
import time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect

from app.api.deps import current_user
from app.models.analysis import AnalysisResult
from app.services import auth, rooms
from app.services.storage import get_cached_analysis

logger = logging.getLogger(__name__)
router = APIRouter()


def _lan_ip() -> str | None:
    """This machine's address on the local network, by asking the OS which
    interface it would route out of. Connecting a UDP socket sends nothing."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


@functools.cache
def _under_wsl() -> bool:
    try:
        return "microsoft" in Path("/proc/version").read_text().lower()
    except OSError:
        return False


# Cached briefly rather than forever: laptops change Wi-Fi networks.
_windows_ip_cache: tuple[float, str | None] = (0.0, None)


def _windows_lan_ip() -> str | None:
    """Under WSL, the Windows host's address on the LAN — the adapter holding
    the default route. WSL's own interface is a private NAT address (unless
    mirrored networking is on) that nothing on the Wi-Fi can reach."""
    global _windows_ip_cache
    checked_at, cached = _windows_ip_cache
    if time.monotonic() - checked_at < 300:
        return cached

    script = (
        "$r = Get-NetRoute -DestinationPrefix 0.0.0.0/0 -ErrorAction SilentlyContinue | "
        "Sort-Object RouteMetric | Select-Object -First 1; "
        "if ($r) { (Get-NetIPAddress -InterfaceIndex $r.InterfaceIndex -AddressFamily IPv4 | "
        "Select-Object -First 1).IPAddress }"
    )
    try:
        out = subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command", script],
            capture_output=True, text=True, timeout=15,
        ).stdout.strip().splitlines()
        ip = out[0].strip() if out else None
    except (OSError, subprocess.TimeoutExpired):
        ip = None

    _windows_ip_cache = (time.monotonic(), ip)
    return ip


def _local_ips() -> set[str]:
    try:
        out = subprocess.run(["hostname", "-I"], capture_output=True, text=True, timeout=5).stdout
        return set(out.split())
    except (OSError, subprocess.TimeoutExpired):
        return set()


@router.get("/network")
def network_address(request: Request):
    """Where phones on the same Wi-Fi should point to reach this server.

    PUBLIC_BASE_URL wins when set. Under WSL the Windows host's LAN address is
    used, and `warning` says when phones still can't get through — WSL's
    default NAT networking doesn't forward LAN traffic into it.
    """
    port = request.url.port
    suffix = f":{port}" if port else ""

    configured = os.environ.get("PUBLIC_BASE_URL")
    if configured:
        return {"base_url": configured.rstrip("/"), "source": "configured", "warning": None}

    if _under_wsl():
        windows_ip = _windows_lan_ip()
        if windows_ip:
            # Mirrored networking puts the Windows LAN address on WSL's own
            # interface; without it, the LAN can't reach in.
            reachable = windows_ip in _local_ips()
            return {
                "base_url": f"http://{windows_ip}{suffix}",
                "source": "windows",
                "warning": None if reachable else "wsl-nat",
            }

    ip = _lan_ip()
    if not ip:
        return {"base_url": None, "source": "unknown", "warning": None}
    return {"base_url": f"http://{ip}{suffix}", "source": "detected", "warning": None}


@router.post("", status_code=201)
async def create_room(user: dict = Depends(current_user)):
    room = await rooms.create_room(user)
    return {"room_id": room.id}


@router.get("/{room_id}")
def room_info(room_id: str):
    """Just enough for the join page to say whose room it is."""
    room = rooms.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="This session has ended")
    return {"room_id": room.id, "owner": room.owner_name, "tv_connected": room.tv is not None}


@router.delete("/{room_id}")
async def end_room(room_id: str, user: dict = Depends(current_user)):
    room = rooms.get_room(room_id)
    if room is None or room.owner_id != user["id"]:
        raise HTTPException(status_code=404, detail="Room not found")
    await rooms.close_room(room_id)
    return {"status": "closed"}


@router.get("/{room_id}/songs/{url_hash}", response_model=AnalysisResult)
def room_song(room_id: str, url_hash: str, user: dict = Depends(current_user)):
    """The TV's way to load a queued song.

    Unlike POST /analysis this doesn't add the song to the TV owner's
    library — Alice queueing her song shouldn't file it under Bob's account.
    Only songs that are actually in the room can be fetched.
    """
    room = rooms.get_room(room_id)
    if room is None or room.owner_id != user["id"]:
        raise HTTPException(status_code=404, detail="Room not found")

    entry = room.find_entry(url_hash)
    if entry is None:
        raise HTTPException(status_code=404, detail="Song is not in this room")

    result = get_cached_analysis(entry.youtube_url)
    if result is None:
        raise HTTPException(status_code=404, detail="Song analysis is missing")
    result.video_title = result.video_title or entry.title
    return result


@router.websocket("/{room_id}/ws")
async def room_socket(ws: WebSocket, room_id: str):
    """One socket per screen. The first message says who's connecting:

        {"type": "hello", "role": "tv", "token": "..."}
        {"type": "hello", "role": "controller", "token": "..."}
        {"type": "hello", "role": "controller", "guest_name": "Sam"}

    Browsers can't put an Authorization header on a WebSocket, so the token
    rides in that first message instead.
    """
    await ws.accept()

    room = rooms.get_room(room_id)
    if room is None:
        await ws.send_json({"type": "closed", "reason": "This session has ended."})
        await ws.close()
        return

    try:
        hello = await ws.receive_json()
    except (WebSocketDisconnect, json.JSONDecodeError, ValueError):
        return

    token = hello.get("token") if isinstance(hello, dict) else None
    user = auth.get_user_for_token(token) if isinstance(token, str) else None
    role = hello.get("role") if isinstance(hello, dict) else None

    if role == "tv":
        if user is None or user["id"] != room.owner_id:
            await ws.send_json({"type": "error", "reason": "Only the TV's owner can run it."})
            await ws.close()
            return
        await rooms.attach_tv(room, ws)
        member = None
    elif role == "controller":
        guest_name = str(hello.get("guest_name") or "").strip()[:40]
        if user is None and not guest_name:
            await ws.send_json({"type": "error", "reason": "Sign in or pick a guest name."})
            await ws.close()
            return
        member = await rooms.attach_controller(room, ws, user, guest_name)
        await ws.send_json({"type": "welcome", "member": member.public()})
    else:
        await ws.close()
        return

    try:
        while True:
            msg = await ws.receive_json()
            if not isinstance(msg, dict) or rooms.get_room(room_id) is not room:
                continue
            if member is None:
                await rooms.handle_tv(room, msg)
            else:
                await rooms.handle_controller(room, member, msg)
    except (WebSocketDisconnect, json.JSONDecodeError, ValueError, RuntimeError):
        pass
    finally:
        if member is None:
            await rooms.detach_tv(room, ws)
        else:
            await rooms.detach_controller(room, ws)
