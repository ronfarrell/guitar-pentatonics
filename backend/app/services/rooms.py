"""Party rooms: one TV playing, any number of phones controlling it.

The server owns the room's state — queue, what's playing, display settings —
and pushes a fresh snapshot to everyone whenever it changes. The TV is the
only thing that actually plays; it carries out transport commands and reports
its playhead back, which the server relays to the phones.

Live rooms are held in memory (they own sockets), and every state change is
also written to the DB — so a backend restart, or a dev --reload, is a
reconnect blip: the next socket or request for that room restores it.
Everything here runs on the one event loop, so no locking is needed.
"""
import asyncio
import json
import logging
import secrets
import time
from dataclasses import asdict, dataclass, field

from fastapi import WebSocket

from app.services import storage
from app.services.background import spawn

logger = logging.getLogger(__name__)

# How long a room survives without its TV — long enough to reload the page or
# reconnect after a Wi-Fi blip, short enough that abandoned rooms go away.
TV_GRACE_SECONDS = 10 * 60

# A saved room nobody has touched in this long isn't coming back.
STALE_ROOM_HOURS = 12

# Pressing "previous" this far into a song restarts it instead.
RESTART_THRESHOLD = 3.0

MAX_QUEUE = 200

VIEWS = ("video", "visualizer")
VIZ_MODES = ("orbit", "spectrum", "ribbon", "retro", "classic", "bounce")
FRET_MODES = ("song", "live")

DEFAULT_DISPLAY = {
    "view": "video",
    "viz_mode": "orbit",
    "show_fretboard": True,
    "show_chords": True,
    "fret_mode": "song",
    "scale_type": "Major Pentatonic",
    "show_triads": False,
}


@dataclass
class Member:
    id: str
    name: str
    user_id: int | None  # None for guests

    def public(self) -> dict:
        return {"id": self.id, "name": self.name, "guest": self.user_id is None}


@dataclass
class Entry:
    uid: str
    url_hash: str
    youtube_url: str
    title: str
    key: str
    added_by: str  # display name, frozen at queue time
    added_by_id: str  # member id

    def public(self) -> dict:
        return {
            "uid": self.uid,
            "url_hash": self.url_hash,
            "title": self.title,
            "key": self.key,
            "added_by": self.added_by,
            "added_by_id": self.added_by_id,
        }


@dataclass
class Room:
    id: str
    owner_id: int
    owner_name: str
    queue: list[Entry] = field(default_factory=list)
    now: Entry | None = None
    history: list[Entry] = field(default_factory=list)
    display: dict = field(default_factory=lambda: dict(DEFAULT_DISPLAY))
    playback: dict = field(
        default_factory=lambda: {"playing": False, "position": 0.0, "duration": 0.0, "volume": 1.0}
    )
    tv: WebSocket | None = None
    controllers: dict[WebSocket, Member] = field(default_factory=dict)
    closing: asyncio.Task | None = None

    def snapshot(self) -> dict:
        return {
            "room_id": self.id,
            "owner": self.owner_name,
            "tv_connected": self.tv is not None,
            "now_playing": self.now.public() if self.now else None,
            "queue": [e.public() for e in self.queue],
            "has_history": bool(self.history),
            "display": self.display,
            "playback": self.playback,
            "members": [m.public() for m in self.controllers.values()],
        }

    def find_entry(self, url_hash: str) -> Entry | None:
        for entry in [self.now, *self.queue, *self.history]:
            if entry and entry.url_hash == url_hash:
                return entry
        return None


_rooms: dict[str, Room] = {}


def _uid() -> str:
    return secrets.token_hex(6)


# ---------------------------------------------------------------- persistence


def _save(room: Room) -> None:
    state = json.dumps({
        "queue": [asdict(e) for e in room.queue],
        "now": asdict(room.now) if room.now else None,
        "history": [asdict(e) for e in room.history],
        "display": room.display,
    })
    conn = storage._get_db_connection()
    conn.execute(
        """
        INSERT INTO rooms (id, owner_id, owner_name, state, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = CURRENT_TIMESTAMP
        """,
        (room.id, room.owner_id, room.owner_name, state),
    )
    conn.close()


def _forget(room_id: str) -> None:
    conn = storage._get_db_connection()
    conn.execute("DELETE FROM rooms WHERE id = ?", (room_id,))
    conn.close()


