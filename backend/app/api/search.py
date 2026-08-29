from fastapi import APIRouter, HTTPException, Query

from app.models.search import SearchResponse
from app.services.search import search_youtube

import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/", response_model=SearchResponse)
async def search(
    q: str = Query(..., min_length=1, max_length=200, description="Search query"),
    limit: int = Query(10, ge=1, le=25),
):
    """Search YouTube for videos to analyze."""
    try:
        results = await search_youtube(q, limit)
    except ValueError as e:
        # yt-dlp failed or timed out — upstream problem, not a client error.
        raise HTTPException(status_code=502, detail=str(e))

    return SearchResponse(query=q, results=results)
