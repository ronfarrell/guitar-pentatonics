import { useMemo } from "react";
import {
  buildFretboard,
  FRET_COUNT,
  STANDARD_TUNING,
} from "../theory/fretboard";
import { getScaleNotes } from "../theory/scales";
import type { ScaleType } from "../theory/scales";

type FretboardProps = {
  root: string;
  scaleType: ScaleType;
  progress: number;
  currentChord: string | null;
  nextChord: string | null;
  chordNotes?: string[]; // [root, 3rd, 5th] — overrides scale highlighting
};

function extractRoot(chord: string | null) {
  return chord?.match(/^[A-G](#|b)?/)?.[0] ?? "—";
}

const Fretboard = ({
  root,
  scaleType,
  progress,
  currentChord,
  nextChord,
  chordNotes,
}: FretboardProps) => {
  const fretboard = useMemo(() => buildFretboard(FRET_COUNT), []);

  const scaleNotes = useMemo(
    () => getScaleNotes(root, scaleType),
    [root, scaleType],
  );

  const chordNoteSet = useMemo(
    () => new Set(chordNotes ?? []),
    [chordNotes],
  );

  const rootNote = scaleNotes[0];
  const chordRoot = chordNotes?.[0] ?? null;

  const current = extractRoot(currentChord);
  const next = extractRoot(nextChord);

  return (
    <section className="fretboard-card">
      {/* HEADER */}
      <div className="fretboard-title">
        <div>
          <span className="fretboard-label">Standard guitar tab</span>
          <h2>
            {root} {scaleType}
          </h2>
        </div>

        <div className="scale-meta">
          {chordNotes ? (
            <>
              <span>
                Chord tones:{" "}
                <span className="chord-tone-label">{chordNotes[0]}</span>
                {" • "}
                <span className="chord-tone-label">{chordNotes[1]}</span>
                {" • "}
                <span className="chord-tone-label">{chordNotes[2]}</span>
              </span>
              <span>Scale: {scaleNotes.join(" • ")}</span>
            </>
          ) : (
            <span>Highlight: {scaleNotes.join(" • ")}</span>
          )}
          <span>Open strings: {STANDARD_TUNING.join(" - ")}</span>
        </div>
      </div>

      {/* 🔥 TRANSITION BAR */}
      <div className="chord-transition-bar">
        <span className="chord-label">{current}</span>

        <div className="bar-track">
          <div
            className="bar-fill"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>

        <span className="chord-label">{next}</span>
      </div>

      {/* FRETBOARD */}
      <div className="fretboard-scroll">
        <div className="fretboard-grid">
          <div className="fretboard-row header-row">
            <div className="string-name header-cell">String</div>
            {Array.from({ length: FRET_COUNT + 1 }, (_, fret) => (
              <div key={fret} className="fret-cell header-cell">
                {fret}
              </div>
            ))}
          </div>

          {fretboard.map((stringRow, index) => (
            <div
              key={`${stringRow.stringName}-${index}`}
              className="fretboard-row"
            >
              <div className="string-name">{stringRow.stringName}</div>

              {stringRow.notes.map((note, fret) => {
                let cls = "fret-cell";
                if (chordRoot) {
                  if (note === chordRoot) cls += " root-note";
                  else if (chordNoteSet.has(note)) cls += " chord-tone";
                  else if (scaleNotes.includes(note)) cls += " scale-note";
                } else {
                  if (note === rootNote) cls += " root-note";
                  else if (scaleNotes.includes(note)) cls += " scale-note";
                }

                return (
                  <div key={`${note}-${fret}`} className={cls}>
                    {note}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Fretboard;
