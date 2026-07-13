// Persists the playback session (current song + position) across refreshes.

const SESSION_KEY = "playback-session";

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
