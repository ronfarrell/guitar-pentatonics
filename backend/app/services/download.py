import asyncio
import subprocess
from pathlib import Path
import hashlib
from app.services.progress import ProgressTracker
import logging

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


async def download_youtube_audio(youtube_url: str, progress_tracker: ProgressTracker | None = None) -> str:
    """
    Download YouTube audio with caching and progress tracking.
    
    If the video was previously downloaded, returns cached file.
    Otherwise, downloads and caches for future use.
    
    Args:
        youtube_url: YouTube video URL
        progress_tracker: Optional progress tracker for live updates
        
    Returns:
        Path to audio file (cached or newly downloaded)
    """
    try:
        logger.info(f"[DOWNLOAD] Starting for URL: {youtube_url}")
        
        # Generate deterministic cache key from URL
        video_id = get_video_id_from_url(youtube_url)
        cache_dir = AUDIO_DIR / video_id
        cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Check if already cached
        logger.info(f"[DOWNLOAD] Checking cache: {cache_dir}")
        cached_files = list(cache_dir.glob("audio.*"))
        if cached_files:
            logger.info(f"[DOWNLOAD] Found cached file: {cached_files[0]}")
            if progress_tracker:
                progress_tracker.update("downloading", 100, "Using cached audio")
            return str(cached_files[0])
        
        if progress_tracker:
            progress_tracker.update("downloading", 10, "Downloading audio from YouTube...")
        
        output_template = str(cache_dir / "audio.%(ext)s")
        logger.info(f"[DOWNLOAD] Output template: {output_template}")

        cmd = [
            "yt-dlp",
            "-f", "bestaudio",
            "-x",
            "--audio-format", "wav",   
            "--audio-quality", "0",
            "-o", output_template,
            youtube_url,
        ]

        logger.info(f"[DOWNLOAD] Running yt-dlp...")
        
        # Run with timeout to prevent hanging
        proc = await asyncio.wait_for(
            asyncio.to_thread(
                subprocess.run,
                cmd,
                capture_output=True,
                text=True,
            ),
            timeout=300  # 5 minute timeout
        )

        logger.info(f"[DOWNLOAD] Process completed with return code: {proc.returncode}")
        
        if proc.returncode != 0:
            logger.error(f"[DOWNLOAD] Error: {proc.stderr}")
            if progress_tracker:
                progress_tracker.error(f"Download failed: {proc.stderr}")
            raise ValueError(f"yt-dlp failed: {proc.stderr}")

        # Find resulting file
        logger.info(f"[DOWNLOAD] Looking for audio files in: {cache_dir}")
        files = list(cache_dir.glob("audio.*"))
        logger.info(f"[DOWNLOAD] Found {len(files)} files")
        
        if not files:
            logger.error(f"[DOWNLOAD] No audio file created in {cache_dir}")
            if progress_tracker:
                progress_tracker.error("No audio file created")
            raise ValueError("No audio file created")

        audio_file = str(files[0])
        logger.info(f"[DOWNLOAD] Success! Returning file: {audio_file}")
        
        if progress_tracker:
            progress_tracker.update("downloading", 100, "Download complete")
        
        return audio_file
        
    except asyncio.TimeoutError:
        logger.error("[DOWNLOAD] Process timed out after 5 minutes")
        if progress_tracker:
            progress_tracker.error("Download timed out")
        raise ValueError("Download timed out - video may be too long or connection too slow")
    except Exception as e:
        logger.error(f"[DOWNLOAD] Unexpected error: {str(e)}", exc_info=True)
        if progress_tracker:
            progress_tracker.error(f"Download error: {str(e)}")
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

        cmd = [
            "yt-dlp",
            "-f", "best[ext=mp4]",  # Best quality MP4
            "-o", output_template,
            youtube_url,
        ]

        logger.info(f"[VIDEO] Running yt-dlp...")
        
        # Run with timeout to prevent hanging
        proc = await asyncio.wait_for(
            asyncio.to_thread(
                subprocess.run,
                cmd,
                capture_output=True,
                text=True,
            ),
            timeout=600  # 10 minute timeout for video
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