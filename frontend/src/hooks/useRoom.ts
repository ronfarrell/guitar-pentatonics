import { useCallback, useEffect, useRef, useState } from "react";
import {
  wsUrl,
  type RoomMember,
  type RoomPlayback,
  type RoomState,
} from "../services/api";

/**
 * One live connection to a party room, shared by the TV and the phones.
 *
 * The server pushes a full `state` snapshot on every change, plus a small
 * `playback` message for the playhead. Drops (Wi-Fi blips, a phone locking)
 * reconnect on their own; only an explicit close from the server — the
 * session ended, or this socket was refused — stops trying.
 */

export type Hello =
  | { role: "tv"; token: string }
  | { role: "controller"; token: string; guest_name?: undefined }
  | { role: "controller"; guest_name: string; token?: undefined };

export type TvCommand = {
  action: "play" | "pause" | "toggle" | "seek" | "volume";
  value: number | null;
};

type Handlers = {
  onCommand?: (command: TvCommand) => void;
  onNotice?: (text: string) => void;
};

export type RoomStatus = "connecting" | "open" | "reconnecting" | "closed";

/** Playhead as last reported, stamped with when *we* received it. */
export type LivePlayback = RoomPlayback & { receivedAt: number };

export function useRoom(roomId: string | null, hello: Hello | null, handlers: Handlers = {}) {
  const [state, setState] = useState<RoomState | null>(null);
  const [playback, setPlayback] = useState<LivePlayback | null>(null);
  const [status, setStatus] = useState<RoomStatus>("connecting");
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const [me, setMe] = useState<RoomMember | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  // Stable across renders: hello is an object literal at most call sites.
  const helloKey = hello ? JSON.stringify(hello) : null;

  useEffect(() => {
    if (!roomId || !helloKey) return;

    let stopped = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const ws = new WebSocket(wsUrl(`/rooms/${encodeURIComponent(roomId)}/ws`));
      socketRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        ws.send(helloKey);
        setStatus("open");
      };

      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case "state":
            setState(msg.state);
            setPlayback((prev) => prev ?? { ...msg.state.playback, receivedAt: Date.now() });
            break;
          case "playback":
            setPlayback({ ...msg.playback, receivedAt: Date.now() });
            break;
          case "welcome":
            setMe(msg.member);
            break;
          case "command":
            handlersRef.current.onCommand?.(msg);
            break;
          case "notice":
            handlersRef.current.onNotice?.(msg.text);
            break;
          case "closed":
          case "error":
            stopped = true;
            setClosedReason(msg.reason ?? "Disconnected.");
            setStatus("closed");
            break;
        }
      };

      ws.onclose = () => {
        if (socketRef.current === ws) socketRef.current = null;
        if (stopped) return;
        setStatus("reconnecting");
        // 0.5s, 1s, 2s … capped at 8s.
        const delay = Math.min(8000, 500 * 2 ** attempt++);
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [roomId, helloKey]);

  const send = useCallback((message: Record<string, unknown>) => {
    const ws = socketRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }, []);

  return { state, playback, status, closedReason, me, send };
}

/** Where the playhead is now, extrapolating from the last report while playing. */
export function livePosition(playback: LivePlayback | null, now: number): number {
  if (!playback) return 0;
  const elapsed = playback.playing ? (now - playback.receivedAt) / 1000 : 0;
  const position = playback.position + elapsed;
  return playback.duration > 0 ? Math.min(position, playback.duration) : position;
}
