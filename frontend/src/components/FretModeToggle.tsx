type Props = {
  mode: "manual" | "live";
  setMode: (m: "manual" | "live") => void;
  songKey?: string | null;
  onUseSongKey?: () => void;
};

export default function FretModeToggle({ mode, setMode, songKey, onUseSongKey }: Props) {
  return (
    <div className="fret-mode-toggle">
      <button
        onClick={() => setMode("manual")}
        className={mode === "manual" ? "active" : ""}
      >
        Manual Key
      </button>

      {songKey && onUseSongKey && (
        <button className="song-key-btn" onClick={onUseSongKey} title={`Use song key: ${songKey}`}>
          Song Key <span className="song-key-badge">{songKey}</span>
        </button>
      )}

      <button
        onClick={() => setMode("live")}
        className={mode === "live" ? "active" : ""}
      >
        Follow Chords
      </button>
    </div>
  );
}
