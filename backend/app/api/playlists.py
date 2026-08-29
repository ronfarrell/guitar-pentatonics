from fastapi import APIRouter, HTTPException

from app.models.playlist import (
    Playlist,
    PlaylistCreate,
    PlaylistList,
    PlaylistRename,
    PlaylistReorder,
    PlaylistSongAdd,
)
from app.services import playlists as service

import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=PlaylistList)
def list_playlists():
    return PlaylistList(playlists=service.list_playlists())


@router.post("", response_model=Playlist, status_code=201)
def create_playlist(body: PlaylistCreate):
    return service.create_playlist(body.name.strip())


@router.patch("/{playlist_id}", response_model=Playlist)
def rename_playlist(playlist_id: int, body: PlaylistRename):
    if not service.rename_playlist(playlist_id, body.name.strip()):
        raise HTTPException(status_code=404, detail="Playlist not found")

    return service.get_playlist(playlist_id)


@router.delete("/{playlist_id}")
def delete_playlist(playlist_id: int):
    if not service.delete_playlist(playlist_id):
        raise HTTPException(status_code=404, detail="Playlist not found")

    return {"status": "deleted", "id": playlist_id}


@router.post("/{playlist_id}/songs", response_model=Playlist)
def add_song(playlist_id: int, body: PlaylistSongAdd):
    result = service.add_song(playlist_id, body.song_id)

    if result == "no_playlist":
        raise HTTPException(status_code=404, detail="Playlist not found")
    if result == "no_song":
        raise HTTPException(status_code=404, detail="Song not found")

    return service.get_playlist(playlist_id)


@router.delete("/{playlist_id}/songs/{song_id}", response_model=Playlist)
def remove_song(playlist_id: int, song_id: int):
    if service.remove_song(playlist_id, song_id) == "no_song":
        raise HTTPException(status_code=404, detail="Song not found")

    playlist = service.get_playlist(playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")

    return playlist


@router.delete("/songs/{song_id}")
def remove_song_everywhere(song_id: int):
    """Drop a song from every playlist — the 'back to All Songs' action."""
    if service.remove_song_everywhere(song_id) == "no_song":
        raise HTTPException(status_code=404, detail="Song not found")

    return {"status": "removed", "song_id": song_id}


@router.put("/{playlist_id}/songs", response_model=Playlist)
def reorder_songs(playlist_id: int, body: PlaylistReorder):
    if service.reorder_songs(playlist_id, body.song_ids) == "no_playlist":
        raise HTTPException(status_code=404, detail="Playlist not found")

    return service.get_playlist(playlist_id)
