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
    """Return {stem_name: path} if a complete stem set was already generated."""
    if not audio_path:
        return None
    stems_dir = stems_dir_for(audio_path)
    stems = {name: stems_dir / f"{name}.mp3" for name in STEM_NAMES}
    if all(p.exists() for p in stems.values()):
        return {name: str(p) for name, p in stems.items()}
    return None


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
