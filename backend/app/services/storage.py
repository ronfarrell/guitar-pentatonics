"""Storage service for analysis results"""
import sqlite3
import json
from pathlib import Path
from datetime import datetime
from app.models.analysis import AnalysisResult
import hashlib
import logging

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent.parent / "data" / "analysis.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def _get_db_connection():
    """Get database connection with timeout"""
    conn = sqlite3.connect(DB_PATH, timeout=10.0)  # 10 second timeout
    conn.isolation_level = None  # Autocommit mode
    return conn


def init_db():
    """Initialize SQLite database"""
    logger.info("[DB] Initializing database...")
    conn = _get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS analyses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            youtube_url TEXT UNIQUE NOT NULL,
            url_hash TEXT UNIQUE NOT NULL,
            key TEXT NOT NULL,
            video_title TEXT,
            chords TEXT NOT NULL,  -- JSON array
            audio_path TEXT,
            video_path TEXT,
            instrumental_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Check if video_path column exists, if not add it (migration)
    cursor.execute("PRAGMA table_info(analyses)")
    columns = [col[1] for col in cursor.fetchall()]
    if "video_path" not in columns:
        logger.info("[DB] Adding video_path column to existing table...")
        cursor.execute("ALTER TABLE analyses ADD COLUMN video_path TEXT")
    if "instrumental_path" not in columns:
        logger.info("[DB] Adding instrumental_path column to existing table...")
        cursor.execute("ALTER TABLE analyses ADD COLUMN instrumental_path TEXT")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Membership is keyed by url_hash, not analyses.id: reanalyzing a song
    # deletes and reinserts its row (new autoincrement id), which would
    # silently drop it from every playlist. url_hash is stable per URL.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS playlist_songs (
            playlist_id INTEGER NOT NULL,
            url_hash TEXT NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (playlist_id, url_hash)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL COLLATE NOCASE,
            display_name TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Only a sha256 of each token is stored, so a leaked DB can't be replayed
    # as live sessions.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL
        )
    """)

    # Per-user library. analyses is a shared cache (one download/analysis per
    # URL no matter how many people want it); this decides who sees what.
    # Keyed by url_hash for the same reanalyze reason as playlist_songs.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_songs (
            user_id INTEGER NOT NULL,
            url_hash TEXT NOT NULL,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, url_hash)
        )
    """)

    # TV-mode rooms, saved so a backend restart (or a dev --reload) is a
    # reconnect blip rather than the end of the party. `state` is JSON:
    # queue, now playing, history, display settings.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS rooms (
            id TEXT PRIMARY KEY,
            owner_id INTEGER NOT NULL,
            owner_name TEXT NOT NULL,
            state TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Playlists predate users; rows left NULL are claimed by the first account.
    cursor.execute("PRAGMA table_info(playlists)")
    if "user_id" not in [col[1] for col in cursor.fetchall()]:
        logger.info("[DB] Adding user_id column to playlists...")
        cursor.execute("ALTER TABLE playlists ADD COLUMN user_id INTEGER")

    conn.close()
    logger.info("[DB] Database ready")


def get_url_hash(youtube_url: str) -> str:
    """Generate deterministic hash from YouTube URL"""
    return hashlib.md5(youtube_url.encode()).hexdigest()


