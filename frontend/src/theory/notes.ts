export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
export type NoteName = (typeof NOTE_NAMES)[number]

const ENHARMONIC_ALIASES: Record<string, NoteName> = {
  DB: 'C#',
  EB: 'D#',
  GB: 'F#',
  AB: 'G#',
  BB: 'A#',
}

const normalize = (value: string): string => {
  const cleaned = value.trim().replace(/\s+/g, '').toUpperCase()
  return ENHARMONIC_ALIASES[cleaned] ?? cleaned
}

export const normalizeNote = (value: string): NoteName => {
  const normalized = normalize(value)
  return NOTE_NAMES.includes(normalized as NoteName) ? (normalized as NoteName) : 'C'
}

export const noteIndex = (value: string): number => {
  const normalized = normalizeNote(value)
  return NOTE_NAMES.indexOf(normalized)
}

export const ROOT_NOTES = [...NOTE_NAMES] as const
