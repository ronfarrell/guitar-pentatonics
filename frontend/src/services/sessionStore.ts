// Persists the playback session across refreshes: current song + position,
// output volume, and the play queue. Each slice gets its own key so a corrupt
// or half-written entry can only cost you that one thing.

import type { PlaybackContext, QueueEntry } from "../hooks/usePlaybackQueue";

const SESSION_KEY = "playback-session";
const VOLUME_KEY = "audio-volume";
const QUEUE_KEY = "playback-queue";

export type PlaybackSession = {
  youtubeUrl: string;
  time: number;
};

export function loadPlaybackSession(): PlaybackSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.youtubeUrl === "string" &&
      typeof parsed?.time === "number"
    )
      return parsed;
  } catch {
    // corrupted entry — ignore
  }
  return null;
}

export function savePlaybackSession(session: PlaybackSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // storage full/unavailable — playback still works without persistence
  }
}


/* ---------------------------------------------------------------- volume */

export const DEFAULT_VOLUME = 0.5;

export function loadVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null) return DEFAULT_VOLUME;
    const level = Number(raw);
    // A stored NaN would silently mute playback with no way back but devtools.
    if (!Number.isFinite(level)) return DEFAULT_VOLUME;
    return Math.min(1, Math.max(0, level));
  } catch {
    return DEFAULT_VOLUME;
  }
}

// Dragging the slider fires a change per pixel; coalesce them into one write.
let volumeTimer: ReturnType<typeof setTimeout> | null = null;

export function saveVolume(level: number) {
  if (volumeTimer) clearTimeout(volumeTimer);
  volumeTimer = setTimeout(() => {
    volumeTimer = null;
    try {
      localStorage.setItem(VOLUME_KEY, String(level));
    } catch {
      // storage full/unavailable — playback still works without persistence
    }
  }, 200);
}

/* ----------------------------------------------------------------- queue */

export type QueueSession = {
  context: PlaybackContext | null;
  queue: QueueEntry[];
};

function isContext(value: unknown): value is PlaybackContext {
  const c = value as PlaybackContext | null;
  return (
    !!c &&
    typeof c.playlistId === "string" &&
    typeof c.playlistName === "string" &&
    Array.isArray(c.songIds) &&
    c.songIds.every((id) => typeof id === "string") &&
    typeof c.index === "number"
  );
}

export function loadQueueSession(): QueueSession | null {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const queue: QueueEntry[] = Array.isArray(parsed?.queue)
      ? parsed.queue.filter(
          (e: QueueEntry) =>
            typeof e?.uid === "string" && typeof e?.songId === "string",
        )
      : [];
    return { context: isContext(parsed?.context) ? parsed.context : null, queue };
  } catch {
    return null;
  }
}

export function saveQueueSession(session: QueueSession) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(session));
  } catch {
    // storage full/unavailable — the queue just won't survive a refresh
  }
}
