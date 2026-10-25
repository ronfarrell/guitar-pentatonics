import { authHeaders, notifyUnauthorized } from './authToken';

// Environment configuration
// Empty string = relative URLs, used in Docker where nginx proxies API routes to the backend.
// Falls back to localhost:8000 for local dev without a .env.local file.
const CONFIGURED_API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * A build pointed at "localhost" is right on the machine running it and wrong
 * everywhere else: a phone that scanned the TV's QR code would go looking for
 * a server on itself. When the page is being viewed from another device, keep
 * the configured port but swap in the host the page itself came from.
 */
function resolveApiBase(configured: string): string {
  if (!configured || typeof window === 'undefined') return configured;
  try {
    const url = new URL(configured);
    if (LOOPBACK.has(url.hostname) && !LOOPBACK.has(window.location.hostname)) {
      url.hostname = window.location.hostname;
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return configured;
  }
}

export const API_BASE_URL = resolveApiBase(CONFIGURED_API_BASE_URL);

/** URL for a cached media file the backend serves (`kind` = audio | video). */
export const mediaUrl = (kind: 'audio' | 'video', path: string) =>
  `${API_BASE_URL}/analysis/${kind}/${path}`;

/** The same server over WebSocket: http→ws, https→wss, relative→this origin. */
export function wsUrl(path: string): string {
  const base = API_BASE_URL || window.location.origin;
  return base.replace(/^http/, 'ws') + path;
}

// Response types (shared with backend responses)
export type HealthResponse = {
  status: string;
};

export type AnalysisDemoResponse = {
  key: string;
  chords: Array<{ start: number; end: number; chord: string }>;
  audio_path?: string;
  video_path?: string;
  instrumental_path?: string;
  stems?: Record<string, string>;
  video_title?: string;
};

export type YouTubeSearchResult = {
  video_id: string;
  title: string;
  channel: string;
  duration: number | null;
  view_count: number | null;
  thumbnail: string;
  url: string;
};

export type YouTubeSearchResponse = {
  query: string;
  results: YouTubeSearchResult[];
};

export type ApiPlaylist = {
  id: number;
  name: string;
  created_at: string | null;
  song_ids: number[];
};

export type ApiUser = {
  id: number;
  username: string;
  display_name: string;
  created_at: string | null;
};

export type AuthResponse = {
  token: string;
  user: ApiUser;
};

export type RoomEntry = {
  uid: string;
  url_hash: string;
  title: string;
  key: string;
  added_by: string;
  added_by_id: string;
};

export type RoomDisplay = {
  view: 'video' | 'visualizer';
  viz_mode: string;
  show_fretboard: boolean;
  show_chords: boolean;
  fret_mode: 'song' | 'live';
  scale_type: string;
  show_triads: boolean;
};

export type RoomPlayback = {
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  /** Server time (seconds) the report arrived, for extrapolating the playhead. */
  at?: number;
};

export type RoomMember = { id: string; name: string; guest: boolean };

export type RoomState = {
  room_id: string;
  owner: string;
  tv_connected: boolean;
  now_playing: RoomEntry | null;
  queue: RoomEntry[];
  has_history: boolean;
  display: RoomDisplay;
  playback: RoomPlayback;
  members: RoomMember[];
};

export type InstrumentalStartResponse = {
  status: 'completed' | 'processing';
  job_id?: string;
  instrumental_path?: string;
};

export type StemsStartResponse = {
  status: 'completed' | 'processing';
  job_id?: string;
  stems?: Record<string, string>;
};

// API error handling
export class APIError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'APIError';
    this.status = status;
  }
}

/** Pull FastAPI's `detail` out of an error body, falling back to something readable. */
export function apiErrorMessage(err: unknown): string {
  if (!(err instanceof APIError)) return 'Something went wrong.';
  if (err.status === 0) return "Can't reach the server.";
  try {
    const detail = JSON.parse(err.message)?.detail;
    if (typeof detail === 'string') return detail;
    // 422 validation errors: a list of {loc, msg}
    if (Array.isArray(detail) && detail[0]) {
      const field = detail[0].loc?.at(-1);
      if (field === 'username')
        return 'Username must be 3–32 characters: letters, numbers, . _ -';
      if (field === 'password' || field === 'new_password')
        return 'Password must be at least 6 characters.';
      return detail[0].msg ?? 'Invalid input.';
    }
  } catch {
    // not JSON
  }
  return err.message;
}

// Generic fetch wrapper
async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...options?.headers,
      },
    });

    // A 401 from login/register is just a bad password; anywhere else it
    // means the session is gone and the app should drop back to sign-in.
    if (response.status === 401 && !endpoint.startsWith('/auth/login')) {
      notifyUnauthorized();
    }

    if (!response.ok) {
      const error = await response.text();
      throw new APIError(response.status, error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    if (err instanceof APIError) throw err;
    // Aborted requests (superseded search keystrokes) are not failures —
    // let callers detect and ignore them.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new APIError(0, `Failed to reach API: ${err}`);
  }
}

