import { NOTE_NAMES, noteIndex } from "./notes";

export type ChordQuality =
  | "major"
  | "minor"
  | "dominant"
  | "diminished"
  | "major7"
  | "minor7"
  | "dominant13";

export function isMinorQuality(quality: ChordQuality): boolean {
  return quality === "minor" || quality === "minor7";
}

export type ProgressionChord = {
  semitones: number; // interval above the key root
  quality: ChordQuality;
  numeral: string; // Roman numeral label, e.g. "VIm"
};

export type Progression = {
  id: string;
  name: string;
  chords: ProgressionChord[];
};

export const CUSTOM_PROGRESSION_ID = "__custom__";

// Palette of diatonic + common borrowed chords for the custom builder
export const SCALE_DEGREES: ProgressionChord[] = [
  { semitones: 0,  quality: "major",      numeral: "I"    },
  { semitones: 2,  quality: "minor",      numeral: "ii"   },
  { semitones: 4,  quality: "minor",      numeral: "iii"  },
  { semitones: 5,  quality: "major",      numeral: "IV"   },
  { semitones: 7,  quality: "major",      numeral: "V"    },
  { semitones: 7,  quality: "dominant",   numeral: "V7"   },
  { semitones: 9,  quality: "minor",      numeral: "vi"   },
  { semitones: 11, quality: "diminished", numeral: "vii°" },
  { semitones: 10, quality: "major",      numeral: "♭VII" },
  { semitones: 8,  quality: "major",      numeral: "♭VI"  },
  { semitones: 3,  quality: "major",      numeral: "♭III" },
  { semitones: 5,  quality: "minor",      numeral: "iv"   },
  { semitones: 0,  quality: "major7",     numeral: "Imaj7" },
  { semitones: 2,  quality: "minor7",     numeral: "iim7" },
  { semitones: 4,  quality: "minor7",     numeral: "iii7" },
  { semitones: 5,  quality: "major7",     numeral: "IVmaj7" },
  { semitones: 7,  quality: "dominant13", numeral: "V13"  },
  { semitones: 9,  quality: "minor7",     numeral: "vim7" },
];

export const PROGRESSIONS: Progression[] = [
  {
    id: "royal-road",
    name: "Royal Road  I – V – VIm – IV",
    chords: [
      { semitones: 0, quality: "major", numeral: "I" },
      { semitones: 7, quality: "major", numeral: "V" },
      { semitones: 9, quality: "minor", numeral: "VIm" },
      { semitones: 5, quality: "major", numeral: "IV" },
    ],
  },
  {
    id: "50s",
    name: "50s / Doo-wop  I – VIm – IV – V",
    chords: [
      { semitones: 0, quality: "major", numeral: "I" },
      { semitones: 9, quality: "minor", numeral: "VIm" },
      { semitones: 5, quality: "major", numeral: "IV" },
      { semitones: 7, quality: "major", numeral: "V" },
    ],
  },
  {
    id: "blues",
    name: "12-Bar Blues  I7 – IV7 – V7",
    chords: [
      { semitones: 0, quality: "dominant", numeral: "I7" },
      { semitones: 5, quality: "dominant", numeral: "IV7" },
      { semitones: 7, quality: "dominant", numeral: "V7" },
    ],
  },
  {
    id: "pop",
    name: "Pop  I – IV – V",
    chords: [
      { semitones: 0, quality: "major", numeral: "I" },
      { semitones: 5, quality: "major", numeral: "IV" },
      { semitones: 7, quality: "major", numeral: "V" },
    ],
  },
  {
    id: "andalusian",
    name: "Andalusian  Im – bVII – bVI – V",
    chords: [
      { semitones: 0, quality: "minor", numeral: "Im" },
      { semitones: 10, quality: "major", numeral: "bVII" },
      { semitones: 8, quality: "major", numeral: "bVI" },
      { semitones: 7, quality: "major", numeral: "V" },
    ],
  },
  {
    id: "minor",
    name: "Minor  Im – bVI – bVII – Im",
    chords: [
      { semitones: 0, quality: "minor", numeral: "Im" },
      { semitones: 8, quality: "major", numeral: "bVI" },
      { semitones: 10, quality: "major", numeral: "bVII" },
      { semitones: 0, quality: "minor", numeral: "Im" },
    ],
  },
  {
    id: "jazz-251",
    name: "Jazz  IIm – V7 – I",
    chords: [
      { semitones: 2, quality: "minor", numeral: "IIm" },
      { semitones: 7, quality: "dominant", numeral: "V7" },
      { semitones: 0, quality: "major", numeral: "I" },
    ],
  },
  {
    id: "bright-city-pop",
    name: "Bright City Pop  Imaj7 – iii7 – IVmaj7 – V13",
    chords: [
      { semitones: 0, quality: "major7", numeral: "Imaj7" },
      { semitones: 4, quality: "minor7", numeral: "iii7" },
      { semitones: 5, quality: "major7", numeral: "IVmaj7" },
      { semitones: 7, quality: "dominant13", numeral: "V13" },
    ],
  },
];

export function getChordRoot(keyRoot: string, chord: ProgressionChord): string {
  return NOTE_NAMES[(noteIndex(keyRoot) + chord.semitones) % 12];
}

const CHORD_QUALITY_SUFFIX: Record<ChordQuality, string> = {
  major: "",
  minor: "m",
  dominant: "7",
  diminished: "dim",
  major7: "maj7",
  minor7: "m7",
  dominant13: "13",
};

export function getChordName(keyRoot: string, chord: ProgressionChord): string {
  const chordRoot = NOTE_NAMES[(noteIndex(keyRoot) + chord.semitones) % 12];
  return `${chordRoot}${CHORD_QUALITY_SUFFIX[chord.quality]}`;
}

// Returns [root, 3rd, 5th] note names for the chord's underlying triad
export function getTriadNotes(
  keyRoot: string,
  chord: ProgressionChord,
): string[] {
  const chordRootIdx = (noteIndex(keyRoot) + chord.semitones) % 12;
  const intervals = isMinorQuality(chord.quality)
    ? [0, 3, 7]
    : chord.quality === "diminished"
      ? [0, 3, 6]
      : [0, 4, 7]; // major, dominant, major7 and dominant13 share the same triad
  return intervals.map((i) => NOTE_NAMES[(chordRootIdx + i) % 12]);
}
