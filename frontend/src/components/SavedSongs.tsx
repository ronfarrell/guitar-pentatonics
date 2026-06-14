import React from "react";

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
  return (
    <div className="saved-songs">
      <h2 className="saved-songs-title">Saved Songs</h2>

      {songs.length === 0 ? (
        <div className="empty-state">No saved songs yet.</div>
      ) : (
        <ul className="song-list">
          {songs.map((song) => (
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
