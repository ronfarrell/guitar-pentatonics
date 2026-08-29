"""Vocal/instrumental stem separation using Demucs"""
import asyncio
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from app.services.progress import ProgressTracker
import logging

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent.parent / "data"
# Keep downloaded Demucs model weights inside the data dir so they persist
# in the Docker volume across container rebuilds.
MODELS_DIR = DATA_DIR / "models"

DEMUCS_MODEL = "htdemucs"
INSTRUMENTAL_FILENAME = "instrumental.mp3"
SEPARATION_TIMEOUT = 1800  # seconds; CPU separation of a long song is slow

# Full stem split uses the experimental 6-source model (adds guitar + piano)
SIX_STEM_MODEL = "htdemucs_6s"
STEM_NAMES = ["vocals", "drums", "bass", "guitar", "piano", "other"]
STEMS_DIRNAME = "stems"

# Beta: the guitar stem re-split into rhythm/lead by app.services.guitar_split.
# These are optional add-ons — a song may have the 6 core stems without them.
BETA_GUITAR_STEMS = ["guitar_rhythm", "guitar_lead"]


def instrumental_path_for(audio_path: str) -> Path:
    """The cached instrumental lives next to the source audio file."""
    return Path(audio_path).parent / INSTRUMENTAL_FILENAME


def existing_instrumental(audio_path: str) -> str | None:
    """Return the cached instrumental path if one was already generated."""
    path = instrumental_path_for(audio_path)
    return str(path) if path.exists() else None


def stems_dir_for(audio_path: str) -> Path:
    """Cached stems live in a subdirectory next to the source audio file."""
    return Path(audio_path).parent / STEMS_DIRNAME


def existing_stems(audio_path: str | None) -> dict[str, str] | None:
    """
    Return {stem_name: path} if a complete core stem set was already
    generated. If the beta rhythm/lead guitar split was also produced, those
    optional stems are included in the returned dict.
    """
    if not audio_path:
        return None
    stems_dir = stems_dir_for(audio_path)
    stems = {name: stems_dir / f"{name}.mp3" for name in STEM_NAMES}
    if not all(p.exists() for p in stems.values()):
        return None
    result = {name: str(p) for name, p in stems.items()}
    for name in BETA_GUITAR_STEMS:
        beta_path = stems_dir / f"{name}.mp3"
        if beta_path.exists():
            result[name] = str(beta_path)
    return result


def _run_demucs(cmd: list[str], env: dict, on_percent) -> tuple[int, str]:
    """
    Run demucs, streaming its stderr to pick tqdm percentages out of the
    progress bar (tqdm writes with carriage returns, so read raw chunks).
    Returns (returncode, tail of stderr for error reporting).
    """
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        env=env,
    )
    tail = ""
    assert proc.stderr is not None
    for chunk in iter(lambda: proc.stderr.read(256), b""):
        text = chunk.decode("utf-8", errors="replace")
        tail = (tail + text)[-2000:]
        match = None
        for match in re.finditer(r"(\d{1,3})%", text):
            pass
        if match:
            on_percent(min(100, int(match.group(1))))
    proc.wait()
    return proc.returncode, tail


async def _run_separation(
    audio_path: str,
    progress: ProgressTracker | None,
    *,
    model: str,
    model_args: list[str],
    finalize: bool,
    band: tuple[int, int],
    label: str,
) -> Path:
    """
    Run a demucs model on the source audio and return the temporary output
    directory containing the produced stems. Caller moves the files it wants
    and MUST clean up the returned directory's parent (the tmp dir).
    """
    source = Path(audio_path)
    if not source.exists():
        raise ValueError(f"Audio file not found: {audio_path}")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    # Demucs ≥4.1 fetches weights via huggingface-hub; older paths use torch hub
    env.setdefault("HF_HOME", str(MODELS_DIR / "huggingface"))
    env.setdefault("TORCH_HOME", str(MODELS_DIR))

    if progress:
        progress.update("separating", band[0], f"{label} (first run downloads the model)...")

    tmp_dir = Path(tempfile.mkdtemp(prefix="demucs-", dir=source.parent))
    cmd = [
        sys.executable, "-m", "demucs",
        *model_args,
        "-n", model,
        "--mp3", "--mp3-bitrate", "192",
        "-o", str(tmp_dir),
        str(source),
    ]

    logger.info(f"[SEPARATE] Running demucs ({model}) on {source}")

    def on_percent(pct: int):
        if progress:
            # Map demucs 0-100% into the band, leaving room for encode/save
            scaled = band[0] + int(pct * (band[1] - band[0]) / 100)
            progress.update("separating", scaled, f"{label}... {pct}%")

    try:
        returncode, stderr_tail = await asyncio.wait_for(
            asyncio.to_thread(_run_demucs, cmd, env, on_percent),
            timeout=SEPARATION_TIMEOUT,
        )
    except asyncio.TimeoutError:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        logger.error("[SEPARATE] Timed out")
        if progress and finalize:
            progress.error(f"{label} timed out")
        raise ValueError(f"{label} timed out")

    if returncode != 0:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        logger.error(f"[SEPARATE] demucs failed: {stderr_tail}")
        if progress and finalize:
            progress.error(f"{label} failed")
        raise ValueError(f"demucs failed: {stderr_tail[-500:]}")

    return tmp_dir / model / source.stem


