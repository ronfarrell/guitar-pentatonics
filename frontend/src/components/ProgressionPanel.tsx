import type { NoteName } from "../theory/notes";
import {
  PROGRESSIONS,
  CUSTOM_PROGRESSION_ID,
  getChordName,
  type ProgressionChord,
} from "../theory/progressions";
import CustomProgressionBuilder from "./CustomProgressionBuilder";
import type { FretMode } from "./FretModeToggle";

type Props = {
  root: NoteName;
  progressionId: string | null;
  selectedChordIdx: number | null;
  fretMode: FretMode;
  customChords: ProgressionChord[];
  onChangeProgression: (id: string | null) => void;
  onSelectChord: (idx: number | null) => void;
  onUpdateCustomChords: (chords: ProgressionChord[]) => void;
};

export default function ProgressionPanel({
  root,
  progressionId,
  selectedChordIdx,
  fretMode,
  customChords,
  onChangeProgression,
  onSelectChord,
  onUpdateCustomChords,
}: Props) {
  const isCustom = progressionId === CUSTOM_PROGRESSION_ID;
  const builtIn = PROGRESSIONS.find((p) => p.id === progressionId) ?? null;
  const activeChords: ProgressionChord[] = isCustom
    ? customChords
    : (builtIn?.chords ?? []);

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
            <option value={CUSTOM_PROGRESSION_ID}>✏ Build Custom...</option>
          </select>
        </div>
      </div>

      {isCustom && (
        <CustomProgressionBuilder
          root={root}
          chords={customChords}
          onChange={onUpdateCustomChords}
        />
      )}

      {activeChords.length > 0 && (
        <div className="progression-chords">
          {fretMode !== "live" && (
            <span className="progression-hint">← → to cycle</span>
          )}
          {activeChords.map((chord, i) => {
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
