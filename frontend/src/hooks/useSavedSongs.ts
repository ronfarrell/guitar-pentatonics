import { useEffect, useState, useCallback } from "react";
import type { SavedSong } from "../components/SavedSongs";
import { savedSongsService } from "../services/savedSongsService";

export function useSavedSongs() {
  const [savedSongs, setSavedSongs] = useState<SavedSong[]>([]);
  const [loading, setLoading] = useState(true);

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

  return {
    savedSongs,
    loading,
    deleteSong,
    refresh: fetchSongs,
  };
}
