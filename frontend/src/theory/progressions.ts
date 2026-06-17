import { NOTE_NAMES, noteIndex } from "./notes";

export type ChordQuality = "major" | "minor" | "dominant" | "diminished";

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
];

export function getChordName(keyRoot: string, chord: ProgressionChord): string {
  const chordRoot = NOTE_NAMES[(noteIndex(keyRoot) + chord.semitones) % 12];
  const suffix =
    chord.quality === "minor"
      ? "m"
      : chord.quality === "dominant"
        ? "7"
        : chord.quality === "diminished"
          ? "dim"
          : "";
  return `${chordRoot}${suffix}`;
}

// Returns [root, 3rd, 5th] note names for the chord
export function getTriadNotes(
  keyRoot: string,
  chord: ProgressionChord,
): string[] {
  const chordRootIdx = (noteIndex(keyRoot) + chord.semitones) % 12;
  const intervals =
    chord.quality === "minor"
      ? [0, 3, 7]
      : chord.quality === "diminished"
        ? [0, 3, 6]
        : [0, 4, 7]; // major and dominant share the same triad
  return intervals.map((i) => NOTE_NAMES[(chordRootIdx + i) % 12]);
}
