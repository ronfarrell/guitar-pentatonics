import type { NoteName } from "../theory/notes";
import {
  PROGRESSIONS,
  getChordName,
  type Progression,
} from "../theory/progressions";

type Props = {
  root: NoteName;
  progressionId: string | null;
  selectedChordIdx: number | null;
  showTriads: boolean;
  fretMode: "manual" | "live";
  onChangeProgression: (id: string | null) => void;
  onSelectChord: (idx: number | null) => void;
  onToggleTriads: () => void;
};

export default function ProgressionPanel({
  root,
  progressionId,
  selectedChordIdx,
  showTriads,
  fretMode,
  onChangeProgression,
  onSelectChord,
  onToggleTriads,
}: Props) {
  const progression: Progression | null =
    PROGRESSIONS.find((p) => p.id === progressionId) ?? null;

  return (
    <div className="progression-panel">
      <div className="progression-header">
        <div className="control-group" style={{ flex: 1, minWidth: 0 }}>
          <label>Chord Progression</label>
          <select
            value={progressionId ?? ""}
            onChange={(e) => {
              const val = e.target.value || null;
              onChangeProgression(val);
            }}
          >
            <option value="">— None —</option>
            {PROGRESSIONS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group" style={{ flexShrink: 0 }}>
          <label>Triads</label>
          <button
            className={`toggle-btn${showTriads ? " toggle-btn--on" : ""}`}
            onClick={onToggleTriads}
          >
            {showTriads ? "On" : "Off"}
          </button>
        </div>
      </div>

      {progression && (
        <div className="progression-chords">
          {fretMode === "manual" && (
            <span className="progression-hint">← → to cycle</span>
          )}
          {progression.chords.map((chord, i) => {
            const chordName = getChordName(root, chord);
            const isActive = selectedChordIdx === i;
            return (
              <button
                key={i}
                className={`chord-chip${isActive ? " active" : ""}`}
                onClick={() => onSelectChord(isActive ? null : i)}
              >
                <span className="chord-chip-numeral">{chord.numeral}</span>
                <span className="chord-chip-name">{chordName}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
