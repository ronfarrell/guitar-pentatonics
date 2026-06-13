import { NOTE_NAMES, noteIndex } from './notes'

export const STANDARD_TUNING = ['E', 'B', 'G', 'D', 'A', 'E'] as const
export const FRET_COUNT = 22

export type FretboardString = {
  stringName: string
  notes: string[]
}

export const buildFretboard = (frets = FRET_COUNT): FretboardString[] => {
  return STANDARD_TUNING.map((stringName) => {
    const start = noteIndex(stringName)
    const notes = Array.from({ length: frets + 1 }, (_, fret) =>
      NOTE_NAMES[(start + fret) % NOTE_NAMES.length],
    )

    return {
      stringName,
      notes,
    }
  })
}
