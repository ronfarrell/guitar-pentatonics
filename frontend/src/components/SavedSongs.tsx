import { useState } from "react";
import type { SavedSong } from "../services/savedSongsService";

export type { SavedSong };

type Props = {
  songs: SavedSong[];
  onSelectSong?: (song: SavedSong) => void;
  onDeleteSong?: (id: string) => void;
  onReanalyzeSong?: (song: SavedSong) => void;
  reanalyzingId?: string | null;
};

function SavedSongs({ songs, onSelectSong, onDeleteSong, onReanalyzeSong, reanalyzingId }: Props) {
  const [query, setQuery] = useState("");

  const filteredSongs = songs.filter((song) =>
    `${song.title} ${song.key}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="saved-songs">
      <div className="saved-songs-top">
        <h2 className="saved-songs-title">Saved Songs</h2>
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
          {filteredSongs.map((song) => {
            const isReanalyzing = reanalyzingId === song.id;
            return (
              <li key={song.id} className="song-item">
                <div className="song-info" onClick={() => onSelectSong?.(song)}>
                  <div className="song-title">{song.title}</div>
                  {song.key && <div className="song-key">{song.key}</div>}
                </div>

                <div className="song-actions">
                  {onReanalyzeSong && (
                    <button
                      className="reanalyze-btn"
                      onClick={() => onReanalyzeSong(song)}
                      disabled={isReanalyzing}
                      title="Reanalyze"
                    >
                      {isReanalyzing ? "..." : "⟳"}
                    </button>
                  )}

                  {onDeleteSong && (
                    <button
                      className="delete-btn"
                      onClick={() => onDeleteSong(song.id)}
                      title="Delete"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default SavedSongs;
