"""DSP pipeline for music analysis using Essentia"""

import logging
import essentia.standard as es
from app.models.analysis import Chord
from collections import deque

logger = logging.getLogger(__name__)


# =========================
# CORE CHORD DETECTION
# =========================

def _run_chord_detection(audio_path: str):
    """
    Runs Essentia chord detection and returns frame-level chords
    """

    loader = es.MonoLoader(filename=audio_path, sampleRate=44100)
    audio = loader()

    rms = es.RMS()

    frame_size = 8192   # 🔥 improved stability
    hop_size = 4096     # 🔥 less jitter than 2048

    window = es.Windowing(type="hann")
    spectrum = es.Spectrum()
    spectral_peaks = es.SpectralPeaks()

    hpcp = es.HPCP(
        size=36,
        harmonics=0
    )

    chord_detect = es.ChordsDetection()

    hpcp_frames = []

    # =========================
    # FEATURE EXTRACTION LOOP
    # =========================
    for frame in es.FrameGenerator(audio, frameSize=frame_size, hopSize=hop_size):

        # 🔥 energy gating (removes silence / noise)
        energy = rms(frame)
        if energy < 0.01:
            continue

        spec = spectrum(window(frame))
        freqs, mags = spectral_peaks(spec)

        hpcp_frames.append(hpcp(freqs, mags))

    if not hpcp_frames:
        return [], [], hop_size, 44100

    # 🔥 harmonic smoothing BEFORE chord detection (major quality win)
    hpcp_frames = smooth_hpcp(hpcp_frames, window_size=5)

    chords, strengths = chord_detect(hpcp_frames)

    return chords, strengths, hop_size, 44100


# =========================
# TIMELINE BUILDING
# =========================

def _to_timeline(chords, strengths, hop_size, sr, min_confidence=0.3):
    seconds_per_frame = hop_size / sr

    if not chords:
        return []

    timeline = []

    current = chords[0]
    start = 0.0

    change_counter = 0
    change_threshold = 3  # stability filter (key improvement)

    for i, chord in enumerate(chords):

        confidence = strengths[i] if i < len(strengths) else 1.0

        # 🔥 confidence gating
        if confidence < min_confidence:
            chord = current

        # =========================
        # STABILITY FILTER
        # =========================
        if chord != current:
            change_counter += 1
        else:
            change_counter = 0

        # commit only if persistent
        if change_counter >= change_threshold:

            timeline.append(Chord(
                start=start,
                end=i * seconds_per_frame,
                chord=current
            ))

            current = chord
            start = i * seconds_per_frame
            change_counter = 0

    # last segment
    timeline.append(Chord(
        start=start,
        end=len(chords) * seconds_per_frame,
        chord=current
    ))

    return timeline


# =========================
# MAIN PIPELINE
# =========================

async def analyze_audio(audio_path: str) -> dict:
    """
    Run DSP pipeline on audio file and return chord timeline
    """

    logger.info(f"[DSP] Starting analysis: {audio_path}")

    chords, strengths, hop_size, sr = _run_chord_detection(audio_path)

    timeline = _to_timeline(chords, strengths, hop_size, sr)

    # 🔥 merge micro-segments AFTER timeline creation
    timeline = merge_short_segments(timeline, min_duration=1.0)

    # =========================
    # KEY DETECTION
    # =========================
    key_extractor = es.KeyExtractor()

    audio = es.MonoLoader(filename=audio_path, sampleRate=sr)()
    key, scale, strength = key_extractor(audio)

    result = {
        "key": f"{key} {scale}",
        "chords": timeline,
    }

    logger.info(f"[DSP] Done. Key={result['key']} Chords={len(timeline)}")

    return result


# =========================
# HPCP SMOOTHING (IMPORTANT)
# =========================

def smooth_hpcp(hpcp_frames, window_size=5):
    """
    Smooth harmonic content BEFORE chord detection
    (this is MUCH more important than label smoothing)
    """

    smoothed = []
    window = deque(maxlen=window_size)

    for vec in hpcp_frames:
        window.append(vec)
        avg = sum(window) / len(window)
        smoothed.append(avg)

    return smoothed


# =========================
# POST-PROCESSING
# =========================

def merge_short_segments(timeline, min_duration=1.0):
    """
    Removes tiny noisy chord segments
    """

    if not timeline:
        return []

    merged = [timeline[0]]

    for chord in timeline[1:]:

        duration = chord.end - chord.start

        if duration < min_duration and merged:
            merged[-1].end = chord.end
        else:
            merged.append(chord)

    return merged