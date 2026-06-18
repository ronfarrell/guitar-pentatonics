import { useEffect, useRef, useState, useMemo } from "react";
import {
  buildFretboard,
  FRET_COUNT,
  STANDARD_TUNING,
} from "../theory/fretboard";
import { getScaleNotes } from "../theory/scales";
import type { ScaleType } from "../theory/scales";
import FretboardColorSettings from "./FretboardColorSettings";
import type { FretboardColors } from "./FretboardColorSettings";

type FretboardProps = {
  root: string;
  scaleType: ScaleType;
  progress: number;
  prevChord: string | null;
  currentChord: string | null;
  nextChord: string | null;
  chordNotes?: string[];
  colors: FretboardColors;
  onColorsChange: (colors: FretboardColors) => void;
};

const Fretboard = ({
  root,
  scaleType,
  progress,
  prevChord,
  currentChord,
  nextChord,
  chordNotes,
  colors,
  onColorsChange,
}: FretboardProps) => {
  const fretboard = useMemo(() => buildFretboard(FRET_COUNT), []);

  const scaleNotes = useMemo(
    () => getScaleNotes(root, scaleType),
    [root, scaleType],
  );

  const chordNoteSet = useMemo(() => new Set(chordNotes ?? []), [chordNotes]);

  const rootNote = scaleNotes[0];
  const chordRoot = chordNotes?.[0] ?? null;

  const showChordCards = prevChord !== null || currentChord !== null || nextChord !== null;

  const [chordAnimKey, setChordAnimKey] = useState(0);
  const prevChordRef = useRef(currentChord);
  useEffect(() => {
    if (currentChord !== prevChordRef.current) {
      prevChordRef.current = currentChord;
      setChordAnimKey((k) => k + 1);
    }
  }, [currentChord]);

  const [showSettings, setShowSettings] = useState(false);

  const cssVars = {
    "--fb-root": colors.rootColor,
    "--fb-triad": colors.triadColor,
    "--fb-scale": colors.scaleColor,
  } as React.CSSProperties;

  return (
    <section className="fretboard-card" style={cssVars}>
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
        </div>

        <div className="fb-settings-anchor">
          <button
            className="fb-settings-btn"
            onClick={() => setShowSettings((s) => !s)}
            aria-label="Fretboard color settings"
            title="Color settings"
          >
            ⚙
          </button>
          {showSettings && (
            <FretboardColorSettings
              colors={colors}
              onChange={onColorsChange}
              onClose={() => setShowSettings(false)}
            />
          )}
        </div>
      </div>

      {/* 3-CARD CHORD DISPLAY */}
      {showChordCards && (
        <div className="chord-cards-wrap">
          <div className="chord-cards" key={chordAnimKey}>
            <div className="chord-card chord-card--prev">
              <div className="chord-card-label">Last</div>
              <div className="chord-card-name">{prevChord ?? "—"}</div>
            </div>

            <div className="chord-card chord-card--current">
              <div className="chord-card-label">Now</div>
              <div className="chord-card-name">{currentChord ?? "—"}</div>
            </div>

            <div className="chord-card chord-card--next">
              <div className="chord-card-label">Next</div>
              <div className="chord-card-name">{nextChord ?? "—"}</div>
            </div>
          </div>

          <div className="chord-mini-bar">
            <div
              className="chord-mini-bar-fill"
              style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
            />
          </div>
        </div>
      )}

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
