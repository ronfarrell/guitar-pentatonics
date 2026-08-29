"""
Beta: split a single guitar stem into rhythm and lead parts.

This is NOT true source separation. Demucs gives us one `guitar` stem, and
rhythm vs. lead guitar are the same instrument — same timbre — so no trained
separation model distinguishes them. What we do here is a heuristic re-mix of
the guitar stem into two derived tracks, using the two cues that actually
correlate with musical role:

  1. Panning (primary). Most rock/metal productions pan rhythm guitars wide
     (hard left/right, often doubled) and sit the lead near the center. When
     the guitar stem has real stereo width we soft-mask by per-bin pan
     position: center-panned energy -> lead, wide energy -> rhythm.

  2. Register + monophony (fallback). When the stem is effectively mono the
     panning cue is gone, so we fall back to a much rougher split: sustained,
     single-note, upper-register content leans lead; dense low-mid chordal
     content leans rhythm.

The masks are complementary (lead + rhythm reconstruct the original guitar
stem), so nothing is lost — it is redistributed. Expect audible bleed,
especially from the fallback path. This is why the feature is labelled beta.
"""
from __future__ import annotations

import logging
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

_N_FFT = 4096
_HOP = 1024

# Below this side/(mid+side) energy ratio the stem is treated as effectively
# mono and the panning split can't work, so we use the register fallback.
_MIN_STEREO_WIDTH = 0.06

# Width (in pan units, where 0 = center and ±1 = hard L/R) of the center
# region counted as "lead" in the panning split. Larger = more content pulled
# toward lead. Kept fairly tight: a lead line is usually a small slice of the
# guitar energy, so a wide window just drags rhythm into the lead track.
_LEAD_PAN_SIGMA = 0.28

# Lead content is biased toward the upper register; rhythm chugs and power-chord
# fundamentals sit lower. We fade the lead mask in across this crossover (Hz) so
# low, center-panned rhythm stays in the rhythm track instead of bleeding into
# lead. _LEAD_HP_SLOPE controls how gradual that fade is.
_LEAD_HP_HZ = 400.0
_LEAD_HP_SLOPE = 150.0


def _stft(x: np.ndarray) -> np.ndarray:
    import librosa

    return librosa.stft(x, n_fft=_N_FFT, hop_length=_HOP)


def _istft(spec: np.ndarray, length: int) -> np.ndarray:
    import librosa

    return librosa.istft(spec, hop_length=_HOP, length=length)


def _panning_split(
    left: np.ndarray, right: np.ndarray, sr: int
) -> tuple[np.ndarray, np.ndarray]:
    """
    Soft-mask a stereo guitar signal by per-bin pan position. Returns
    (rhythm, lead), each a stereo (n, 2) array that together sum back to the
    input. Content that is both center-panned and in the upper register goes
    to lead; wide or low content goes to rhythm.
    """
    import librosa

    L = _stft(left)
    R = _stft(right)
    mag_l = np.abs(L)
    mag_r = np.abs(R)

    # Pan position per bin: -1 hard-left, 0 center, +1 hard-right.
    pan = (mag_r - mag_l) / (mag_r + mag_l + 1e-9)
    center_weight = np.exp(-((pan / _LEAD_PAN_SIGMA) ** 2))

    # Upper-register emphasis so low, center-panned rhythm doesn't leak in.
    freqs = librosa.fft_frequencies(sr=sr, n_fft=_N_FFT)
    hp = 1.0 / (1.0 + np.exp(-(freqs - _LEAD_HP_HZ) / _LEAD_HP_SLOPE))

    lead_mask = center_weight * hp[:, np.newaxis]
    lead_mask = np.clip(lead_mask, 0.0, 1.0)
    rhythm_mask = 1.0 - lead_mask

    n = len(left)
    lead = np.stack(
        [_istft(L * lead_mask, n), _istft(R * lead_mask, n)], axis=-1
    )
    rhythm = np.stack(
        [_istft(L * rhythm_mask, n), _istft(R * rhythm_mask, n)], axis=-1
    )
    return rhythm, lead


