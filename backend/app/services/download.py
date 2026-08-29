import asyncio
import subprocess
import json
from collections import defaultdict
from pathlib import Path
import hashlib
from app.services.progress import ProgressTracker
import logging
import os

env = os.environ.copy()
env["PATH"] = "/home/ron/.nvm/versions/node/v24.16.0/bin:" + env["PATH"]
logger = logging.getLogger(__name__)

# Concurrent requests for the same video (e.g. a playlist import racing a
# manual analyze) must not run yt-dlp twice into the same cache_dir — they'd
# collide renaming each other's .part fragments. Serialize per video_id.
_download_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

# YouTube signs its media URLs for one specific player client and expires them
# quickly; when one is rejected mid-download (HTTP 403) the only fix is a fresh
# extraction, so retry the whole yt-dlp run and force a different client each
# time instead of hammering the dead URL.
_PLAYER_CLIENT_FALLBACKS: list[str | None] = [None, "tv", "ios", "web_safari"]

# Ride out transient network/CDN hiccups inside a single yt-dlp run.
_RETRY_FLAGS = [
    "--retries", "10",
    "--fragment-retries", "10",
    "--extractor-retries", "3",
]


def _is_transient_failure(stderr: str) -> bool:
    """True for errors a re-extraction with another player client can fix."""
    text = (stderr or "").lower()
    return any(
        marker in text
        for marker in ("403", "forbidden", "unable to download video data",
                       "fragment", "read timed out", "connection reset")
    )


async def _run_yt_dlp(
    cmd: list[str],
    *,
    timeout: int,
    label: str,
) -> subprocess.CompletedProcess:
    """Run yt-dlp, retrying transient failures against fallback player clients.

    `cmd` must start with "yt-dlp" and end with the URL; the retry flags and
    the per-attempt --extractor-args are spliced in just after "yt-dlp".
    """
    # `timeout` is the budget for the whole call, not per attempt, so a video
    # that keeps 403-ing can't stretch the pipeline to four full timeouts.
    deadline = asyncio.get_running_loop().time() + timeout

    proc = None
    for attempt, client in enumerate(_PLAYER_CLIENT_FALLBACKS):
        remaining = deadline - asyncio.get_running_loop().time()
        if remaining <= 0:
            raise asyncio.TimeoutError
        extra = list(_RETRY_FLAGS)
        if client:
            extra += ["--extractor-args", f"youtube:player_client={client}"]
        full_cmd = [cmd[0], *extra, *cmd[1:]]

        if attempt:
            logger.warning(f"[{label}] Retrying with player_client={client}")

        proc = await asyncio.wait_for(
            asyncio.to_thread(
                subprocess.run,
                full_cmd,
                capture_output=True,
                text=True,
                env=env,
            ),
            timeout=remaining,
        )

        if proc.returncode == 0 or not _is_transient_failure(proc.stderr):
            return proc

        logger.warning(f"[{label}] Attempt {attempt + 1} failed: {proc.stderr.strip()}")
        await asyncio.sleep(2)

    return proc


AUDIO_DIR = Path(__file__).parent.parent.parent / "data" / "audio"
VIDEO_DIR = Path(__file__).parent.parent.parent / "data" / "videos"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
VIDEO_DIR.mkdir(parents=True, exist_ok=True)


# yt-dlp leaves "<name>.<ext>.part" / ".ytdl" behind when a download dies
# partway (e.g. a 403 mid-transfer). Those match a naive "video.*" glob, so the
# next request would happily serve a truncated file as a cache hit.
_INCOMPLETE_SUFFIXES = (".part", ".ytdl")


def _cached_files(cache_dir: Path, stem: str) -> list[Path]:
    """Finished files named <stem>.* in cache_dir, ignoring partial downloads."""
    return sorted(
        f for f in cache_dir.glob(f"{stem}.*")
        if f.suffix not in _INCOMPLETE_SUFFIXES
    )


def get_video_id_from_url(youtube_url: str) -> str:
    """
    Generate deterministic ID from YouTube URL using MD5 hash
    This ensures same URL always maps to same cache key
    """
    return hashlib.md5(youtube_url.encode()).hexdigest()

