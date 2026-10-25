"""Accounts and sessions.

Deliberately small: username + password, opaque bearer tokens, everything in
the same SQLite DB as the analyses. Passwords use stdlib scrypt so there's no
extra dependency to install alongside torch.
"""
import hashlib
import hmac
import logging
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone

from app.services.storage import _get_db_connection, init_db

logger = logging.getLogger(__name__)

SESSION_TTL = timedelta(days=30)

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**14, 8, 1


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P
    )
    return f"scrypt${salt.hex()}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, _ = stored.split("$")
    except ValueError:
        return False
    return hmac.compare_digest(_hash_password(password, bytes.fromhex(salt_hex)), stored)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _user_dict(row) -> dict:
    return {"id": row[0], "username": row[1], "display_name": row[2], "created_at": row[3]}


def _claim_orphaned_data(cursor, user_id: int) -> None:
    """Hand everything from the single-user era to the first account.

    Before accounts existed every playlist and song was effectively shared, so
    the first person to register inherits them rather than starting empty.
    """
    cursor.execute("UPDATE playlists SET user_id = ? WHERE user_id IS NULL", (user_id,))
    cursor.execute(
        "INSERT OR IGNORE INTO user_songs (user_id, url_hash) SELECT ?, url_hash FROM analyses",
        (user_id,),
    )
    logger.info(f"[AUTH] User {user_id} claimed pre-account playlists and songs")


def create_user(username: str, password: str, display_name: str | None = None) -> dict | None:
    """Register an account. Returns None if the username is taken."""
    init_db()
    conn = _get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM users")
    is_first = cursor.fetchone()[0] == 0

    try:
        cursor.execute(
            "INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)",
            (username, display_name or username, _hash_password(password)),
        )
    except sqlite3.IntegrityError:
        conn.close()
        return None

    user_id = cursor.lastrowid
    if is_first:
        _claim_orphaned_data(cursor, user_id)

    cursor.execute(
        "SELECT id, username, display_name, created_at FROM users WHERE id = ?", (user_id,)
    )
    user = _user_dict(cursor.fetchone())
    conn.close()

    logger.info(f"[AUTH] Registered user {user_id}: {username!r}")
    return user


def authenticate(username: str, password: str) -> dict | None:
    init_db()
    conn = _get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT id, username, display_name, created_at, password_hash FROM users WHERE username = ?",
        (username,),
    )
    row = cursor.fetchone()
    conn.close()

    if not row or not _verify_password(password, row[4]):
        return None
    return _user_dict(row)


def create_session(user_id: int) -> str:
    """Issue a new bearer token. Only its hash is persisted."""
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(timezone.utc) + SESSION_TTL).isoformat()

    conn = _get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (_hash_token(token), user_id, expires_at),
    )
    # Opportunistic cleanup — cheaper than a scheduled job for a table this small.
    cursor.execute(
        "DELETE FROM sessions WHERE expires_at < ?", (datetime.now(timezone.utc).isoformat(),)
    )
    conn.close()

    return token


def get_user_for_token(token: str) -> dict | None:
    init_db()
    conn = _get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT u.id, u.username, u.display_name, u.created_at
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?
        """,
        (_hash_token(token), datetime.now(timezone.utc).isoformat()),
    )
    row = cursor.fetchone()
    conn.close()

    return _user_dict(row) if row else None


def delete_session(token: str) -> None:
    conn = _get_db_connection()
    conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_hash_token(token),))
    conn.close()


def update_display_name(user_id: int, display_name: str) -> dict | None:
    conn = _get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET display_name = ? WHERE id = ?", (display_name, user_id))
    cursor.execute(
        "SELECT id, username, display_name, created_at FROM users WHERE id = ?", (user_id,)
    )
    row = cursor.fetchone()
    conn.close()

    return _user_dict(row) if row else None


def change_password(user_id: int, current: str, new: str, keep_token: str) -> bool:
    """Swap the password and sign out every other session. False if `current` is wrong."""
    conn = _get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    if not row or not _verify_password(current, row[0]):
        conn.close()
        return False

    cursor.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?", (_hash_password(new), user_id)
    )
    cursor.execute(
        "DELETE FROM sessions WHERE user_id = ? AND token_hash != ?",
        (user_id, _hash_token(keep_token)),
    )
    conn.close()

    logger.info(f"[AUTH] User {user_id} changed password")
    return True
