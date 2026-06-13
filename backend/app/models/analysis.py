from pydantic import BaseModel
from typing import List


class Chord(BaseModel):
    start: float  # timestamp in seconds
    end: float
    chord: str


class AnalysisRequest(BaseModel):
    youtube_url: str


class AnalysisResult(BaseModel):
    key: str
    chords: List[Chord]
    audio_path: str | None = None