async def download_youtube_audio(
    youtube_url: str,
    progress_tracker: ProgressTracker | None = None
) -> str:
    try:
        logger.info(f"[DOWNLOAD] Starting for URL: {youtube_url}")

        # -----------------------------
        # Cache setup
        # -----------------------------
        video_id = get_video_id_from_url(youtube_url)
        cache_dir = AUDIO_DIR / video_id

        async with _download_locks[video_id]:
            cache_dir.mkdir(parents=True, exist_ok=True)

            metadata_path = cache_dir / "metadata.json"
            cached_files = _cached_files(cache_dir, "audio")
            if cached_files:
                logger.info(f"[DOWNLOAD] Cache hit: {cached_files[0]}")
                metadata = json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
                if progress_tracker:
                    progress_tracker.update("downloading", 100, "Using cached audio")
                return str(cached_files[0]), metadata

            if progress_tracker:
                progress_tracker.update("downloading", 10, "Downloading audio...")

            output_template = str(cache_dir / "audio.%(ext)s")

            # -----------------------------
            # STEP 1: get metadata
            # -----------------------------
            meta_cmd = [
                "yt-dlp",
                "--quiet",
                "--no-warnings",
                "--dump-json",
                youtube_url,
            ]

            metadata = {}  # ALWAYS safe default

            meta_proc = await _run_yt_dlp(meta_cmd, timeout=60, label="META")

            if meta_proc.returncode == 0 and meta_proc.stdout:
                metadata = json.loads(meta_proc.stdout.splitlines()[0])

            title = metadata.get("title")
            logger.warning(f"[YT-DLP META] title={title}")

            # -----------------------------
            # STEP 2: download audio
            # -----------------------------
            cmd = [
                "yt-dlp",
                "--quiet",
                "--no-warnings",
                # No player_client override: the android client only exposes the
                # 360p combined format (18, ~96kbps AAC). The default client
                # negotiation gives real audio-only formats (251/140), which is a
                # much better source for stem separation.
                "-f", "bestaudio/best",
                "-x",
                "--audio-format", "wav",
                "--no-playlist",
                "-o", output_template,
                youtube_url,
            ]

            logger.info(f"[DOWNLOAD] Running yt-dlp download...")

            proc = await _run_yt_dlp(cmd, timeout=600, label="DOWNLOAD")

            logger.warning(f"[YT-DLP STDOUT]\n{proc.stdout}")
            if proc.stderr:
                logger.warning(f"[YT-DLP STDERR]\n{proc.stderr}")

            if proc.returncode != 0:
                if progress_tracker:
                    progress_tracker.error(f"Download failed: {proc.stderr}")
                raise ValueError(f"yt-dlp failed: {proc.stderr}")

            # -----------------------------
            # STEP 3: find output file
            # -----------------------------
            files = _cached_files(cache_dir, "audio")
            logger.info(f"[DOWNLOAD] Files found: {[f.name for f in files]}")

            if not files:
                raise ValueError("No audio file created")

            audio_file = str(files[0])

            logger.info(f"[DOWNLOAD] Success: {audio_file}")

            if metadata:
                metadata_path.write_text(json.dumps(metadata))

            if progress_tracker:
                progress_tracker.update("downloading", 100, "Download complete")

            return audio_file, metadata

    except asyncio.TimeoutError:
        logger.error("[DOWNLOAD] Timeout")
        if progress_tracker:
            progress_tracker.error("Download timed out")
        raise ValueError("Download timed out")

    except Exception as e:
        logger.error(f"[DOWNLOAD] Unexpected error: {e}", exc_info=True)
        if progress_tracker:
            progress_tracker.error(f"Download error: {e}")
        raise

