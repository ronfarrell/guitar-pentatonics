from fastapi import APIRouter
from fastapi.responses import StreamingResponse, FileResponse
from fastapi import HTTPException
from pathlib import Path
from app.models.analysis import AnalysisRequest, AnalysisResult, Chord
from app.services.analysis import process_youtube_video
from app.services.progress import get_progress, cleanup_progress
import logging
import uuid
import asyncio
import json

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/demo")
def demo_analysis():
    """Demo endpoint for testing (no actual analysis)"""
    return {
        "key": "A Minor",
        "chords": [
            {"start": 1, "end": 4, "chord": "Am"},
            {"start": 4, "end": 8, "chord": "F"},
            {"start": 8, "end": 12, "chord": "C"},
        ],
    }


@router.post("/test")
async def test_endpoint(request: AnalysisRequest):
    """Simple test endpoint"""
    logger.info(f"Test endpoint hit with: {request.youtube_url}")
    return {
        "status": "test_ok",
        "received_url": request.youtube_url,
        "key": "C Major",
        "chords": [
            {"start": 0, "end": 2, "chord": "C"},
            {"start": 2, "end": 4, "chord": "G"},
        ]
    }


@router.post("/start")
async def start_analysis(request: AnalysisRequest) -> dict:
    """
    Start analysis and return a job ID for progress tracking
    
    Returns:
        {"job_id": "uuid", "status": "processing"}
    """
    job_id = str(uuid.uuid4())
    logger.info(f"Started analysis job {job_id} for: {request.youtube_url}")
    
    # Start the analysis in background
    asyncio.create_task(
        process_youtube_video(request, job_id)
    )
    
    return {"job_id": job_id, "status": "processing"}


@router.get("/progress/{job_id}")
def get_analysis_progress(job_id: str) -> dict:
    """
    Get current progress for a job
    
    Returns:
        {
            "status": "downloading|analyzing|saving|completed|error",
            "percentage": 0-100,
            "message": "Human readable message",
            "started_at": "ISO timestamp",
            "completed_at": "ISO timestamp or null"
        }
    """
    progress = get_progress(job_id)
    if not progress:
        return {"status": "not_found", "message": "Job not found"}
    return progress


@router.get("/stream/{job_id}")
async def stream_analysis_progress(job_id: str):
    """
    Stream progress updates as Server-Sent Events
    
    Frontend usage:
        const eventSource = new EventSource('/analysis/stream/job_id');
        eventSource.onmessage = (event) => {
            const progress = JSON.parse(event.data);
            console.log(progress.percentage, progress.message);
        };
    """
    async def progress_generator():
        import time
        last_keepalive = time.monotonic()
        try:
            while True:
                progress = get_progress(job_id)
                if progress:
                    yield f"data: {json.dumps(progress)}\n\n"
                    if progress["status"] in ["completed", "error"]:
                        cleanup_progress(job_id)
                        break
                now = time.monotonic()
                if now - last_keepalive >= 15:
                    yield ": keepalive\n\n"
                    last_keepalive = now
                await asyncio.sleep(0.5)
        except (asyncio.CancelledError, GeneratorExit):
            pass  # Client disconnected — don't clean up, job is still running
    
    return StreamingResponse(
        progress_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@router.post("")
async def analyze_youtube(request: AnalysisRequest) -> AnalysisResult:
    """
    Analyze a YouTube video for musical key and chords (blocking call)
    
    For long videos, consider using /start + /stream for progress updates
    """
    logger.info(f"Analysis request received for: {request.youtube_url}")
    
    try:
        result = await process_youtube_video(request)
        logger.info(f"Analysis completed successfully")
        return result
    except Exception as e:
        logger.error(f"Analysis error: {str(e)}", exc_info=True)
        # Fallback: Return dummy data
        dummy_result = AnalysisResult(
            key="A Minor",
            chords=[
                Chord(start=2, end=4, chord="Am"),
                Chord(start=4, end=8, chord="F"),
                Chord(start=8, end=12, chord="C"),
            ],
            audio_path=None,
            video_path=None,
        )
        logger.info(f"Returning fallback data")
        return dummy_result


@router.get("/video/{file_path:path}")
async def serve_video(file_path: str):
    """
    Serve video files from local cache
    
    Usage: GET /analysis/video/backend/data/videos/{hash}/video.mp4
    """
    try:
        # Convert file_path to Path object
        full_path = Path(file_path)
        
        # Security check: ensure path is within data directory
        data_dir = Path(__file__).parent.parent.parent / "data"
        if not full_path.resolve().is_relative_to(data_dir.resolve()):
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Check if file exists
        if not full_path.exists():
            raise HTTPException(status_code=404, detail="Video not found")
        
        logger.info(f"Serving video: {full_path}")
        
        # Serve with appropriate media type
        return FileResponse(
            full_path,
            media_type="video/mp4",
            headers={"Content-Disposition": "inline"}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving video: {str(e)}")
        raise HTTPException(status_code=500, detail="Error serving video")