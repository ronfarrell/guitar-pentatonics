type Props = {
  mode: "manual" | "live";
  setMode: (m: "manual" | "live") => void;
};

export default function FretModeToggle({ mode, setMode }: Props) {
  return (
    <div className="fret-mode-toggle">
      <button
        onClick={() => setMode("manual")}
        className={mode === "manual" ? "active" : ""}
      >
        Manual Key
      </button>

      <button
        onClick={() => setMode("live")}
        className={mode === "live" ? "active" : ""}
      >
        Follow Chords
      </button>
    </div>
  );
}