def get_cached_analysis(youtube_url: str) -> AnalysisResult | None:
    """
    Check if we already have analysis for this YouTube URL
    """
    init_db()
    logger.info(f"[DB] Checking cache for: {youtube_url}")

    conn = _get_db_connection()
    cursor = conn.cursor()

    url_hash = get_url_hash(youtube_url)

    cursor.execute(
        """
        SELECT key, video_title, chords, audio_path, video_path, instrumental_path
        FROM analyses
        WHERE url_hash = ?
        """,
        (url_hash,)
    )

    row = cursor.fetchone()
    conn.close()

    if not row:
        logger.info("[DB] Cache miss")
        return None

    logger.info("[DB] Cache hit!")

    key, video_title, chords_json, audio_path, video_path, instrumental_path = row

    logger.warning(f"[DB] Cached video title: {video_title}")
    logger.warning(f"[DB] Cached audio path: {audio_path}")
    logger.warning(f"[DB] Cached video path: {video_path}")

    from app.models.analysis import Chord
    chords = [Chord(**chord) for chord in json.loads(chords_json)]

    from app.services.separation import existing_stems

    result = AnalysisResult(
        key=key,
        chords=chords,
        audio_path=audio_path,
        video_path=video_path,
        instrumental_path=instrumental_path,
        stems=existing_stems(audio_path),
    )

    # attach title if your model supports it
    if hasattr(result, "video_title"):
        result.video_title = video_title

    logger.info(f"[DB] Cached chords count: {len(chords)}")

    return result

def save_analysis(youtube_url: str, result: AnalysisResult) -> int:
    """
    Save analysis result to database with YouTube URL as unique key
    
    Args:
        youtube_url: Original YouTube URL
        result: AnalysisResult object
        
    Returns:
        Database ID of saved record
    """
    logger.info(f"[DB] Starting save...")
    init_db()
    
    logger.info(f"[DB] Connecting to database...")
    conn = _get_db_connection()
    cursor = conn.cursor()
    
    url_hash = get_url_hash(youtube_url)
    chords_json = json.dumps([chord.model_dump() for chord in result.chords])
    
    try:

        logger.info("[DB] Saving analysis")
        logger.info(f"[DB] youtube_url = {youtube_url}")
        logger.info(f"[DB] key = {result.key}")
        logger.info(f"[DB] video_title = {result.video_title}")
        logger.info(f"[DB] audio_path = {result.audio_path}")
        logger.info(f"[DB] video_path = {result.video_path}")
        logger.info(f"[DB] chords count = {len(result.chords)}")

        logger.info(f"[DB] Inserting analysis record...")
        cursor.execute("""
            INSERT INTO analyses (youtube_url, url_hash, key, chords, audio_path, video_path, instrumental_path, video_title)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (youtube_url, url_hash, result.key, chords_json, result.audio_path, result.video_path, result.instrumental_path, result.video_title  ))
        
        logger.info(f"[DB] Insert successful")
        record_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        # URL already exists, update it
        logger.info(f"[DB] URL exists, updating...")
        cursor.execute("""
            UPDATE analyses SET key = ?, chords = ?, audio_path = ?, video_path = ?, instrumental_path = ?
            WHERE url_hash = ?
        """, (result.key, chords_json, result.audio_path, result.video_path, result.instrumental_path, url_hash))
        
        logger.info(f"[DB] Update successful")
        record_id = cursor.lastrowid
    finally:
        conn.close()
        logger.info(f"[DB] Database connection closed")
    
    return record_id


def set_instrumental_path(youtube_url: str, instrumental_path: str) -> None:
    """Record the generated instrumental file for an already-analyzed song"""
    init_db()
    conn = _get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE analyses SET instrumental_path = ? WHERE url_hash = ?",
        (instrumental_path, get_url_hash(youtube_url)),
    )
    conn.close()
    logger.info(f"[DB] Instrumental path saved for: {youtube_url}")


def get_analysis(record_id: int) -> AnalysisResult | None:
    """Retrieve analysis result from database by ID"""
    init_db()
    
    conn = _get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT key, chords, audio_path, video_path FROM analyses WHERE id = ?", (record_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return None
    
    key, chords_json, audio_path, video_path = row
    from app.models.analysis import Chord
    chords = [Chord(**chord) for chord in json.loads(chords_json)]
    
    return AnalysisResult(key=key, chords=chords, audio_path=audio_path, video_path=video_path)


def add_to_library(user_id: int, youtube_url: str) -> None:
    """Put a URL in a user's library. Safe to call before the analysis exists:
    listings join on analyses, so a link whose analysis failed stays invisible."""
    init_db()
    conn = _get_db_connection()
    conn.execute(
        "INSERT OR IGNORE INTO user_songs (user_id, url_hash) VALUES (?, ?)",
        (user_id, get_url_hash(youtube_url)),
    )
    conn.close()


def in_library(user_id: int, song_id: int) -> bool:
    init_db()
    conn = _get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT 1 FROM analyses a
        JOIN user_songs us ON us.url_hash = a.url_hash AND us.user_id = ?
        WHERE a.id = ?
        """,
        (user_id, song_id),
    )
    found = cursor.fetchone() is not None
    conn.close()
    return found


