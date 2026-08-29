from pydantic import BaseModel
from typing import List


class SearchResult(BaseModel):
    video_id: str
    title: str
    channel: str
    duration: float | None = None
    view_count: int | None = None
    thumbnail: str
    url: str


class SearchResponse(BaseModel):
    query: str
    results: List[SearchResult]
