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

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const savedSongsService = {
  async getAll(): Promise<SavedSong[]> {
    const res = await fetch(`${API_BASE_URL}/songs`);

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
    const res = await fetch(`${API_BASE_URL}/songs/${id}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      throw new Error(`Failed to delete song: ${res.status}`);
    }
  },
};
