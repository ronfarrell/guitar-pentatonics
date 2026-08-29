"""Playlist persistence — playlists and their ordered song membership.

Membership rows store `url_hash` rather than `analyses.id`. A reanalyze deletes
the analyses row and reinserts it with a fresh autoincrement id, so an id-keyed
playlist would quietly lose the song; url_hash survives that round trip. The API
still speaks in song ids, so this module translates at the boundary.
"""
import logging

from app.services.storage import _get_db_connection, init_db

logger = logging.getLogger(__name__)


def _hash_for_song_id(cursor, song_id: int) -> str | None:
    cursor.execute("SELECT url_hash FROM analyses WHERE id = ?", (song_id,))
    row = cursor.fetchone()
    return row[0] if row else None


def _song_ids_for(cursor, playlist_id: int) -> list[int]:
    """Ordered song ids for a playlist, skipping entries whose song is gone."""
    cursor.execute(
        """
        SELECT a.id
        FROM playlist_songs ps
        JOIN analyses a ON a.url_hash = ps.url_hash
        WHERE ps.playlist_id = ?
        ORDER BY ps.position, ps.added_at
        """,
        (playlist_id,),
    )
    return [row[0] for row in cursor.fetchall()]


def list_playlists() -> list[dict]:
    init_db()
    conn = _get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id, name, created_at FROM playlists ORDER BY position, id")
    rows = cursor.fetchall()

    playlists = [
        {
            "id": row[0],
            "name": row[1],
            "created_at": row[2],
            "song_ids": _song_ids_for(cursor, row[0]),
        }
        for row in rows
    ]

    conn.close()
    return playlists


def get_playlist(playlist_id: int) -> dict | None:
    init_db()
    conn = _get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id, name, created_at FROM playlists WHERE id = ?", (playlist_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return None

    playlist = {
        "id": row[0],
        "name": row[1],
        "created_at": row[2],
        "song_ids": _song_ids_for(cursor, row[0]),
    }

    conn.close()
    return playlist


def create_playlist(name: str) -> dict:
    init_db()
    conn = _get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM playlists")
    position = cursor.fetchone()[0]

    cursor.execute(
        "INSERT INTO playlists (name, position) VALUES (?, ?)",
        (name, position),
    )
    playlist_id = cursor.lastrowid

    cursor.execute("SELECT created_at FROM playlists WHERE id = ?", (playlist_id,))
    created_at = cursor.fetchone()[0]
    conn.close()

    logger.info(f"[PLAYLIST] Created {playlist_id}: {name!r}")
    return {"id": playlist_id, "name": name, "created_at": created_at, "song_ids": []}


def rename_playlist(playlist_id: int, name: str) -> bool:
    init_db()
    conn = _get_db_connection()
    cursor = conn.cursor()

    cursor.execute("UPDATE playlists SET name = ? WHERE id = ?", (name, playlist_id))
    changed = cursor.rowcount > 0
    conn.close()

    return changed


def delete_playlist(playlist_id: int) -> bool:
    init_db()
    conn = _get_db_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM playlists WHERE id = ?", (playlist_id,))
    changed = cursor.rowcount > 0
    cursor.execute("DELETE FROM playlist_songs WHERE playlist_id = ?", (playlist_id,))
    conn.close()

    if changed:
        logger.info(f"[PLAYLIST] Deleted {playlist_id}")
    return changed


def add_song(playlist_id: int, song_id: int, exclusive: bool = True) -> str:
    """Append a song to a playlist.

    Returns "ok", "no_playlist", or "no_song". With `exclusive`, the song is
    first pulled out of every other playlist, matching the folder-style
    behaviour the library UI has always had.
    """
    init_db()
    conn = _get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT 1 FROM playlists WHERE id = ?", (playlist_id,))
    if not cursor.fetchone():
        conn.close()
        return "no_playlist"

    url_hash = _hash_for_song_id(cursor, song_id)
    if url_hash is None:
        conn.close()
        return "no_song"

    if exclusive:
        cursor.execute(
            "DELETE FROM playlist_songs WHERE url_hash = ? AND playlist_id != ?",
            (url_hash, playlist_id),
        )

    cursor.execute(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_songs WHERE playlist_id = ?",
        (playlist_id,),
    )
    position = cursor.fetchone()[0]

    cursor.execute(
        """
        INSERT INTO playlist_songs (playlist_id, url_hash, position)
        VALUES (?, ?, ?)
        ON CONFLICT(playlist_id, url_hash) DO NOTHING
        """,
        (playlist_id, url_hash, position),
    )
    conn.close()

    return "ok"


def remove_song(playlist_id: int, song_id: int) -> str:
    init_db()
    conn = _get_db_connection()
    cursor = conn.cursor()

    url_hash = _hash_for_song_id(cursor, song_id)
    if url_hash is None:
        conn.close()
        return "no_song"

    cursor.execute(
        "DELETE FROM playlist_songs WHERE playlist_id = ? AND url_hash = ?",
        (playlist_id, url_hash),
    )
    conn.close()

    return "ok"


def remove_song_everywhere(song_id: int) -> str:
    """Pull a song out of every playlist (the 'drag back to All Songs' action)."""
    init_db()
    conn = _get_db_connection()
    cursor = conn.cursor()

    url_hash = _hash_for_song_id(cursor, song_id)
    if url_hash is None:
        conn.close()
        return "no_song"

    cursor.execute("DELETE FROM playlist_songs WHERE url_hash = ?", (url_hash,))
    conn.close()

    return "ok"


def reorder_songs(playlist_id: int, song_ids: list[int]) -> str:
    """Rewrite a playlist's ordering. Ids not already in the playlist are ignored."""
    init_db()
    conn = _get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT 1 FROM playlists WHERE id = ?", (playlist_id,))
    if not cursor.fetchone():
        conn.close()
        return "no_playlist"

    for position, song_id in enumerate(song_ids):
        url_hash = _hash_for_song_id(cursor, song_id)
        if url_hash is None:
            continue
        cursor.execute(
            "UPDATE playlist_songs SET position = ? WHERE playlist_id = ? AND url_hash = ?",
            (position, playlist_id, url_hash),
        )

    conn.close()
    return "ok"
