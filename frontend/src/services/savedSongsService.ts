import { authHeaders, notifyUnauthorized } from "./authToken";
import { API_BASE_URL } from "./api";

type ApiSong = {
  id: number;
  youtube_url: string;
  video_title: string | null;
  key: string;
};

export type SavedSong = {
  id: string;
  title: string;
  youtubeUrl: string;
  key: string;
  createdAt?: string;
};


async function authedFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { ...authHeaders(), ...init?.headers } });
  if (res.status === 401) notifyUnauthorized();
  return res;
}

export const savedSongsService = {
  async getAll(): Promise<SavedSong[]> {
    const res = await authedFetch(`${API_BASE_URL}/songs`);

    if (!res.ok) {
      throw new Error(`Failed to fetch songs: ${res.status}`);
    }

    const data = await res.json();

    // defensive fallback in case backend shape changes
    const songs: ApiSong[] = data?.songs ?? [];

    return songs.map((song) => ({
      id: String(song.id),
      title: song.video_title ?? "Untitled",
      youtubeUrl: song.youtube_url,
      key: song.key,
    }));
  },

  async delete(id: string): Promise<void> {
    const res = await authedFetch(`${API_BASE_URL}/songs/${id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      throw new Error(`Failed to delete song: ${res.status}`);
    }
  },

  async reanalyze(id: string): Promise<{ job_id: string; youtube_url: string }> {
    const res = await authedFetch(`${API_BASE_URL}/songs/${id}/reanalyze`, {
      method: "POST",
    });

    if (!res.ok) {
      throw new Error(`Failed to start reanalysis: ${res.status}`);
    }

    return res.json();
  },
};