def _restore(room_id: str) -> Room | None:
    """Rebuild a room from the DB after a restart. Sockets reattach themselves."""
    storage.init_db()
    conn = storage._get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        f"DELETE FROM rooms WHERE updated_at < datetime('now', '-{STALE_ROOM_HOURS} hours')"
    )
    cursor.execute("SELECT owner_id, owner_name, state FROM rooms WHERE id = ?", (room_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None

    try:
        state = json.loads(row[2])
        room = Room(
            id=room_id,
            owner_id=row[0],
            owner_name=row[1],
            queue=[Entry(**e) for e in state.get("queue", [])],
            now=Entry(**state["now"]) if state.get("now") else None,
            history=[Entry(**e) for e in state.get("history", [])],
            display={**DEFAULT_DISPLAY, **state.get("display", {})},
        )
    except (ValueError, TypeError, KeyError):
        logger.warning(f"[ROOM] {room_id}: saved state unreadable, dropping it")
        _forget(room_id)
        return None

    logger.info(f"[ROOM] {room_id} restored from the DB")
    return room


# ------------------------------------------------------------------ lifecycle


async def create_room(owner: dict) -> Room:
    """Open a room for `owner`, closing any room they already had.

    The id is the room's only secret — it's what the QR code carries — so it's
    long enough that nobody stumbles into a room by guessing.
    """
    for old in [r for r in _rooms.values() if r.owner_id == owner["id"]]:
        await close_room(old.id, "The TV started a new session.")
    # Saved rooms from before a restart that nobody reconnected to.
    conn = storage._get_db_connection()
    conn.execute("DELETE FROM rooms WHERE owner_id = ?", (owner["id"],))
    conn.close()

    room = Room(id=secrets.token_urlsafe(9), owner_id=owner["id"], owner_name=owner["display_name"])
    _rooms[room.id] = room
    _save(room)
    logger.info(f"[ROOM] {room.id} opened by user {owner['id']}")
    return room


def get_room(room_id: str) -> Room | None:
    room = _rooms.get(room_id)
    if room is None:
        room = _restore(room_id)
        if room is not None:
            _rooms[room_id] = room
    return room


async def close_room(room_id: str, reason: str = "The TV ended the session.") -> None:
    _forget(room_id)
    room = _rooms.pop(room_id, None)
    if room is None:
        return

    if room.closing and room.closing is not asyncio.current_task():
        room.closing.cancel()

    sockets = list(room.controllers) + ([room.tv] if room.tv else [])
    for ws in sockets:
        try:
            await ws.send_json({"type": "closed", "reason": reason})
            await ws.close()
        except Exception:
            pass  # already gone

    logger.info(f"[ROOM] {room_id} closed: {reason}")


async def _close_after_grace(room_id: str) -> None:
    await asyncio.sleep(TV_GRACE_SECONDS)
    room = _rooms.get(room_id)
    if room and room.tv is None:
        await close_room(room_id, "The TV went away.")


# ------------------------------------------------------------------- connect


async def attach_tv(room: Room, ws: WebSocket) -> None:
    """Connect the TV. A second TV tab replaces the first rather than fighting it."""
    if room.tv is not None and room.tv is not ws:
        try:
            await room.tv.send_json({"type": "closed", "reason": "This session was opened on another screen."})
            await room.tv.close()
        except Exception:
            pass

    room.tv = ws
    if room.closing:
        room.closing.cancel()
        room.closing = None
    await broadcast(room)


async def detach_tv(room: Room, ws: WebSocket) -> None:
    if room.tv is not ws:
        return
    room.tv = None
    room.playback = {**room.playback, "playing": False}
    if room.id in _rooms:
        room.closing = spawn(_close_after_grace(room.id), f"room-grace:{room.id}")
        await broadcast(room)


async def attach_controller(room: Room, ws: WebSocket, user: dict | None, guest_name: str | None) -> Member:
    if user:
        member = Member(id=f"u{user['id']}-{_uid()}", name=user["display_name"], user_id=user["id"])
    else:
        member = Member(id=f"g-{_uid()}", name=guest_name or "Guest", user_id=None)

    room.controllers[ws] = member
    logger.info(f"[ROOM] {room.id}: {member.name} joined")
    await broadcast(room)
    return member


async def detach_controller(room: Room, ws: WebSocket) -> None:
    member = room.controllers.pop(ws, None)
    if member and room.id in _rooms:
        await broadcast(room)


# ------------------------------------------------------------------ messaging


async def _send(ws: WebSocket, message: dict) -> None:
    try:
        await ws.send_json(message)
    except Exception:
        pass  # the socket's own handler will clean up after it


async def broadcast(room: Room) -> None:
    """Push the new state to everyone. Every state change ends here, so this
    is also where it's saved."""
    if room.id in _rooms:
        _save(room)
    message = {"type": "state", "state": room.snapshot()}
    for ws in [*room.controllers, *([room.tv] if room.tv else [])]:
        await _send(ws, message)


async def _notify(room: Room, text: str) -> None:
    """A transient line the TV shows on screen, e.g. 'Bob queued Hotel California'."""
    if room.tv:
        await _send(room.tv, {"type": "notice", "text": text})


async def _command_tv(room: Room, action: str, value: float | None = None) -> None:
    if room.tv:
        await _send(room.tv, {"type": "command", "action": action, "value": value})


async def _advance(room: Room) -> None:
    """Move to the next queued song (or stop, if there isn't one)."""
    if room.now:
        room.history.append(room.now)
        room.history = room.history[-50:]
    room.now = room.queue.pop(0) if room.queue else None
    room.playback = {**room.playback, "playing": room.now is not None, "position": 0.0, "duration": 0.0}
    await broadcast(room)


async def _go_back(room: Room) -> None:
    if room.playback["position"] > RESTART_THRESHOLD or not room.history:
        await _command_tv(room, "seek", 0.0)
        return
    if room.now:
        room.queue.insert(0, room.now)
    room.now = room.history.pop()
    room.playback = {**room.playback, "playing": True, "position": 0.0, "duration": 0.0}
    await broadcast(room)


def _clean_display_patch(patch: dict) -> dict:
    """Keep only known display keys with sane values; ignore the rest."""
    clean = {}
    for key, value in (patch or {}).items():
        if key == "view" and value in VIEWS:
            clean[key] = value
        elif key == "viz_mode" and value in VIZ_MODES:
            clean[key] = value
        elif key == "fret_mode" and value in FRET_MODES:
            clean[key] = value
        elif key in ("show_fretboard", "show_chords", "show_triads") and isinstance(value, bool):
            clean[key] = value
        # The TV validates against its own scale list; here it just has to be small.
        elif key == "scale_type" and isinstance(value, str) and 0 < len(value) <= 40:
            clean[key] = value
    return clean


async def _queue_songs(room: Room, member: Member, song_ids: list, play_next: bool) -> None:
    if member.user_id is None:
        return  # guests have no library to queue from

    entries = []
    for song_id in song_ids[:MAX_QUEUE]:
        if not isinstance(song_id, int):
            continue
        song = storage.get_library_song(member.user_id, song_id)
        if song is None:
            continue
        entries.append(
            Entry(
                uid=_uid(),
                url_hash=song["url_hash"],
                youtube_url=song["youtube_url"],
                title=song["title"],
                key=song["key"],
                added_by=member.name,
                added_by_id=member.id,
            )
        )

    room_left = MAX_QUEUE - len(room.queue)
    entries = entries[:max(0, room_left)]
    if not entries:
        return

    if play_next:
        room.queue[0:0] = entries
    else:
        room.queue.extend(entries)

    if len(entries) == 1:
        await _notify(room, f"{member.name} queued {entries[0].title}")
    else:
        await _notify(room, f"{member.name} queued {len(entries)} songs")

    # An idle TV starts on the first thing anyone queues.
    if room.now is None:
        await _advance(room)
    else:
        await broadcast(room)


async def handle_controller(room: Room, member: Member, msg: dict) -> None:
    """Apply one command from a phone. Everyone in the room has equal say."""
    kind = msg.get("type")

    if kind == "queue_add":
        await _queue_songs(room, member, msg.get("song_ids") or [], bool(msg.get("next")))

    elif kind == "queue_remove":
        room.queue = [e for e in room.queue if e.uid != msg.get("uid")]
        await broadcast(room)

    elif kind == "queue_move":
        idx = next((i for i, e in enumerate(room.queue) if e.uid == msg.get("uid")), None)
        to = msg.get("to")
        if idx is not None and isinstance(to, int):
            entry = room.queue.pop(idx)
            room.queue.insert(max(0, min(to, len(room.queue))), entry)
            await broadcast(room)

    elif kind == "queue_clear":
        room.queue = []
        await broadcast(room)

    elif kind == "transport":
        action = msg.get("action")
        if action == "next":
            await _advance(room)
        elif action == "prev":
            await _go_back(room)
        elif action in ("play", "pause", "toggle"):
            await _command_tv(room, action)
        elif action in ("seek", "volume") and isinstance(msg.get("value"), (int, float)):
            await _command_tv(room, action, float(msg["value"]))

    elif kind == "display":
        patch = _clean_display_patch(msg.get("patch"))
        if patch:
            room.display = {**room.display, **patch}
            await broadcast(room)


async def handle_tv(room: Room, msg: dict) -> None:
    kind = msg.get("type")

    if kind == "playback":
        # Playhead reports arrive about once a second; only the phones need them,
        # and as a small message rather than a whole-state rebroadcast.
        report = {
            "playing": bool(msg.get("playing")),
            "position": float(msg.get("position") or 0),
            "duration": float(msg.get("duration") or 0),
            "volume": float(msg.get("volume") if msg.get("volume") is not None else 1),
            "at": time.time(),
        }
        room.playback = report
        for ws in list(room.controllers):
            await _send(ws, {"type": "playback", "playback": report})

    elif kind == "ended":
        # Only advance for the song that's actually current — a late "ended"
        # from a song someone already skipped must not skip the next one too.
        if room.now and msg.get("uid") == room.now.uid:
            await _advance(room)

    elif kind == "unplayable":
        if room.now and msg.get("uid") == room.now.uid:
            await _notify(room, f"Couldn't play {room.now.title} — skipping")
            await _advance(room)