// API methods
export const api = {
  health: {
    check: () => fetchAPI<HealthResponse>('/health/'),
  },
  auth: {
    register: (username: string, password: string, displayName?: string) =>
      fetchAPI<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, display_name: displayName || null }),
      }),
    login: (username: string, password: string) =>
      fetchAPI<AuthResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    logout: () => fetchAPI<{ status: string }>('/auth/logout', { method: 'POST' }),
    me: () => fetchAPI<ApiUser>('/auth/me'),
    updateProfile: (displayName: string) =>
      fetchAPI<ApiUser>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ display_name: displayName }),
      }),
    changePassword: (currentPassword: string, newPassword: string) =>
      fetchAPI<{ status: string }>('/auth/me/password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      }),
  },
  search: {
    youtube: (query: string, limit = 10, signal?: AbortSignal) =>
      fetchAPI<YouTubeSearchResponse>(
        `/search/?q=${encodeURIComponent(query)}&limit=${limit}`,
        { signal }
      ),
  },
  analysis: {
    demo: () => fetchAPI<AnalysisDemoResponse>('/analysis/demo'),
    analyze: (youtubeUrl: string) =>
      fetchAPI<AnalysisDemoResponse>('/analysis', {
        method: 'POST',
        body: JSON.stringify({ youtube_url: youtubeUrl }),
      }),
    startAnalysis: (youtubeUrl: string) =>
      fetchAPI<{ job_id: string }>('/analysis/start', {
        method: 'POST',
        body: JSON.stringify({ youtube_url: youtubeUrl }),
      }),
    getProgress: (jobId: string) =>
      fetchAPI<{
        status: string;
        percentage: number;
        message: string;
        started_at: string;
        completed_at: string | null;
      }>(`/analysis/progress/${jobId}`),
    streamProgress: (jobId: string) => {
      const baseUrl = API_BASE_URL.replace(/\/$/, '');
      return new EventSource(`${baseUrl}/analysis/stream/${jobId}`);
    },
    startInstrumental: (youtubeUrl: string) =>
      fetchAPI<InstrumentalStartResponse>('/analysis/instrumental/start', {
        method: 'POST',
        body: JSON.stringify({ youtube_url: youtubeUrl }),
      }),
    startStems: (youtubeUrl: string) =>
      fetchAPI<StemsStartResponse>('/analysis/stems/start', {
        method: 'POST',
        body: JSON.stringify({ youtube_url: youtubeUrl }),
      }),
    startGuitarSplit: (youtubeUrl: string) =>
      fetchAPI<StemsStartResponse>('/analysis/guitar-split/start', {
        method: 'POST',
        body: JSON.stringify({ youtube_url: youtubeUrl }),
      }),
  },
  rooms: {
    create: () => fetchAPI<{ room_id: string }>('/rooms', { method: 'POST' }),
    info: (roomId: string) =>
      fetchAPI<{ room_id: string; owner: string; tv_connected: boolean }>(
        `/rooms/${encodeURIComponent(roomId)}`
      ),
    end: (roomId: string) =>
      fetchAPI<{ status: string }>(`/rooms/${encodeURIComponent(roomId)}`, { method: 'DELETE' }),
    song: (roomId: string, urlHash: string) =>
      fetchAPI<AnalysisDemoResponse>(
        `/rooms/${encodeURIComponent(roomId)}/songs/${encodeURIComponent(urlHash)}`
      ),
    network: () =>
      fetchAPI<{
        base_url: string | null;
        source: string;
        /** 'wsl-nat': the address is right, but WSL isn't letting the LAN in yet. */
        warning: string | null;
      }>('/rooms/network'),
  },
  playlists: {
    list: () => fetchAPI<{ playlists: ApiPlaylist[] }>('/playlists'),
    create: (name: string) =>
      fetchAPI<ApiPlaylist>('/playlists', {
        method: 'POST',
        body: JSON.stringify({ name }),
      }),
    rename: (id: number, name: string) =>
      fetchAPI<ApiPlaylist>(`/playlists/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),
    remove: (id: number) =>
      fetchAPI<{ status: string; id: number }>(`/playlists/${id}`, {
        method: 'DELETE',
      }),
    addSong: (id: number, songId: number) =>
      fetchAPI<ApiPlaylist>(`/playlists/${id}/songs`, {
        method: 'POST',
        body: JSON.stringify({ song_id: songId }),
      }),
    removeSong: (id: number, songId: number) =>
      fetchAPI<ApiPlaylist>(`/playlists/${id}/songs/${songId}`, {
        method: 'DELETE',
      }),
    removeSongEverywhere: (songId: number) =>
      fetchAPI<{ status: string; song_id: number }>(`/playlists/songs/${songId}`, {
        method: 'DELETE',
      }),
    reorder: (id: number, songIds: number[]) =>
      fetchAPI<ApiPlaylist>(`/playlists/${id}/songs`, {
        method: 'PUT',
        body: JSON.stringify({ song_ids: songIds }),
      }),
  },
};
