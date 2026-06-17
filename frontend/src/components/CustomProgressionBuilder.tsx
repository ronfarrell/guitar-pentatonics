import { SCALE_DEGREES, getChordName, type ProgressionChord } from "../theory/progressions";
import type { NoteName } from "../theory/notes";

type Props = {
  root: NoteName;
  chords: ProgressionChord[];
  onChange: (chords: ProgressionChord[]) => void;
};

export default function CustomProgressionBuilder({ root, chords, onChange }: Props) {
  function addDegree(degree: ProgressionChord) {
    onChange([...chords, degree]);
  }

  function removeChord(idx: number) {
    onChange(chords.filter((_, i) => i !== idx));
  }

  return (
    <div className="custom-builder">
      <div className="custom-palette-label">Add chords:</div>
      <div className="custom-palette">
        {SCALE_DEGREES.map((degree, i) => (
          <button
            key={i}
            className="palette-btn"
            onClick={() => addDegree(degree)}
            title={`Add ${degree.numeral} (${getChordName(root, degree)})`}
          >
            <span className="palette-numeral">{degree.numeral}</span>
            <span className="palette-chord">{getChordName(root, degree)}</span>
          </button>
        ))}
      </div>

      {chords.length > 0 ? (
        <div className="custom-sequence">
          <span className="custom-seq-label">Your sequence:</span>
          <div className="custom-seq-chips">
            {chords.map((chord, i) => (
              <button
                key={i}
                className="seq-chip"
                onClick={() => removeChord(i)}
                title="Click to remove"
              >
                {chord.numeral}
                <span className="seq-chip-name">{getChordName(root, chord)}</span>
                <span className="seq-chip-x">×</span>
              </button>
            ))}
            <button className="seq-clear-btn" onClick={() => onChange([])}>
              Clear
            </button>
          </div>
        </div>
      ) : (
        <div className="custom-seq-empty">Click chords above to build your progression</div>
      )}
    </div>
  );
}
