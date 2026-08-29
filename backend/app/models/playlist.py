from pydantic import BaseModel, Field


class PlaylistCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)


class PlaylistRename(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)


class PlaylistSongAdd(BaseModel):
    song_id: int


class PlaylistReorder(BaseModel):
    song_ids: list[int]


class Playlist(BaseModel):
    id: int
    name: str
    created_at: str | None = None
    # Ordered; entries whose song has been deleted are omitted.
    song_ids: list[int] = []


class PlaylistList(BaseModel):
    playlists: list[Playlist]
