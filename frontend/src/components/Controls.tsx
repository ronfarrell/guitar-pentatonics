import { ROOT_NOTES } from "../theory/notes";
import { SCALE_TYPES, TRIAD_TYPES } from "../theory/scales";
import type { NoteName } from "../theory/notes";
import type { ScaleType } from "../theory/scales";

type Props = {
  root: NoteName;
  setRoot: (v: NoteName) => void;
  scaleType: ScaleType;
  setScaleType: (v: ScaleType) => void;
  youtubeUrl: string;
  setYoutubeUrl: (v: string) => void;
  onAnalyze: () => void;
  loading: boolean;

  theme: "light" | "dark";
  setTheme: (v: "light" | "dark") => void;
};

export default function Controls({
  root,
  setRoot,
  scaleType,
  setScaleType,
  youtubeUrl,
  setYoutubeUrl,
  onAnalyze,
  loading,
  theme,
  setTheme,
}: Props) {
  return (
    <div className="controls-panel">
      {/* KEY */}
      <div className="control-group">
        <label>Key</label>
        <select
          value={root}
          onChange={(e) => setRoot(e.target.value as NoteName)}
        >
          {ROOT_NOTES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {/* SCALE */}
      <div className="control-group">
        <label>Scale</label>
        <select
          value={scaleType}
          onChange={(e) => setScaleType(e.target.value as ScaleType)}
        >
          <optgroup label="Scales">
            {SCALE_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </optgroup>
          <optgroup label="Triads">
            {TRIAD_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* YOUTUBE */}
      <div className="control-group">
        <label>YouTube URL</label>

        <div className="control-row">
          <input
            className="youtube-input"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="Paste YouTube URL"
          />

          <button
            className="primary-button"
            onClick={onAnalyze}
            disabled={loading}
          >
            {loading ? "Analyzing..." : "Play & Analyze"}
          </button>
        </div>
      </div>

      {/* THEME TOGGLE */}
      <div className="control-group">
        <label>Theme</label>

        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        >
          {theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
        </button>
      </div>
    </div>
  );
}
