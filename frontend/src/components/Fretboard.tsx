import { useMemo } from 'react'
import { buildFretboard, FRET_COUNT, STANDARD_TUNING } from '../theory/fretboard'
import { getScaleNotes } from '../theory/scales'
import type { ScaleType } from '../theory/scales'

type FretboardProps = {
  root: string
  scaleType: ScaleType
}

const Fretboard = ({ root, scaleType }: FretboardProps) => {
  const fretboard = useMemo(() => buildFretboard(FRET_COUNT), [])
  const scaleNotes = useMemo(() => getScaleNotes(root, scaleType), [root, scaleType])
  const rootNote = scaleNotes[0]

  return (
    <section className="fretboard-card">
      <div className="fretboard-title">
        <div>
          <span className="fretboard-label">Standard guitar tab</span>
          <h2>{root} {scaleType}</h2>
        </div>
        <div className="scale-meta">
          <span>Highlight: {scaleNotes.join(' • ')}</span>
          <span>Open strings: {STANDARD_TUNING.join(' - ')}</span>
        </div>
      </div>

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
          <div key={`${stringRow.stringName}-${index}`} className="fretboard-row">
            <div className="string-name">{stringRow.stringName}</div>
            {stringRow.notes.map((note, fret) => {
              const isScaleNote = scaleNotes.includes(note)
              const isRoot = note === rootNote
              return (
                <div
                  key={`${note}-${fret}`}
                  className={`fret-cell ${isScaleNote ? 'scale-note' : ''} ${isRoot ? 'root-note' : ''}`}
                >
                  {note}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}

export default Fretboard
