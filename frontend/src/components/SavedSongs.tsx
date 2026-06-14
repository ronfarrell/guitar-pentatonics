import React, { useState } from "react";

export type SavedSong = {
  id: string;
  title: string;
  key: string;
  youtubeUrl: string;
  createdAt?: string;
};

type Props = {
  songs: SavedSong[];
  onSelectSong?: (song: SavedSong) => void;
  onDeleteSong?: (id: string) => void;
};

function SavedSongs({ songs, onSelectSong, onDeleteSong }: Props) {
  const [query, setQuery] = useState("");

  const filteredSongs = songs.filter((song) =>
    `${song.title} ${song.key}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="saved-songs">
      <div className="saved-songs-header">
        <h2 className="saved-songs-title">Saved Songs</h2>
      </div>

      {/* Search */}
      <div className="saved-songs-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search songs or keys..."
          className="saved-songs-input"
        />
      </div>

      {filteredSongs.length === 0 ? (
        <div className="empty-state">No saved songs yet.</div>
      ) : (
        <ul className="song-list">
          {filteredSongs.map((song) => (
            <li key={song.id} className="song-item">
              <div className="song-info" onClick={() => onSelectSong?.(song)}>
                <div className="song-title">{song.title}</div>
                {song.key && <div className="song-artist">{song.key}</div>}
              </div>

              <div className="song-actions">
                {onDeleteSong && (
                  <button
                    className="delete-btn"
                    onClick={() => onDeleteSong(song.id)}
                  >
                    ✕
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default SavedSongs;
