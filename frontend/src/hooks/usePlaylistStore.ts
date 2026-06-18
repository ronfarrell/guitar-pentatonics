import { useState, useCallback } from "react";

export type Playlist = {
  id: string;
  name: string;
  songIds: string[];
};

const STORAGE_KEY = "guitar-playlists";

function load(): Playlist[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persist(playlists: Playlist[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
}

export function usePlaylistStore() {
  const [playlists, setPlaylists] = useState<Playlist[]>(load);

  const update = useCallback((next: Playlist[]) => {
    setPlaylists(next);
    persist(next);
  }, []);

  function createPlaylist(name: string): string {
    const id = crypto.randomUUID();
    update([...playlists, { id, name, songIds: [] }]);
    return id;
  }

  function deletePlaylist(id: string) {
    update(playlists.filter((p) => p.id !== id));
  }

  function renamePlaylist(id: string, name: string) {
    update(playlists.map((p) => (p.id === id ? { ...p, name } : p)));
  }

  function addSong(playlistId: string, songId: string) {
    // Remove from any other playlist first so a song only lives in one place
    const cleaned = playlists.map((p) =>
      p.id !== playlistId
        ? { ...p, songIds: p.songIds.filter((sid) => sid !== songId) }
        : p
    );
    update(
      cleaned.map((p) =>
        p.id === playlistId && !p.songIds.includes(songId)
          ? { ...p, songIds: [...p.songIds, songId] }
          : p
      )
    );
  }

  function removeSong(playlistId: string, songId: string) {
    update(
      playlists.map((p) =>
        p.id === playlistId
          ? { ...p, songIds: p.songIds.filter((sid) => sid !== songId) }
          : p
      )
    );
  }

  function cleanupSong(songId: string) {
    update(
      playlists.map((p) => ({ ...p, songIds: p.songIds.filter((sid) => sid !== songId) }))
    );
  }

  return { playlists, createPlaylist, deletePlaylist, renamePlaylist, addSong, removeSong, cleanupSong };
}