async def separate_instrumental(
    audio_path: str,
    progress: ProgressTracker | None = None,
    *,
    finalize: bool = True,
    band: tuple[int, int] = (10, 95),
) -> str:
    """
    Produce a vocals-stripped instrumental mp3 next to the source audio.

    Uses Demucs two-stem mode (vocals / no_vocals) and caches the result,
    so separation only ever runs once per song.

    Args:
        finalize: when False, never mark the tracker completed/errored —
            used when separation is one step of a larger tracked job.
        band: progress percentage range demucs's own 0-100% is mapped into.

    Returns:
        Path to the instrumental mp3.
    """
    cached = existing_instrumental(audio_path)
    if cached:
        logger.info(f"[SEPARATE] Cache hit: {cached}")
        if progress and finalize:
            progress.complete("Using cached backing track")
        return cached

    out_dir = await _run_separation(
        audio_path, progress,
        model=DEMUCS_MODEL,
        model_args=["--two-stems", "vocals"],
        finalize=finalize, band=band,
        label="Separating vocals",
    )
    try:
        no_vocals = out_dir / "no_vocals.mp3"
        if not no_vocals.exists():
            if progress and finalize:
                progress.error("Vocal separation produced no output")
            raise ValueError(f"demucs produced no output at {no_vocals}")

        target = instrumental_path_for(audio_path)
        shutil.move(str(no_vocals), target)
        logger.info(f"[SEPARATE] Instrumental saved: {target}")

        if progress and finalize:
            progress.complete("Backing track ready")
        return str(target)
    finally:
        shutil.rmtree(out_dir.parent.parent, ignore_errors=True)


async def separate_stems(
    audio_path: str,
    progress: ProgressTracker | None = None,
    *,
    finalize: bool = True,
    band: tuple[int, int] = (10, 95),
) -> dict[str, str]:
    """
    Split the source audio into all six stems (vocals, drums, bass, guitar,
    piano, other) using the 6-source Demucs model, cached next to the audio.

    Returns:
        {stem_name: path} for all stems.
    """
    cached = existing_stems(audio_path)
    if cached:
        logger.info(f"[SEPARATE] Stems cache hit: {stems_dir_for(audio_path)}")
        if progress and finalize:
            progress.complete("Using cached stems")
        return cached

    out_dir = await _run_separation(
        audio_path, progress,
        model=SIX_STEM_MODEL,
        model_args=[],
        finalize=finalize, band=band,
        label="Splitting stems",
    )
    try:
        produced = {name: out_dir / f"{name}.mp3" for name in STEM_NAMES}
        missing = [name for name, p in produced.items() if not p.exists()]
        if missing:
            if progress and finalize:
                progress.error("Stem split produced no output")
            raise ValueError(f"demucs missing stems: {missing}")

        stems_dir = stems_dir_for(audio_path)
        stems_dir.mkdir(parents=True, exist_ok=True)
        result = {}
        for name, p in produced.items():
            target = stems_dir / f"{name}.mp3"
            shutil.move(str(p), target)
            result[name] = str(target)
        logger.info(f"[SEPARATE] Stems saved: {stems_dir}")

        if progress and finalize:
            progress.complete("Stems ready")
        return result
    finally:
        shutil.rmtree(out_dir.parent.parent, ignore_errors=True)


async def separate_guitar_roles(
    audio_path: str,
    progress: ProgressTracker | None = None,
) -> dict[str, str]:
    """
    Beta: split the guitar stem into rhythm and lead parts.

    Ensures the 6-stem split exists first (running it if needed), then re-mixes
    the guitar stem into guitar_rhythm/guitar_lead via a heuristic (panning,
    with a mono register fallback — see app.services.guitar_split). Results are
    cached alongside the other stems.

    Returns the full stems dict including the two beta stems.
    """
    from app.services.guitar_split import split_guitar_roles

    # The role split runs on the guitar stem, so make sure the core stems
    # exist first. separate_stems is cached, so this is cheap on a re-run.
    stems = existing_stems(audio_path)
    if not stems:
        if progress:
            progress.update("separating", 5, "Splitting stems first...")
        stems = await separate_stems(
            audio_path, progress, finalize=False, band=(5, 70),
        )

    stems_dir = stems_dir_for(audio_path)
    rhythm_path = stems_dir / f"{BETA_GUITAR_STEMS[0]}.mp3"
    lead_path = stems_dir / f"{BETA_GUITAR_STEMS[1]}.mp3"

    if rhythm_path.exists() and lead_path.exists():
        logger.info(f"[GUITAR-SPLIT] Cache hit: {stems_dir}")
        if progress:
            progress.complete("Using cached guitar split")
        return {**stems, "guitar_rhythm": str(rhythm_path), "guitar_lead": str(lead_path)}

    guitar_stem = stems.get("guitar")
    if not guitar_stem or not Path(guitar_stem).exists():
        if progress:
            progress.error("No guitar stem to split")
        raise ValueError("Guitar stem not available for role split")

    if progress:
        progress.update("separating", 75, "Splitting guitar into rhythm & lead...")

    try:
        method = await asyncio.wait_for(
            asyncio.to_thread(
                split_guitar_roles, guitar_stem, str(rhythm_path), str(lead_path)
            ),
            timeout=SEPARATION_TIMEOUT,
        )
    except asyncio.TimeoutError:
        rhythm_path.unlink(missing_ok=True)
        lead_path.unlink(missing_ok=True)
        logger.error("[GUITAR-SPLIT] Timed out")
        if progress:
            progress.error("Guitar split timed out")
        raise ValueError("Guitar split timed out")
    except Exception as e:
        rhythm_path.unlink(missing_ok=True)
        lead_path.unlink(missing_ok=True)
        logger.error(f"[GUITAR-SPLIT] Failed: {e}", exc_info=True)
        if progress:
            progress.error("Guitar split failed")
        raise ValueError(f"Guitar split failed: {e}")

    logger.info(f"[GUITAR-SPLIT] Done via {method} method")
    if progress:
        progress.complete("Guitar split ready")
    return {**stems, "guitar_rhythm": str(rhythm_path), "guitar_lead": str(lead_path)}
