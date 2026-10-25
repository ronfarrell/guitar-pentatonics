import type { RoomDisplay } from "../services/api";
import { VISUALIZER_MODES, VISUALIZER_MODE_LABELS } from "../components/visualizerModes";
import { SCALE_TYPES, TRIAD_TYPES } from "../theory/scales";

type Props = {
  display: RoomDisplay;
  send: (message: Record<string, unknown>) => void;
};

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="auth-tabs">
      {options.map(([id, label]) => (
        <button
          key={id}
          className={`auth-tab${value === id ? " auth-tab--active" : ""}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button className="ctl-toggle" onClick={() => onChange(!on)} aria-pressed={on}>
      <span>{label}</span>
      <span className={`ctl-switch${on ? " ctl-switch--on" : ""}`} aria-hidden />
    </button>
  );
}

export default function DisplayTab({ display, send }: Props) {
  const set = (patch: Partial<RoomDisplay>) => send({ type: "display", patch });

  return (
    <div className="ctl-display">
      <section className="ctl-card">
        <span className="ctl-eyebrow">On screen</span>
        <Segmented
          value={display.view}
          options={[
            ["video", "Music video"],
            ["visualizer", "Visualizer"],
          ]}
          onChange={(view) => set({ view })}
        />
        {display.view === "visualizer" && (
          <div className="ctl-chips">
            {VISUALIZER_MODES.map((mode) => (
              <button
                key={mode}
                className={`suggestion-chip${display.viz_mode === mode ? " active" : ""}`}
                onClick={() => set({ viz_mode: mode })}
              >
                {VISUALIZER_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="ctl-card">
        <span className="ctl-eyebrow">Fretboard</span>
        <Toggle label="Show fretboard" on={display.show_fretboard} onChange={(show_fretboard) => set({ show_fretboard })} />
        <Toggle label="Show chords (last / now / next)" on={display.show_chords} onChange={(show_chords) => set({ show_chords })} />
        <Toggle label="Highlight triads" on={display.show_triads} onChange={(show_triads) => set({ show_triads })} />

        <span className="account-label">Follows</span>
        <Segmented
          value={display.fret_mode}
          options={[
            ["song", "Song key"],
            ["live", "Live chord"],
          ]}
          onChange={(fret_mode) => set({ fret_mode })}
        />

        <label className="auth-field">
          <span>Scale</span>
          <select value={display.scale_type} onChange={(e) => set({ scale_type: e.target.value })}>
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
        </label>
      </section>
    </div>
  );
}
