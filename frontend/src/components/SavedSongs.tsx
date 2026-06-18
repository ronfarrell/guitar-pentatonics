import { useState, useRef, memo } from "react";
import type { SavedSong } from "../services/savedSongsService";
import { usePlaylistStore } from "../hooks/usePlaylistStore";

export type { SavedSong };

type SongItemProps = {
  song: SavedSong;
  playlistId?: string;
  reanalyzingId?: string | null;
  onSelect?: (song: SavedSong) => void;
  onDelete?: (id: string) => void;
  onReanalyze?: (song: SavedSong) => void;
  onRemoveFromPlaylist?: (playlistId: string, songId: string) => void;
  onDragStart: (e: React.DragEvent, songId: string) => void;
};

const SongItem = memo(function SongItem({
  song,
  playlistId,
  reanalyzingId,
  onSelect,
  onDelete,
  onReanalyze,
  onRemoveFromPlaylist,
  onDragStart,
}: SongItemProps) {
  const isReanalyzing = reanalyzingId === song.id;
  return (
    <li className="song-item" draggable onDragStart={(e) => onDragStart(e, song.id)}>
      <div className="song-info" onClick={() => onSelect?.(song)}>
        <div className="song-title">{song.title}</div>
        {song.key && <div className="song-key">{song.key}</div>}
      </div>
      <div className="song-actions">
        {playlistId && onRemoveFromPlaylist && (
          <button
            className="remove-from-playlist-btn"
            onClick={() => onRemoveFromPlaylist(playlistId, song.id)}
            title="Remove from playlist"
          >
            ↩
          </button>
        )}
        {onReanalyze && (
          <button
            className="reanalyze-btn"
            onClick={() => onReanalyze(song)}
            disabled={isReanalyzing}
            title="Reanalyze"
          >
            {isReanalyzing ? "..." : "⟳"}
          </button>
        )}
        {onDelete && (
          <button className="delete-btn" onClick={() => onDelete(song.id)} title="Delete">
            ✕
          </button>
        )}
      </div>
    </li>
  );
});

type Props = {
  songs: SavedSong[];
  onSelectSong?: (song: SavedSong) => void;
  onDeleteSong?: (id: string) => void;
  onReanalyzeSong?: (song: SavedSong) => void;
  reanalyzingId?: string | null;
};

