from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import current_user
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
def list_playlists(user: dict = Depends(current_user)):
    return PlaylistList(playlists=service.list_playlists(user["id"]))


@router.post("", response_model=Playlist, status_code=201)
def create_playlist(body: PlaylistCreate, user: dict = Depends(current_user)):
    return service.create_playlist(user["id"], body.name.strip())


@router.patch("/{playlist_id}", response_model=Playlist)
def rename_playlist(playlist_id: int, body: PlaylistRename, user: dict = Depends(current_user)):
    if not service.rename_playlist(user["id"], playlist_id, body.name.strip()):
        raise HTTPException(status_code=404, detail="Playlist not found")

    return service.get_playlist(user["id"], playlist_id)


@router.delete("/{playlist_id}")
def delete_playlist(playlist_id: int, user: dict = Depends(current_user)):
    if not service.delete_playlist(user["id"], playlist_id):
        raise HTTPException(status_code=404, detail="Playlist not found")

    return {"status": "deleted", "id": playlist_id}


@router.post("/{playlist_id}/songs", response_model=Playlist)
def add_song(playlist_id: int, body: PlaylistSongAdd, user: dict = Depends(current_user)):
    result = service.add_song(user["id"], playlist_id, body.song_id)

    if result == "no_playlist":
        raise HTTPException(status_code=404, detail="Playlist not found")
    if result == "no_song":
        raise HTTPException(status_code=404, detail="Song not found")

    return service.get_playlist(user["id"], playlist_id)


@router.delete("/{playlist_id}/songs/{song_id}", response_model=Playlist)
def remove_song(playlist_id: int, song_id: int, user: dict = Depends(current_user)):
    if service.remove_song(user["id"], playlist_id, song_id) == "no_song":
        raise HTTPException(status_code=404, detail="Song not found")

    playlist = service.get_playlist(user["id"], playlist_id)
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")

    return playlist


@router.delete("/songs/{song_id}")
def remove_song_everywhere(song_id: int, user: dict = Depends(current_user)):
    """Drop a song from every playlist — the 'back to All Songs' action."""
    if service.remove_song_everywhere(user["id"], song_id) == "no_song":
        raise HTTPException(status_code=404, detail="Song not found")

    return {"status": "removed", "song_id": song_id}


@router.put("/{playlist_id}/songs", response_model=Playlist)
def reorder_songs(playlist_id: int, body: PlaylistReorder, user: dict = Depends(current_user)):
    if service.reorder_songs(user["id"], playlist_id, body.song_ids) == "no_playlist":
        raise HTTPException(status_code=404, detail="Playlist not found")

    return service.get_playlist(user["id"], playlist_id)
