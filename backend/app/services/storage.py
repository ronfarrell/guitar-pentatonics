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
            chords TEXT NOT NULL,  -- JSON array
            audio_path TEXT,
            video_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Check if video_path column exists, if not add it (migration)
    cursor.execute("PRAGMA table_info(analyses)")
    columns = [col[1] for col in cursor.fetchall()]
    if "video_path" not in columns:
        logger.info("[DB] Adding video_path column to existing table...")
        cursor.execute("ALTER TABLE analyses ADD COLUMN video_path TEXT")
    
    conn.close()
    logger.info("[DB] Database ready")


def get_url_hash(youtube_url: str) -> str:
    """Generate deterministic hash from YouTube URL"""
    return hashlib.md5(youtube_url.encode()).hexdigest()


def get_cached_analysis(youtube_url: str) -> AnalysisResult | None:
    """
    Check if we already have analysis for this YouTube URL
    
    Args:
        youtube_url: YouTube URL
        
    Returns:
        AnalysisResult if cached, None otherwise
    """
    init_db()
    logger.info(f"[DB] Checking cache for: {youtube_url}")
    
    conn = _get_db_connection()
    cursor = conn.cursor()
    
    url_hash = get_url_hash(youtube_url)
    cursor.execute(
        "SELECT key, chords, audio_path, video_path FROM analyses WHERE url_hash = ?",
        (url_hash,)
    )
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        logger.info(f"[DB] Cache miss")
        return None
    
    logger.info(f"[DB] Cache hit!")
    key, chords_json, audio_path, video_path = row
    from app.models.analysis import Chord
    chords = [Chord(**chord) for chord in json.loads(chords_json)]
    
    return AnalysisResult(key=key, chords=chords, audio_path=audio_path, video_path=video_path)


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
        logger.info(f"[DB] Inserting analysis record...")
        cursor.execute("""
            INSERT INTO analyses (youtube_url, url_hash, key, chords, audio_path, video_path)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (youtube_url, url_hash, result.key, chords_json, result.audio_path, result.video_path))
        
        logger.info(f"[DB] Insert successful")
        record_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        # URL already exists, update it
        logger.info(f"[DB] URL exists, updating...")
        cursor.execute("""
            UPDATE analyses SET key = ?, chords = ?, audio_path = ?, video_path = ?
            WHERE url_hash = ?
        """, (result.key, chords_json, result.audio_path, result.video_path, url_hash))
        
        logger.info(f"[DB] Update successful")
        record_id = cursor.lastrowid
    finally:
        conn.close()
        logger.info(f"[DB] Database connection closed")
    
    return record_id


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
