import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ApiPlaylist } from "../services/api";

export type Playlist = {
  id: string;
  name: string;
  songIds: string[];
};

// Legacy per-browser storage. Playlists now live in the backend DB; this key is
// only read once, to migrate whatever a browser already had, then retired.
const LEGACY_STORAGE_KEY = "guitar-playlists";
const MIGRATED_KEY = "guitar-playlists-migrated";

function toPlaylist(p: ApiPlaylist): Playlist {
  return { id: String(p.id), name: p.name, songIds: p.song_ids.map(String) };
}

function loadLegacy(): Playlist[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Push a browser's old localStorage playlists into the backend, once.
 * Songs that no longer exist (deleted, or reanalyzed into a new id since the
 * playlist was written) are skipped rather than failing the whole migration.
 */
async function migrateLegacyPlaylists(): Promise<boolean> {
  const legacy = loadLegacy();
  if (legacy.length === 0) return false;

  for (const old of legacy) {
    try {
      const created = await api.playlists.create(old.name || "Untitled");
      for (const songId of old.songIds ?? []) {
        const numeric = Number(songId);
        if (!Number.isFinite(numeric)) continue;
        try {
          await api.playlists.addSong(created.id, numeric);
        } catch {
          // song is gone — drop it from the migrated playlist
        }
      }
    } catch {
      // playlist creation failed; skip it and keep going
    }
  }

  return true;
}

export function usePlaylistStore() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const migrationRan = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const { playlists: rows } = await api.playlists.list();
      setPlaylists(rows.map(toPlaylist));
      setError(null);
      return rows.map(toPlaylist);
    } catch {
      setError("Couldn't reach the server — playlists may be out of date.");
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const rows = await refresh();

      // Migrate a browser's legacy localStorage playlists the first time it
      // talks to a backend that has none of its own.
      if (
        !cancelled &&
        !migrationRan.current &&
        rows !== null &&
        rows.length === 0 &&
        !localStorage.getItem(MIGRATED_KEY)
      ) {
        migrationRan.current = true;
        const migrated = await migrateLegacyPlaylists();
        localStorage.setItem(MIGRATED_KEY, "1");
        if (migrated && !cancelled) await refresh();
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  /** Apply an optimistic local change, then reconcile with the server. */
  const commit = useCallback(
    async (optimistic: (prev: Playlist[]) => Playlist[], request: () => Promise<unknown>) => {
      setPlaylists(optimistic);
      try {
        await request();
        setError(null);
      } catch {
        setError("That change didn't save — reloading playlists.");
        await refresh();
      }
    },
    [refresh],
  );

  const createPlaylist = useCallback(async (name: string): Promise<string | null> => {
    try {
      const created = await api.playlists.create(name);
      setPlaylists((prev) => [...prev, toPlaylist(created)]);
      setError(null);
      return String(created.id);
    } catch {
      setError("Couldn't create the playlist.");
      return null;
    }
  }, []);

  const deletePlaylist = useCallback(
    (id: string) =>
      commit(
        (prev) => prev.filter((p) => p.id !== id),
        () => api.playlists.remove(Number(id)),
      ),
    [commit],
  );

  const renamePlaylist = useCallback(
    (id: string, name: string) =>
      commit(
        (prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)),
        () => api.playlists.rename(Number(id), name),
      ),
    [commit],
  );

  const addSong = useCallback(
    (playlistId: string, songId: string) =>
      commit(
        // A song lives in exactly one playlist — mirror the server's exclusive
        // add by pulling it out of the others locally too.
        (prev) =>
          prev.map((p) =>
            p.id === playlistId
              ? p.songIds.includes(songId)
                ? p
                : { ...p, songIds: [...p.songIds, songId] }
              : { ...p, songIds: p.songIds.filter((sid) => sid !== songId) },
          ),
        () => api.playlists.addSong(Number(playlistId), Number(songId)),
      ),
    [commit],
  );

  const removeSong = useCallback(
    (playlistId: string, songId: string) =>
      commit(
        (prev) =>
          prev.map((p) =>
            p.id === playlistId
              ? { ...p, songIds: p.songIds.filter((sid) => sid !== songId) }
              : p,
          ),
        () => api.playlists.removeSong(Number(playlistId), Number(songId)),
      ),
    [commit],
  );

  /** Pull a song out of every playlist — the "back to All Songs" drop. */
  const removeSongEverywhere = useCallback(
    (songId: string) =>
      commit(
        (prev) => prev.map((p) => ({ ...p, songIds: p.songIds.filter((sid) => sid !== songId) })),
        () => api.playlists.removeSongEverywhere(Number(songId)),
      ),
    [commit],
  );

  /**
   * Forget a song that has been deleted outright. The backend already prunes
   * membership on delete, so this only keeps the local view in step.
   */
  const cleanupSong = useCallback((songId: string) => {
    setPlaylists((prev) =>
      prev.map((p) => ({ ...p, songIds: p.songIds.filter((sid) => sid !== songId) })),
    );
  }, []);

  return {
    playlists,
    loading,
    error,
    refresh,
    createPlaylist,
    deletePlaylist,
    renamePlaylist,
    addSong,
    removeSong,
    removeSongEverywhere,
    cleanupSong,
  };
}

export type PlaylistStore = ReturnType<typeof usePlaylistStore>;
