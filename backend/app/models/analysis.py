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
    video_path: str | None = None
    instrumental_path: str | None = None
    # {stem_name: path} — derived from files on disk, not stored in the DB
    stems: dict[str, str] | None = None
    video_title: str | None = None
