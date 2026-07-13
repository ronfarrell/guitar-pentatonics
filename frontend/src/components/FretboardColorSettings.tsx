import { useRef, useEffect } from "react";

export type FretboardColors = {
  rootColor: string;
  triadColor: string;
  scaleColor: string;
  pentatonicColor: string;
};

export const DEFAULT_FRETBOARD_COLORS: FretboardColors = {
  rootColor: "#22c55e",
  triadColor: "#ea580c",
  scaleColor: "#6355e8",
  pentatonicColor: "#0ea5e9",
};

const STORAGE_KEY = "fretboard-colors";

const PRESETS: { name: string; colors: FretboardColors }[] = [
  { name: "Default", colors: DEFAULT_FRETBOARD_COLORS },
  {
    name: "Sunset",
    colors: {
      rootColor: "#f59e0b",
      triadColor: "#ef4444",
      scaleColor: "#a855f7",
      pentatonicColor: "#ec4899",
    },
  },
  {
    name: "Ocean",
    colors: {
      rootColor: "#34d399",
      triadColor: "#fb923c",
      scaleColor: "#818cf8",
      pentatonicColor: "#22d3ee",
    },
  },
  {
    name: "Contrast",
    colors: {
      rootColor: "#facc15",
      triadColor: "#f87171",
      scaleColor: "#94a3b8",
      pentatonicColor: "#38bdf8",
    },
  },
];

export function loadFretboardColors(): FretboardColors {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_FRETBOARD_COLORS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_FRETBOARD_COLORS;
}

export function saveFretboardColors(colors: FretboardColors) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
}

type Props = {
  colors: FretboardColors;
  onChange: (colors: FretboardColors) => void;
  onClose: () => void;
};

export default function FretboardColorSettings({ colors, onChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  function set(key: keyof FretboardColors, value: string) {
    const next = { ...colors, [key]: value };
    onChange(next);
    saveFretboardColors(next);
  }

  function applyPreset(preset: FretboardColors) {
    onChange(preset);
    saveFretboardColors(preset);
  }

  function reset() {
    applyPreset(DEFAULT_FRETBOARD_COLORS);
  }

  const isActivePreset = (preset: FretboardColors) =>
    (Object.keys(preset) as (keyof FretboardColors)[]).every(
      (k) => preset[k].toLowerCase() === colors[k].toLowerCase(),
    );

  return (
    <div className="fb-settings-popup" ref={ref}>
      <div className="fb-settings-header">
        <span>Fretboard Colors</span>
        <button className="fb-settings-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="fb-presets">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            className={`fb-preset${isActivePreset(p.colors) ? " active" : ""}`}
            onClick={() => applyPreset(p.colors)}
          >
            <span className="fb-preset-swatches">
              {[
                p.colors.rootColor,
                p.colors.pentatonicColor,
                p.colors.scaleColor,
                p.colors.triadColor,
              ].map((c, i) => (
                <span key={i} style={{ background: c }} />
              ))}
            </span>
            <span className="fb-preset-name">{p.name}</span>
          </button>
        ))}
      </div>

      <div className="fb-settings-rows">
        <label className="fb-settings-row">
          <span className="fb-settings-swatch" style={{ background: colors.rootColor }} />
          <span>Root note</span>
          <input
            type="color"
            value={colors.rootColor}
            onChange={e => set("rootColor", e.target.value)}
          />
        </label>

        <label className="fb-settings-row">
          <span className="fb-settings-swatch" style={{ background: colors.triadColor }} />
          <span>Triads</span>
          <input
            type="color"
            value={colors.triadColor}
            onChange={e => set("triadColor", e.target.value)}
          />
        </label>

        <label className="fb-settings-row">
          <span className="fb-settings-swatch" style={{ background: colors.scaleColor }} />
          <span>Scale notes</span>
          <input
            type="color"
            value={colors.scaleColor}
            onChange={e => set("scaleColor", e.target.value)}
          />
        </label>

        <label className="fb-settings-row">
          <span className="fb-settings-swatch" style={{ background: colors.pentatonicColor }} />
          <span>Pentatonic core</span>
          <input
            type="color"
            value={colors.pentatonicColor}
            onChange={e => set("pentatonicColor", e.target.value)}
          />
        </label>
      </div>

      <button className="fb-settings-reset" onClick={reset}>
        Reset to defaults
      </button>
    </div>
  );
}
