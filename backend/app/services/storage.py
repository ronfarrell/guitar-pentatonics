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


def delete_analysis_by_id(song_id: int) -> tuple[str | None, str | None]:
    """Delete a song from DB and return (audio_path, video_path) for file cleanup."""
    init_db()
    conn = _get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT audio_path, video_path FROM analyses WHERE id = ?", (song_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return None, None

    audio_path, video_path = row
    cursor.execute("DELETE FROM analyses WHERE id = ?", (song_id,))
    conn.close()

    return audio_path, video_path


def clear_cache_for_reanalyze(song_id: int) -> tuple[str | None, str | None]:
    """Delete only the DB record for a song and return (youtube_url, video_title) so the caller can restart analysis."""
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


def list_all_analyses(limit: int = 100):
    """List all analysis results from the database"""
    init_db()
    
    conn = _get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, youtube_url, url_hash, key, video_title FROM analyses LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    
    return rows