def _video_height(path: Path) -> int | None:
    """Height in pixels of the first video stream, or None if probing fails."""
    try:
        proc = subprocess.run(
            ["ffprobe", "-v", "quiet", "-select_streams", "v:0",
             "-show_entries", "stream=height", "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, timeout=30,
        )
        return int(proc.stdout.strip().splitlines()[0])
    except Exception:
        return None


async def download_youtube_video(youtube_url: str, progress_tracker: ProgressTracker | None = None) -> str:
    """
    Download YouTube video with caching and progress tracking.
    
    If the video was previously downloaded, returns cached file.
    Otherwise, downloads and caches for future use.
    
    Args:
        youtube_url: YouTube video URL
        progress_tracker: Optional progress tracker for live updates
        
    Returns:
        Path to video file (cached or newly downloaded)
    """
    try:
        logger.info(f"[VIDEO] Starting video download for URL: {youtube_url}")
        
        # Generate deterministic cache key from URL
        video_id = get_video_id_from_url(youtube_url)
        cache_dir = VIDEO_DIR / video_id

        async with _download_locks[video_id]:
            cache_dir.mkdir(parents=True, exist_ok=True)

            # Check if already cached. Files from before the 1080p format fix are
            # only 360p — treat those as stale so they get upgraded on the next
            # download pass (e.g. a reanalyze) instead of being served forever.
            logger.info(f"[VIDEO] Checking cache: {cache_dir}")
            cached_files = _cached_files(cache_dir, "video")
            if cached_files:
                height = _video_height(cached_files[0])
                if height is None or height >= 720:
                    logger.info(f"[VIDEO] Found cached file: {cached_files[0]} ({height}p)")
                    if progress_tracker:
                        progress_tracker.update("downloading", 50, "Using cached video")
                    return str(cached_files[0])
                logger.info(f"[VIDEO] Cached file is only {height}p — re-downloading at higher quality")
                for f in cached_files:
                    f.unlink(missing_ok=True)

            if progress_tracker:
                progress_tracker.update("downloading", 20, "Downloading video from YouTube...")

            output_template = str(cache_dir / "video.%(ext)s")
            logger.info(f"[VIDEO] Output template: {output_template}")

            # "best[ext=mp4]" only picks YouTube's pre-merged mp4, which is capped
            # around 360p. Download the best separate video+audio streams (up to
            # 1080p) and let ffmpeg merge them into an mp4 instead.
            cmd = [
                "yt-dlp",
                "--quiet",
                "--no-warnings",
                "-f", "bestvideo[vcodec^=avc1][height<=1080]+bestaudio[ext=m4a]/bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[ext=mp4]/best",
                "--merge-output-format", "mp4",
                "-o", output_template,
                youtube_url,
            ]

            logger.info(f"[VIDEO] Running yt-dlp...")

            proc = await _run_yt_dlp(cmd, timeout=600, label="VIDEO")

            logger.info(f"[VIDEO] Process completed with return code: {proc.returncode}")

            if proc.returncode != 0:
                logger.error(f"[VIDEO] Error: {proc.stderr}")
                if progress_tracker:
                    progress_tracker.error(f"Video download failed: {proc.stderr}")
                raise ValueError(f"yt-dlp failed: {proc.stderr}")

            # Find resulting file
            logger.info(f"[VIDEO] Looking for video files in: {cache_dir}")
            files = _cached_files(cache_dir, "video")
            logger.info(f"[VIDEO] Found {len(files)} files")

            if not files:
                logger.error(f"[VIDEO] No video file created in {cache_dir}")
                if progress_tracker:
                    progress_tracker.error("No video file created")
                raise ValueError("No video file created")

            video_file = str(files[0])
            logger.info(f"[VIDEO] Success! Returning file: {video_file}")

            if progress_tracker:
                progress_tracker.update("downloading", 80, "Video download complete")

            return video_file

    except asyncio.TimeoutError:
        logger.error("[VIDEO] Process timed out after 10 minutes")
        if progress_tracker:
            progress_tracker.error("Video download timed out")
        raise ValueError("Video download timed out - video may be too long or connection too slow")
    except Exception as e:
        logger.error(f"[VIDEO] Unexpected error: {str(e)}", exc_info=True)
        if progress_tracker:
            progress_tracker.error(f"Video download error: {str(e)}")
        raise