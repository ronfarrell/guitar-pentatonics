export type FretMode = "manual" | "song" | "live";

type Props = {
  mode: FretMode;
  setMode: (m: FretMode) => void;
  songKey?: string | null;
};

export default function FretModeToggle({ mode, setMode, songKey }: Props) {
  return (
    <div className="fret-mode-toggle">
      <button
        onClick={() => setMode("manual")}
        className={mode === "manual" ? "active" : ""}
      >
        Manual Key
      </button>

      {songKey && (
        <button
          onClick={() => setMode("song")}
          className={`song-key-btn${mode === "song" ? " active" : ""}`}
          title={`Follow song key: ${songKey}`}
        >
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
