import { NOTE_NAMES, noteIndex } from "./notes";

export type ScaleType =
  | "Major"
  | "Natural Minor"
  | "Harmonic Minor"
  | "Major Pentatonic"
  | "Minor Pentatonic"
  | "Blues"
  | "Major + Minor Pentatonic"
  | "Dorian"
  | "Mixolydian"
  | "Major Triad"
  | "Minor Triad"
  | "Diminished Triad"
  | "Augmented Triad";

export const SCALE_TYPES: ScaleType[] = [
  "Major",
  "Natural Minor",
  "Harmonic Minor",
  "Major Pentatonic",
  "Minor Pentatonic",
  "Blues",
  "Major + Minor Pentatonic",
  "Dorian",
  "Mixolydian",
];

export const TRIAD_TYPES: ScaleType[] = [
  "Major Triad",
  "Minor Triad",
  "Diminished Triad",
  "Augmented Triad",
];

export const isTriadType = (s: ScaleType): boolean =>
  (TRIAD_TYPES as ScaleType[]).includes(s);

const MAJOR_TO_MINOR: Partial<Record<ScaleType, ScaleType>> = {
  Major: "Natural Minor",
  "Major Pentatonic": "Minor Pentatonic",
  "Major Triad": "Minor Triad",
  Mixolydian: "Dorian",
};

const MINOR_TO_MAJOR: Partial<Record<ScaleType, ScaleType>> = {
  "Natural Minor": "Major",
  "Harmonic Minor": "Major",
  "Minor Pentatonic": "Major Pentatonic",
  "Minor Triad": "Major Triad",
  Dorian: "Mixolydian",
};

/**
 * Swap a scale for its counterpart in the opposite quality so it fits the
 * key (e.g. Major Pentatonic → Minor Pentatonic for a minor key). Scales
 * without a clear major/minor counterpart (Blues, combined pentatonic,
 * diminished/augmented triads) are kept as-is.
 */
export const matchScaleToKeyQuality = (
  scale: ScaleType,
  isMinorKey: boolean,
): ScaleType =>
  (isMinorKey ? MAJOR_TO_MINOR[scale] : MINOR_TO_MAJOR[scale]) ?? scale;

export const getPentatonicNotes = (
  root: string,
  scaleType: ScaleType,
): string[] => {
  const rootIndex = noteIndex(root);

  const formula =
    scaleType === "Major" || scaleType === "Mixolydian"
      ? [0, 2, 4, 7, 9] // major pentatonic
      : [0, 3, 5, 7, 10]; // minor pentatonic

  return formula.map(
    (step) => NOTE_NAMES[(rootIndex + step) % NOTE_NAMES.length],
  );
};

const SCALE_FORMULAS: Record<ScaleType, number[]> = {
  // 1 2 3 4 5 6 7
  Major: [0, 2, 4, 5, 7, 9, 11],

  // 1 2 b3 4 5 b6 b7
  "Natural Minor": [0, 2, 3, 5, 7, 8, 10],

  // 1 2 b3 4 5 b6 7
  "Harmonic Minor": [0, 2, 3, 5, 7, 8, 11],

  // 1 2 3 5 6
  "Major Pentatonic": [0, 2, 4, 7, 9],

  // 1 b3 4 5 b7
  "Minor Pentatonic": [0, 3, 5, 7, 10],

  // 1 b3 4 b5 5 b7
  Blues: [0, 3, 5, 6, 7, 10],

  // Combined major and minor pentatonic
  "Major + Minor Pentatonic": [0, 2, 3, 4, 7, 9, 10],

  // 1 2 b3 4 5 6 b7
  Dorian: [0, 2, 3, 5, 7, 9, 10],

  // 1 2 3 4 5 6 b7
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],

  // Triads: root, third, fifth
  "Major Triad": [0, 4, 7],
  "Minor Triad": [0, 3, 7],
  "Diminished Triad": [0, 3, 6],
  "Augmented Triad": [0, 4, 8],
};

export const getScaleNotes = (root: string, scaleType: ScaleType): string[] => {
  const rootIndex = noteIndex(root);
  const formula = SCALE_FORMULAS[scaleType];

  return formula.map(
    (step) => NOTE_NAMES[(rootIndex + step) % NOTE_NAMES.length],
  );
};

// Scales that build on top of a pentatonic — used to highlight the embedded
// pentatonic on the fretboard. Pentatonics and triads themselves are omitted.
const PENTATONIC_BASE: Partial<Record<ScaleType, ScaleType>> = {
  Major: "Major Pentatonic",
  Mixolydian: "Major Pentatonic",
  "Natural Minor": "Minor Pentatonic",
  "Harmonic Minor": "Minor Pentatonic",
  Dorian: "Minor Pentatonic",
  Blues: "Minor Pentatonic",
};

/**
 * Notes of the pentatonic embedded in the given scale, or null if the scale
 * isn't built on one. Only notes the scale actually contains are returned
 * (e.g. Harmonic Minor lacks the pentatonic's b7, so it's left out).
 */
export const getPentatonicSubset = (
  root: string,
  scaleType: ScaleType,
): string[] | null => {
  const base = PENTATONIC_BASE[scaleType];
  if (!base) return null;
  const scale = new Set(getScaleNotes(root, scaleType));
  return getScaleNotes(root, base).filter((n) => scale.has(n));
};
