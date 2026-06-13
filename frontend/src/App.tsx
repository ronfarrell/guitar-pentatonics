import { useState } from 'react'
import './App.css'
import Fretboard from './components/Fretboard'
import { ROOT_NOTES } from './theory/notes'
import type { NoteName } from './theory/notes'
import { SCALE_TYPES, getScaleNotes } from './theory/scales'
import type { ScaleType } from './theory/scales'

function App() {
  const [root, setRoot] = useState<NoteName>(ROOT_NOTES[0])
  const [scaleType, setScaleType] = useState<ScaleType>('Major Pentatonic')
  const scaleNotes = getScaleNotes(root, scaleType)

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Guitar improv assistant</p>
          <h1>Pentatonic tab visualizer</h1>
          <p className="subtitle">
            Select a key and pentatonic scale, then study the pattern across a standard 6-string guitar fretboard.
          </p>
        </div>

        <div className="controls-panel">
          <label>
            Key
            <select value={root} onChange={(event) => setRoot(event.target.value as NoteName)}>
              {ROOT_NOTES.map((note) => (
                <option key={note} value={note}>
                  {note}
                </option>
              ))}
            </select>
          </label>

          <label>
            Scale
            <select value={scaleType} onChange={(event) => setScaleType(event.target.value as ScaleType)}>
              {SCALE_TYPES.map((scale) => (
                <option key={scale} value={scale}>
                  {scale}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="summary-card">
        <div>
          <h2>Why this helps</h2>
          <p>
            Visualize the pentatonic shape in a familiar tab layout. This helps you find scale tones faster while improvising on guitar.
          </p>
        </div>
        <div className="scale-badges">
          {scaleNotes.map((note) => (
            <span key={note} className="note-chip">
              {note}
            </span>
          ))}
        </div>
      </section>

      <Fretboard root={root} scaleType={scaleType} />
    </main>
  )
}

export default App
