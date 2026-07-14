// Music-theory insights derived from an analyzed song's key + chord timeline.
// Pure functions of the API response, so they work for cached songs too.

import { NOTE_NAMES, noteIndex } from "./notes";
import type { NoteName } from "./notes";
import type { ScaleType } from "./scales";
import { PROGRESSIONS } from "./progressions";
import type { ProgressionChord } from "./progressions";

export type TimelineChord = { start: number; end: number; chord: string };

export type ScaleSuggestion = {
  root: NoteName;
  scale: ScaleType;
  reason: string;
};

export type DetectedProgression = {
  numerals: string[]; // e.g. ["I", "V", "VIm", "IV"]
  chords: ProgressionChord[]; // loadable as a custom progression
  matchId: string | null; // built-in progression id when it matches one
  matchName: string | null;
};

// degree = semitones above the key root, minor = chord quality
type Degree = { degree: number; minor: boolean };

function parseKey(key: string): { root: NoteName; isMinor: boolean } | null {
  const root = key.match(/^[A-G](#|b)?/)?.[0];
  if (!root) return null;
  return {
    root: NOTE_NAMES[noteIndex(root)],
    isMinor: /minor/i.test(key),
  };
}

function parseChord(label: string): { rootIdx: number; minor: boolean } | null {
  const m = label.match(/^([A-G][#b]?)(m?)/);
  if (!m) return null;
  return { rootIdx: noteIndex(m[1]), minor: m[2] === "m" };
}

/** Duration-weighted fraction of the song spent on each (degree, quality). */
function degreeWeights(chords: TimelineChord[], keyRootIdx: number) {
  const weights = new Map<string, number>();
  let total = 0;
  for (const seg of chords) {
    const parsed = parseChord(seg.chord);
    if (!parsed) continue;
    const duration = Math.max(seg.end - seg.start, 0);
    const key = `${(parsed.rootIdx - keyRootIdx + 12) % 12}|${parsed.minor}`;
    weights.set(key, (weights.get(key) ?? 0) + duration);
    total += duration;
  }
  return { weights, total };
}

export function suggestScales(
  key: string,
  chords: TimelineChord[],
): ScaleSuggestion[] {
  const parsedKey = parseKey(key);
  if (!parsedKey || chords.length === 0) return [];
  const { root, isMinor } = parsedKey;

  const { weights, total } = degreeWeights(chords, noteIndex(root));
  if (total <= 0) return [];

  // fraction of the song spent on a given degree/quality
  const frac = (degree: number, minor: boolean) =>
    (weights.get(`${degree}|${minor}`) ?? 0) / total;
  // a degree "appears" if it covers at least ~3% of the song
  const has = (degree: number, minor: boolean) => frac(degree, minor) >= 0.03;
  // combined time on a set of degrees, either quality
  const fracOn = (degrees: number[]) =>
    degrees.reduce((sum, d) => sum + frac(d, false) + frac(d, true), 0);

  const minorChordTime = [...weights.entries()].reduce(
    (sum, [k, w]) => (k.endsWith("true") ? sum + w / total : sum),
    0,
  );

  const suggestions: ScaleSuggestion[] = [];

  if (isMinor) {
    suggestions.push({
      root,
      scale: "Natural Minor",
      reason: "The full minor scale — safe over the whole song",
    });

    // minor blues: the song lives on i, iv and v, with the iv actually minor
    // (a major IV points to Dorian instead)
    if (fracOn([0, 5, 7]) >= 0.75 && frac(0, true) >= 0.2 && frac(5, true) >= 0.05 && fracOn([7]) >= 0.05)
      suggestions.push({
        root,
        scale: "Blues",
        reason: "i–iv–v workout — a minor blues; the ♭5 blue note fits everywhere",
      });
    else if (has(0, false))
      suggestions.push({
        root,
        scale: "Blues",
        reason: "Tonic appears as both major and minor — bluesy tonality",
      });

    if (has(5, false))
      suggestions.push({
        root,
        scale: "Dorian",
        reason: "Major IV chord in a minor key points to Dorian",
      });
    if (has(7, false))
      suggestions.push({
        root,
        scale: "Harmonic Minor",
        reason: "Major V chord — harmonic minor fits over the dominant",
      });
    if (has(1, false))
      suggestions.push({
        root,
        scale: "Phrygian",
        reason: "♭II major chord — Phrygian's flat 2nd matches it",
      });
  } else {
    suggestions.push({
      root,
      scale: "Major",
      reason: "The full major scale — safe over the whole song",
    });

    // blues: I, IV and V carry the song and minor chords barely appear
    const bluesy =
      fracOn([0, 5, 7]) >= 0.75 &&
      frac(0, false) >= 0.2 &&
      frac(5, false) >= 0.05 &&
      frac(7, false) >= 0.05 &&
      minorChordTime <= 0.1;
    if (bluesy) {
      suggestions.push({
        root,
        scale: "Blues",
        reason: "I–IV–V with barely any minor chords — a blues; the minor-blues scale works over all three",
      });
      suggestions.push({
        root,
        scale: "Major + Minor Pentatonic",
        reason: "Blues move: mix the sweet major pentatonic with gritty minor pentatonic licks",
      });
    }

    if (has(10, false))
      suggestions.push({
        root,
        scale: "Mixolydian",
        reason: "♭VII major chord points to Mixolydian",
      });
    else if (fracOn([0]) + fracOn([5]) >= 0.75 && frac(7, false) < 0.03)
      suggestions.push({
        root,
        scale: "Mixolydian",
        reason: "I–IV vamp with no V — Mixolydian's ♭7 adds a dominant, jammy flavor",
      });

    if (has(2, false) && !has(5, false) && !has(5, true))
      suggestions.push({
        root,
        scale: "Lydian",
        reason: "Major II chord and no IV — Lydian's #4 captures that floating sound",
      });

    if (!bluesy && has(0, true))
      suggestions.push({
        root,
        scale: "Major + Minor Pentatonic",
        reason: "Tonic appears as both major and minor — mix both pentatonics",
      });
  }

  return suggestions;
}

const DEGREE_NUMERALS: Record<number, string> = {
  0: "I",
  1: "♭II",
  2: "II",
  3: "♭III",
  4: "III",
  5: "IV",
  6: "♭V",
  7: "V",
  8: "♭VI",
  9: "VI",
  10: "♭VII",
  11: "VII",
};

function numeralFor(d: Degree): string {
  return DEGREE_NUMERALS[d.degree] + (d.minor ? "m" : "");
}

/** Does `pattern` equal some cyclic rotation of `gram`? */
function cyclicMatch(pattern: Degree[], gram: Degree[]): boolean {
  if (pattern.length !== gram.length) return false;
  for (let shift = 0; shift < gram.length; shift++) {
    if (
      pattern.every((p, i) => {
        const g = gram[(i + shift) % gram.length];
        return p.degree === g.degree && p.minor === g.minor;
      })
    )
      return true;
  }
  return false;
}

export function detectProgression(
  key: string,
  chords: TimelineChord[],
): DetectedProgression | null {
  const parsedKey = parseKey(key);
  if (!parsedKey) return null;
  const keyRootIdx = noteIndex(parsedKey.root);

  // chord sequence with consecutive duplicates collapsed
  const seq: Degree[] = [];
  for (const seg of chords) {
    const parsed = parseChord(seg.chord);
    if (!parsed) continue;
    const d: Degree = {
      degree: (parsed.rootIdx - keyRootIdx + 12) % 12,
      minor: parsed.minor,
    };
    const last = seq[seq.length - 1];
    if (!last || last.degree !== d.degree || last.minor !== d.minor) seq.push(d);
  }
  if (seq.length < 3) return null;

  // most frequent 4-gram, falling back to 3-gram; require it to repeat
  let best: Degree[] | null = null;
  for (const n of [4, 3]) {
    const counts = new Map<string, { gram: Degree[]; count: number }>();
    for (let i = 0; i + n <= seq.length; i++) {
      const gram = seq.slice(i, i + n);
      const key = gram.map((d) => `${d.degree}${d.minor ? "m" : ""}`).join(",");
      const entry = counts.get(key) ?? { gram, count: 0 };
      entry.count++;
      counts.set(key, entry);
    }
    let top: { gram: Degree[]; count: number } | null = null;
    for (const entry of counts.values()) {
      if (!top || entry.count > top.count) top = entry;
    }
    if (top && top.count >= 2) {
      best = top.gram;
      break;
    }
  }
  if (!best) return null;

  // a gram that wraps around (e.g. I–IV–V–I) is really a shorter loop;
  // display the collapsed form but match built-ins against both
  const first = best[0];
  const last = best[best.length - 1];
  const collapsed =
    best.length === 4 && first.degree === last.degree && first.minor === last.minor
      ? best.slice(0, -1)
      : null;
  const display = collapsed ?? best;

  // compare against built-ins; dominant chords count as major triads (the
  // detector's vocabulary is major/minor only), but progressions written
  // with plain triads are preferred over ones that need that leniency
  let matchId: string | null = null;
  let matchName: string | null = null;
  const exactFirst = [...PROGRESSIONS].sort((a, b) => {
    const lenient = (p: (typeof PROGRESSIONS)[number]) =>
      p.chords.some((c) => c.quality !== "major" && c.quality !== "minor") ? 1 : 0;
    return lenient(a) - lenient(b);
  });
  for (const p of exactFirst) {
    const pattern: Degree[] = p.chords.map((c) => ({
      degree: c.semitones,
      minor: c.quality === "minor",
    }));
    if (cyclicMatch(pattern, best) || (collapsed && cyclicMatch(pattern, collapsed))) {
      matchId = p.id;
      matchName = p.name;
      break;
    }
  }

  return {
    numerals: display.map(numeralFor),
    chords: display.map((d) => ({
      semitones: d.degree,
      quality: d.minor ? "minor" : "major",
      numeral: numeralFor(d),
    })),
    matchId,
    matchName,
  };
}
