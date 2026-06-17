import { useEffect, useState, useCallback } from "react";
import type { SavedSong } from "../components/SavedSongs";
import { savedSongsService } from "../services/savedSongsService";

export function useSavedSongs() {
  const [savedSongs, setSavedSongs] = useState<SavedSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null);

  const fetchSongs = useCallback(async () => {
    setLoading(true);

    try {
      const data = await savedSongsService.getAll();
      setSavedSongs(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSongs();
  }, [fetchSongs]);

  async function deleteSong(id: string) {
    await savedSongsService.delete(id);
    setSavedSongs((prev) => prev.filter((s) => s.id !== id));
  }

  async function startReanalyze(song: SavedSong): Promise<{ job_id: string; youtube_url: string } | null> {
    setReanalyzingId(song.id);
    try {
      return await savedSongsService.reanalyze(song.id);
    } catch {
      setReanalyzingId(null);
      return null;
    }
  }

  function clearReanalyzingId() {
    setReanalyzingId(null);
  }

  return {
    savedSongs,
    loading,
    reanalyzingId,
    deleteSong,
    startReanalyze,
    clearReanalyzingId,
    refresh: fetchSongs,
  };
}
