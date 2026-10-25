// Persists the playback session across refreshes: current song + position,
// output volume, and the play queue. Each slice gets its own key so a corrupt
// or half-written entry can only cost you that one thing.
//
// The session and queue hold song ids from one user's library, so they're
// scoped per account; volume is a property of the device and stays shared.

import type { PlaybackContext, QueueEntry } from "../hooks/usePlaybackQueue";

const SESSION_KEY = "playback-session";
const VOLUME_KEY = "audio-volume";
const QUEUE_KEY = "playback-queue";

let scope: string | null = null;

const scoped = (key: string) => (scope ? `${key}:${scope}` : key);

/**
 * Point session/queue persistence at one user. Call before the app mounts.
 * Entries written before accounts existed are handed to whoever signs in
 * first, so an upgrade doesn't lose the last song.
 */
export function setSessionScope(userId: string) {
  scope = userId;
  for (const key of [SESSION_KEY, QUEUE_KEY]) {
    try {
      const legacy = localStorage.getItem(key);
      if (legacy === null) continue;
      if (localStorage.getItem(scoped(key)) === null) localStorage.setItem(scoped(key), legacy);
      localStorage.removeItem(key);
    } catch {
      // storage unavailable — nothing to migrate
    }
  }
}

export type PlaybackSession = {
  youtubeUrl: string;
  time: number;
};

export function loadPlaybackSession(): PlaybackSession | null {
  try {
    const raw = localStorage.getItem(scoped(SESSION_KEY));
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
    localStorage.setItem(scoped(SESSION_KEY), JSON.stringify(session));
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
  shuffle: boolean;
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((id) => typeof id === "string");

function parseContext(value: unknown): PlaybackContext | null {
  const c = value as PlaybackContext | null;
  if (
    !c ||
    typeof c.playlistId !== "string" ||
    typeof c.playlistName !== "string" ||
    !isStringArray(c.songIds) ||
    typeof c.index !== "number"
  )
    return null;

  // shuffleOrder arrived after shuffle did: sessions written before it are
  // still perfectly good playlists, so restore them in playlist order rather
  // than throwing the context away.
  return { ...c, shuffleOrder: isStringArray(c.shuffleOrder) ? c.shuffleOrder : null };
}

export function loadQueueSession(): QueueSession | null {
  try {
    const raw = localStorage.getItem(scoped(QUEUE_KEY));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const queue: QueueEntry[] = Array.isArray(parsed?.queue)
      ? parsed.queue.filter(
          (e: QueueEntry) =>
            typeof e?.uid === "string" && typeof e?.songId === "string",
        )
      : [];
    return {
      context: parseContext(parsed?.context),
      queue,
      shuffle: parsed?.shuffle === true,
    };
  } catch {
    return null;
  }
}

export function saveQueueSession(session: QueueSession) {
  try {
    localStorage.setItem(scoped(QUEUE_KEY), JSON.stringify(session));
  } catch {
    // storage full/unavailable — the queue just won't survive a refresh
  }
}
