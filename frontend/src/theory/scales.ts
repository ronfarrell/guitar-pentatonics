import { NOTE_NAMES, noteIndex } from './notes'

export type ScaleType = 'Major Pentatonic' | 'Minor Pentatonic'

export const SCALE_TYPES: ScaleType[] = ['Major Pentatonic', 'Minor Pentatonic']

const SCALE_FORMULAS: Record<ScaleType, number[]> = {
  'Major Pentatonic': [0, 2, 4, 7, 9],
  'Minor Pentatonic': [0, 3, 5, 7, 10],
}

export const getScaleNotes = (root: string, scaleType: ScaleType): string[] => {
  const rootIndex = noteIndex(root)
  const formula = SCALE_FORMULAS[scaleType]
  return formula.map((step) => NOTE_NAMES[(rootIndex + step) % NOTE_NAMES.length])
}