def _register_split(
    mono: np.ndarray, sr: int
) -> tuple[np.ndarray, np.ndarray]:
    """
    Fallback for (near-)mono stems. Splits by register and per-frame
    monophony: single-note, upper-register frames lean lead; dense low-mid
    chordal frames lean rhythm. Returns (rhythm, lead) as mono (n,) arrays
    that sum back to the input.

    This is deliberately crude — a mono mixdown genuinely doesn't carry the
    information needed to separate two same-timbre guitars, so this only
    approximates the split.
    """
    S = _stft(mono)
    mag = np.abs(S)
    freqs = np.linspace(0.0, sr / 2, mag.shape[0])

    # Smooth high-band emphasis: leads mostly live above ~350 Hz.
    hi = 1.0 / (1.0 + np.exp(-(freqs - 350.0) / 220.0))  # (freq,)

    # Per-frame monophony: fraction of energy concentrated in the strongest
    # few bins. A held single note concentrates energy; a strummed chord
    # spreads it. Normalised to [0, 1].
    energy = mag ** 2
    total = energy.sum(axis=0) + 1e-9
    k = max(1, mag.shape[0] // 64)
    topk = np.sort(energy, axis=0)[-k:, :].sum(axis=0)
    mono_frac = np.clip(topk / total, 0.0, 1.0)  # (frame,)

    lead_mask = mono_frac[np.newaxis, :] * hi[:, np.newaxis]
    lead_mask = np.clip(lead_mask, 0.0, 1.0)
    rhythm_mask = 1.0 - lead_mask

    n = len(mono)
    lead = _istft(S * lead_mask, n)
    rhythm = _istft(S * rhythm_mask, n)
    return rhythm, lead


def _encode_mp3(samples: np.ndarray, sr: int, out_path: Path) -> None:
    """Write samples to a 192 kbps mp3 via ffmpeg, matching the other stems."""
    samples = np.clip(samples, -1.0, 1.0).astype(np.float32)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = Path(tmp.name)
    try:
        sf.write(str(wav_path), samples, sr)
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", str(wav_path),
            "-b:a", "192k",
            str(out_path),
        ]
        subprocess.run(cmd, check=True)
    finally:
        wav_path.unlink(missing_ok=True)


def split_guitar_roles(
    guitar_stem_path: str,
    rhythm_out: str,
    lead_out: str,
) -> str:
    """
    Split a guitar stem into rhythm and lead mp3s written to the given paths.

    Returns the name of the method used ("panning" or "register") so the
    caller can surface how the split was produced.
    """
    audio, sr = sf.read(guitar_stem_path, always_2d=True)  # (n, channels)
    audio = audio.astype(np.float32)

    if audio.shape[1] >= 2:
        left, right = audio[:, 0], audio[:, 1]
        mid = 0.5 * (left + right)
        side = 0.5 * (left - right)
        mid_e = float(np.mean(mid ** 2))
        side_e = float(np.mean(side ** 2))
        width = side_e / (mid_e + side_e + 1e-12)
    else:
        left = right = audio[:, 0]
        width = 0.0

    if width >= _MIN_STEREO_WIDTH:
        logger.info(
            f"[GUITAR-SPLIT] Panning split (stereo width={width:.3f})"
        )
        rhythm, lead = _panning_split(left, right, sr)
        method = "panning"
    else:
        logger.info(
            f"[GUITAR-SPLIT] Register fallback (stereo width={width:.3f})"
        )
        rhythm, lead = _register_split(0.5 * (left + right), sr)
        method = "register"

    _encode_mp3(rhythm, sr, Path(rhythm_out))
    _encode_mp3(lead, sr, Path(lead_out))
    logger.info(f"[GUITAR-SPLIT] Wrote {rhythm_out} and {lead_out}")
    return method
