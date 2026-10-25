import asyncio
import uuid
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import current_user
from app.services.storage import list_library, remove_from_library, in_library, clear_cache_for_reanalyze
from app.services.analysis import process_youtube_video
from app.services.background import spawn
from app.models.analysis import AnalysisRequest

import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/demo")
def dummy_saved_songs():
    """Demo endpoint for getting saved songs"""
    return {
        "songs": [
            {"name": "song 1", "id": 111},
            {"name": "song 2", "id": 222},
            {"name": "song 3", "id": 333},
        ]
    }


@router.get("")
def list_cached_songs(user: dict = Depends(current_user)):
    rows = list_library(user["id"])

    return {
        "songs": [
            {
                "id": r[0],
                "youtube_url": r[1],
                "url_hash": r[2],
                "key": r[3],
                "video_title": r[4],
            }
            for r in rows
        ]
    }


@router.delete("/{song_id}")
def delete_song(song_id: int, user: dict = Depends(current_user)):
    """Remove a song from the user's library; if nobody else has it, delete its files too."""
    found, audio_path, video_path = remove_from_library(user["id"], song_id)

    if not found:
        raise HTTPException(status_code=404, detail="Song not found")

    for path_str in [audio_path, video_path]:
        if path_str:
            parent = Path(path_str).parent
            if parent.exists():
                shutil.rmtree(parent, ignore_errors=True)
                logger.info(f"[DELETE] Removed directory: {parent}")

    return {"status": "deleted", "id": song_id}


@router.post("/{song_id}/reanalyze")
async def reanalyze_song(song_id: int, user: dict = Depends(current_user)):
    """
    Re-run chord/key detection for a song.

    Chords-only: audio and video caches are kept. Detection runs on the
    vocals-stripped instrumental (separated first if needed) since vocal
    melody interferes with chord recognition — this is the accuracy pass.
    """
    if not in_library(user["id"], song_id):
        raise HTTPException(status_code=404, detail="Song not found")

    youtube_url, video_title = clear_cache_for_reanalyze(song_id)

    if not youtube_url:
        raise HTTPException(status_code=404, detail="Song not found")

    job_id = str(uuid.uuid4())
    logger.info(f"[REANALYZE] Starting job {job_id} for song {song_id}: {youtube_url}")

    spawn(
        process_youtube_video(
            AnalysisRequest(youtube_url=youtube_url),
            job_id,
            preserved_title=video_title,
            use_instrumental=True,
        ),
        f"reanalyze:{job_id}",
    )

    return {"job_id": job_id, "youtube_url": youtube_url}
