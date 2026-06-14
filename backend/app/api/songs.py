from fastapi import APIRouter
from fastapi.responses import StreamingResponse, FileResponse
from fastapi import HTTPException
from pathlib import Path
from app.services.storage import list_all_analyses

import logging

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/demo")
def dummy_saved_songs():
    """Demo endpoint for getting saved songs"""
    return  {
        "songs": [
            {"name": "song 1", "id": 111},
            {"name": "song 2", "id": 222},
            {"name": "song 3", "id": 333},

        ]
    }


@router.get("")
def list_cached_songs():
    rows = list_all_analyses()

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