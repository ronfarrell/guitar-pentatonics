"""Music-theory post-processing for the DSP pipeline.

Refines the global key estimate using the detected chord timeline. Essentia's
KeyExtractor works on raw chroma and frequently confuses relative keys
(e.g. C major vs A minor, which share every scale note). The chord timeline
disambiguates: the true tonic tends to appear as a chord, open/close the song,
and (for minor keys) be paired with a dominant.
"""

import logging
import re

logger = logging.getLogger(__name__)

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

_FLAT_ALIASES = {
    "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#",
    "Cb": "B", "Fb": "E",
}

_CHORD_RE = re.compile(r"^([A-G][#b]?)(m?)")

# Diatonic (root interval, is_minor) triads per key quality. Essentia's chord
# vocabulary is major/minor only, so diminished degrees are omitted. The minor
# set includes the harmonic-minor major V, which is ubiquitous in practice.
_MAJOR_DIATONIC = {(0, False), (2, True), (4, True), (5, False), (7, False), (9, True)}
_MINOR_DIATONIC = {(0, True), (3, False), (5, True), (7, True), (7, False), (8, False), (10, False)}


def note_index(name: str) -> int | None:
    name = _FLAT_ALIASES.get(name, name)
    return NOTE_NAMES.index(name) if name in NOTE_NAMES else None


def parse_chord(label: str) -> tuple[int, bool] | None:
    """Parse an Essentia chord label like 'C#m' into (root index, is_minor)."""
    m = _CHORD_RE.match(label or "")
    if not m:
        return None
    root = note_index(m.group(1))
    if root is None:
        return None
    return root, m.group(2) == "m"


def refine_key(key: str, scale: str, timeline) -> str:
    """
    Pick the most plausible key given the chord timeline, using Essentia's
    estimate as a prior. Returns a "<root> <major|minor>" string.

    Each of the 24 candidate keys is scored on:
      - how much of the song's (duration-weighted) chords are diatonic to it
      - how prominent its tonic chord is
      - whether the song starts/ends on its tonic
      - (minor keys) whether a dominant V chord appears
      - agreement with Essentia's raw estimate
    """
    fallback = f"{key} {scale}"

    weights: dict[tuple[int, bool], float] = {}
    parsed_seq: list[tuple[int, bool]] = []
    total = 0.0

    for seg in timeline or []:
        parsed = parse_chord(seg.chord)
        if parsed is None:
            continue
        duration = max(seg.end - seg.start, 0.0)
        weights[parsed] = weights.get(parsed, 0.0) + duration
        total += duration
        if not parsed_seq or parsed_seq[-1] != parsed:
            parsed_seq.append(parsed)

    if total <= 0 or not parsed_seq:
        return fallback

    prior_root = note_index(key)
    prior_minor = scale.strip().lower() == "minor"

    best_score = float("-inf")
    best = (prior_root if prior_root is not None else 0, prior_minor)

    for tonic in range(12):
        for is_minor in (False, True):
            diatonic = _MINOR_DIATONIC if is_minor else _MAJOR_DIATONIC

            diatonic_weight = sum(
                w for (root, minor), w in weights.items()
                if ((root - tonic) % 12, minor) in diatonic
            )
            tonic_weight = weights.get((tonic, is_minor), 0.0)

            score = diatonic_weight / total
            score += 0.4 * (tonic_weight / total)
            if parsed_seq[0] == (tonic, is_minor):
                score += 0.15
            if parsed_seq[-1] == (tonic, is_minor):
                score += 0.15
            if is_minor and (((tonic + 7) % 12, False) in weights or ((tonic + 7) % 12, True) in weights):
                score += 0.05
            if prior_root is not None and (tonic, is_minor) == (prior_root, prior_minor):
                score += 0.2

            if score > best_score:
                best_score = score
                best = (tonic, is_minor)

    refined = f"{NOTE_NAMES[best[0]]} {'minor' if best[1] else 'major'}"
    if refined != fallback:
        logger.info(f"[THEORY] Refined key: {fallback} -> {refined} (score={best_score:.2f})")
    return refined
