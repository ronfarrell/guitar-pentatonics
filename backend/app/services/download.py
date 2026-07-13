import asyncio
import subprocess
import json
from pathlib import Path
import hashlib
from app.services.progress import ProgressTracker
import logging
import os

env = os.environ.copy()
env["PATH"] = "/home/ron/.nvm/versions/node/v24.16.0/bin:" + env["PATH"]
logger = logging.getLogger(__name__)

AUDIO_DIR = Path(__file__).parent.parent.parent / "data" / "audio"
VIDEO_DIR = Path(__file__).parent.parent.parent / "data" / "videos"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
VIDEO_DIR.mkdir(parents=True, exist_ok=True)


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
        cache_dir.mkdir(parents=True, exist_ok=True)

        metadata_path = cache_dir / "metadata.json"
        cached_files = list(cache_dir.glob("audio.*"))
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

        meta_proc = await asyncio.wait_for(
            asyncio.to_thread(
                subprocess.run,
                meta_cmd,
                capture_output=True,
                text=True,
                env=env
            ),
            timeout=60
        )

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
            "--extractor-args", "youtube:player_client=android",
            "-f", "bestaudio/best",
            "-x",
            "--audio-format", "wav",
            "--no-playlist",
            "-o", output_template,
            youtube_url,
        ]

        logger.info(f"[DOWNLOAD] Running yt-dlp download...")

        proc = await asyncio.wait_for(
            asyncio.to_thread(
                subprocess.run,
                cmd,
                capture_output=True,
                text=True,
                env=env
            ),
            timeout=600
        )

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
        files = sorted(cache_dir.glob("audio.*"))
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
        cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Check if already cached
        logger.info(f"[VIDEO] Checking cache: {cache_dir}")
        cached_files = list(cache_dir.glob("video.*"))
        if cached_files:
            logger.info(f"[VIDEO] Found cached file: {cached_files[0]}")
            if progress_tracker:
                progress_tracker.update("downloading", 50, "Using cached video")
            return str(cached_files[0])
        
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

        proc = await asyncio.wait_for(
            asyncio.to_thread(
                subprocess.run,
                cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                env=env
            ),
            timeout=600
        )

        logger.info(f"[VIDEO] Process completed with return code: {proc.returncode}")
        
        if proc.returncode != 0:
            logger.error(f"[VIDEO] Error: {proc.stderr}")
            if progress_tracker:
                progress_tracker.error(f"Video download failed: {proc.stderr}")
            raise ValueError(f"yt-dlp failed: {proc.stderr}")

        # Find resulting file
        logger.info(f"[VIDEO] Looking for video files in: {cache_dir}")
        files = list(cache_dir.glob("video.*"))
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