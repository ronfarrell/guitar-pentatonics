"""Main analysis orchestration service"""
from app.models.analysis import AnalysisRequest, AnalysisResult, Chord
from app.services.download import download_youtube_audio, download_youtube_video
from app.services.dsp import analyze_audio
from app.services.storage import save_analysis, get_cached_analysis
from app.services.progress import ProgressTracker
import logging

logger = logging.getLogger(__name__)


async def process_youtube_video(request: AnalysisRequest, job_id: str | None = None) -> AnalysisResult:
    """
    Complete analysis pipeline with caching and progress tracking:
    1. Check if video already analyzed → return cached result
    2. Download audio and video (with caching by URL)
    3. Run DSP/ML analysis
    4. Store results
    5. Return result
    
    Args:
        request: AnalysisRequest with youtube_url
        job_id: Optional job ID for progress tracking
        
    Returns:
        AnalysisResult with key and chords (cached or newly analyzed)
    """
    progress = ProgressTracker(job_id) if job_id else None
    
    try:
        # Step 1: Check cache first
        if progress:
            progress.update("checking_cache", 5, "Checking for cached analysis...")
        
        cached_result = get_cached_analysis(request.youtube_url)
        if cached_result:
            logger.info(f"Returning cached analysis for: {request.youtube_url}")
            if progress:
                progress.complete("Found cached analysis")
            return cached_result
        
        logger.info(f"Processing new video: {request.youtube_url}")
        
        # Step 2: Download audio and video (with file caching)
        if progress:
            progress.update("downloading", 10, "Downloading video and audio...")
        
        audio_path, metadata = await download_youtube_audio(request.youtube_url, progress)
        logger.info(f"Audio ready at: {audio_path}")
        
        
        video_path = await download_youtube_video(request.youtube_url, progress)
        logger.info(f"Video ready at: {video_path}")
        

        # Step 3: Run DSP/ML pipeline
        if progress:
            progress.update("analyzing", 50, "Analyzing audio for key and chords...")
        
        analysis_data = await analyze_audio(audio_path)
        
        if progress:
            progress.update("analyzing", 75, "Processing results...")
        
        # Step 4: Create result object
        result = AnalysisResult(
            key=analysis_data["key"],
            chords=analysis_data["chords"],
            audio_path=audio_path,
            video_path=video_path,
            video_title=metadata.get("title")
        )
        
        # Step 5: Store in database
        if progress:
            progress.update("saving", 90, "Saving to database...")
        
        save_analysis(request.youtube_url, result)
        logger.info(f"Analysis saved for: {request.youtube_url}")
        
        # Step 6: Return result
        if progress:
            progress.complete("Analysis complete")
        
        return result
        
    except Exception as e:
        logger.error(f"Analysis error: {str(e)}")
        if progress:
            progress.error(f"Analysis failed: {str(e)}")
        raise