function SavedSongs({ songs, onSelectSong, onDeleteSong, onReanalyzeSong, reanalyzingId }: Props) {
  const [query, setQuery] = useState("");
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  const { playlists, createPlaylist, deletePlaylist, renamePlaylist, addSong, removeSong, cleanupSong } =
    usePlaylistStore();

  const playlistSongIds = new Set(playlists.flatMap((p) => p.songIds));
  const ungroupedSongs = songs.filter((s) => !playlistSongIds.has(s.id));

  const isSearching = query.trim() !== "";
  const searchResults = isSearching
    ? songs.filter((s) =>
        `${s.title} ${s.key}`.toLowerCase().includes(query.toLowerCase())
      )
    : [];

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleNewPlaylist() {
    const id = createPlaylist("New Playlist");
    setExpanded((prev) => new Set([...prev, id]));
    setEditingId(id);
    setEditingName("New Playlist");
    setTimeout(() => editInputRef.current?.select(), 0);
  }

  function commitRename(id: string) {
    renamePlaylist(id, editingName.trim() || "Untitled");
    setEditingId(null);
  }

  function startRename(id: string, name: string, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingId(id);
    setEditingName(name);
    setTimeout(() => editInputRef.current?.select(), 0);
  }

  function handleDragStart(e: React.DragEvent, songId: string) {
    e.dataTransfer.setData("songId", songId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverId(targetId);
  }

  function handleDrop(e: React.DragEvent, playlistId: string) {
    e.preventDefault();
    const songId = e.dataTransfer.getData("songId");
    if (songId) addSong(playlistId, songId);
    setDragOverId(null);
  }

  function handleDropUngrouped(e: React.DragEvent) {
    e.preventDefault();
    const songId = e.dataTransfer.getData("songId");
    if (songId) playlists.forEach((p) => removeSong(p.id, songId));
    setDragOverId(null);
  }

  function handleDelete(id: string) {
    cleanupSong(id);
    onDeleteSong?.(id);
  }

  return (
    <div className="saved-songs">
      <div className="saved-songs-top">
        <div className="saved-songs-header">
          <h2 className="saved-songs-title">Library</h2>
          <button className="new-playlist-btn" onClick={handleNewPlaylist} title="New playlist">
            + Playlist
          </button>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search songs or keys..."
          className="saved-songs-input"
        />
      </div>

      {isSearching ? (
        <ul className="song-list">
          {searchResults.length === 0 ? (
            <li className="empty-state">No results for &ldquo;{query}&rdquo;</li>
          ) : (
            searchResults.map((s) => (
              <SongItem
                key={s.id}
                song={s}
                reanalyzingId={reanalyzingId}
                onSelect={onSelectSong}
                onDelete={handleDelete}
                onReanalyze={onReanalyzeSong}
                onRemoveFromPlaylist={removeSong}
                onDragStart={handleDragStart}
              />
            ))
          )}
        </ul>
      ) : (
        <div className="song-list">
          {playlists.map((playlist) => {
            const playlistSongs = playlist.songIds
              .map((id) => songs.find((s) => s.id === id))
              .filter(Boolean) as SavedSong[];
            const isOpen = expanded.has(playlist.id);
            const isDragTarget = dragOverId === playlist.id;

            return (
              <div key={playlist.id} className="playlist-folder">
                <div
                  className={`playlist-header${isDragTarget ? " playlist-drag-over" : ""}`}
                  onDragOver={(e) => handleDragOver(e, playlist.id)}
                  onDragLeave={() => setDragOverId(null)}
                  onDrop={(e) => handleDrop(e, playlist.id)}
                >
                  <button
                    className="playlist-toggle"
                    onClick={() => toggleExpanded(playlist.id)}
                  >
                    <span className="playlist-chevron">{isOpen ? "▾" : "▸"}</span>

                    {editingId === playlist.id ? (
                      <input
                        ref={editInputRef}
                        className="playlist-name-input"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => commitRename(playlist.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(playlist.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span
                        className="playlist-name"
                        onDoubleClick={(e) => startRename(playlist.id, playlist.name, e)}
                        title="Double-click to rename"
                      >
                        {playlist.name}
                      </span>
                    )}

                    <span className="playlist-count">{playlistSongs.length}</span>
                  </button>

                  <button
                    className="delete-btn"
                    onClick={() => deletePlaylist(playlist.id)}
                    title="Delete playlist"
                  >
                    ✕
                  </button>
                </div>

                {isOpen && (
                  <ul className="playlist-songs">
                    {playlistSongs.length === 0 ? (
                      <li className="playlist-empty">Drag songs here</li>
                    ) : (
                      playlistSongs.map((s) => (
                        <SongItem
                          key={s.id}
                          song={s}
                          playlistId={playlist.id}
                          reanalyzingId={reanalyzingId}
                          onSelect={onSelectSong}
                          onDelete={handleDelete}
                          onReanalyze={onReanalyzeSong}
                          onRemoveFromPlaylist={removeSong}
                          onDragStart={handleDragStart}
                        />
                      ))
                    )}
                  </ul>
                )}
              </div>
            );
          })}

          {playlists.length > 0 && (
            <div
              className={`songs-divider${dragOverId === "ungrouped" ? " songs-divider--drag-over" : ""}`}
              onDragOver={(e) => handleDragOver(e, "ungrouped")}
              onDragLeave={() => setDragOverId(null)}
              onDrop={handleDropUngrouped}
            >
              <span>All Songs</span>
            </div>
          )}

          {songs.length === 0 ? (
            <div className="empty-state">No saved songs yet.</div>
          ) : (
            ungroupedSongs.map((s) => (
              <SongItem
                key={s.id}
                song={s}
                reanalyzingId={reanalyzingId}
                onSelect={onSelectSong}
                onDelete={handleDelete}
                onReanalyze={onReanalyzeSong}
                onRemoveFromPlaylist={removeSong}
                onDragStart={handleDragStart}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default SavedSongs;