def remove_from_library(user_id: int, song_id: int) -> tuple[bool, str | None, str | None]:
    """Drop a song from one user's library and playlists.

    Returns (found, audio_path, video_path). The paths are only set when no
    other user still has the song — then the shared analysis row is deleted
    too and the caller should remove the files. Otherwise they're None and
    the cache stays for everyone else.
    """
    init_db()
    conn = _get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT a.audio_path, a.video_path, a.url_hash
        FROM analyses a
        JOIN user_songs us ON us.url_hash = a.url_hash AND us.user_id = ?
        WHERE a.id = ?
        """,
        (user_id, song_id),
    )
    row = cursor.fetchone()

    if not row:
        conn.close()
        return False, None, None

    audio_path, video_path, url_hash = row
    cursor.execute(
        "DELETE FROM user_songs WHERE user_id = ? AND url_hash = ?", (user_id, url_hash)
    )
    # Deleting a song is permanent, so drop it from any of the user's playlists.
    # (Reanalyze deliberately does not do this — see clear_cache_for_reanalyze.)
    cursor.execute(
        """
        DELETE FROM playlist_songs
        WHERE url_hash = ? AND playlist_id IN (SELECT id FROM playlists WHERE user_id = ?)
        """,
        (url_hash, user_id),
    )

    cursor.execute("SELECT 1 FROM user_songs WHERE url_hash = ? LIMIT 1", (url_hash,))
    if cursor.fetchone():
        conn.close()
        return True, None, None

    cursor.execute("DELETE FROM analyses WHERE id = ?", (song_id,))
    conn.close()

    return True, audio_path, video_path


def clear_cache_for_reanalyze(song_id: int) -> tuple[str | None, str | None]:
    """Delete only the DB record for a song and return (youtube_url, video_title) so the caller can restart analysis.

    Playlist membership is intentionally left alone: it hangs off url_hash,
    which the reinserted row reuses, so the song stays in its playlist.
    """
    init_db()
    conn = _get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT youtube_url, video_title FROM analyses WHERE id = ?", (song_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return None, None

    youtube_url, video_title = row
    cursor.execute("DELETE FROM analyses WHERE id = ?", (song_id,))
    conn.close()

    return youtube_url, video_title


def list_library(user_id: int, limit: int = 100):
    """List the analyses in one user's library"""
    init_db()

    conn = _get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT a.id, a.youtube_url, a.url_hash, a.key, a.video_title
        FROM analyses a
        JOIN user_songs us ON us.url_hash = a.url_hash
        WHERE us.user_id = ?
        ORDER BY us.added_at, a.id
        LIMIT ?
        """,
        (user_id, limit),
    )
    rows = cursor.fetchall()
    conn.close()

    return rows


def get_library_song(user_id: int, song_id: int) -> dict | None:
    """One song from a user's library, with what a shared queue needs to show it."""
    init_db()
    conn = _get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT a.id, a.youtube_url, a.url_hash, a.video_title, a.key
        FROM analyses a
        JOIN user_songs us ON us.url_hash = a.url_hash AND us.user_id = ?
        WHERE a.id = ?
        """,
        (user_id, song_id),
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None
    return {
        "song_id": row[0],
        "youtube_url": row[1],
        "url_hash": row[2],
        "title": row[3] or "Untitled",
        "key": row[4],
    }
