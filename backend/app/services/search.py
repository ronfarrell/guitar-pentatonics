import asyncio
import json
import logging
import subprocess
import time

from app.services.download import env

logger = logging.getLogger(__name__)

SEARCH_TIMEOUT = 30
MAX_RESULTS = 25

# Users retype and re-search constantly (the frontend fires on every debounced
# keystroke), and each miss costs a yt-dlp process. Short TTL so results stay
# reasonably fresh without hammering YouTube.
CACHE_TTL = 300
_cache: dict[tuple[str, int], tuple[float, list[dict]]] = {}

# Cap concurrent yt-dlp processes — a few users typing at once shouldn't be
# able to fork-bomb the box.
_search_semaphore = asyncio.Semaphore(4)


def _pick_thumbnail(entry: dict) -> str:
    """Largest thumbnail yt-dlp reported, falling back to YouTube's static URL."""
    thumbnails = entry.get("thumbnails") or []
    best = max(
        (t for t in thumbnails if t.get("url")),
        key=lambda t: t.get("width") or 0,
        default=None,
    )
    if best:
        return best["url"]
    video_id = entry.get("id")
    return f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg" if video_id else ""


def _to_result(entry: dict) -> dict | None:
    video_id = entry.get("id")
    if not video_id:
        return None
    duration = entry.get("duration")
    return {
        "video_id": video_id,
        "title": entry.get("title") or "Untitled",
        "channel": entry.get("channel") or entry.get("uploader") or "",
        "duration": float(duration) if duration is not None else None,
        "view_count": entry.get("view_count"),
        "thumbnail": _pick_thumbnail(entry),
        "url": entry.get("url") or f"https://www.youtube.com/watch?v={video_id}",
    }


async def search_youtube(query: str, limit: int = 10) -> list[dict]:
    """
    Search YouTube via yt-dlp's ytsearch pseudo-extractor. No API key or quota.

    --flat-playlist keeps this to a single search-page request; nothing is
    resolved per-video, so it stays fast enough to run on keystrokes.
    """
    query = query.strip()
    if not query:
        return []
    limit = max(1, min(limit, MAX_RESULTS))

    cache_key = (query.lower(), limit)
    cached = _cache.get(cache_key)
    if cached and time.monotonic() - cached[0] < CACHE_TTL:
        logger.info(f"[SEARCH] Cache hit: {query!r}")
        return cached[1]

    cmd = [
        "yt-dlp",
        f"ytsearch{limit}:{query}",
        "--flat-playlist",
        "--dump-json",
        "--no-warnings",
        "--quiet",
        "--ignore-errors",
    ]

    async with _search_semaphore:
        logger.info(f"[SEARCH] Running yt-dlp search: {query!r} (limit={limit})")
        try:
            proc = await asyncio.wait_for(
                asyncio.to_thread(
                    subprocess.run,
                    cmd,
                    capture_output=True,
                    text=True,
                    env=env,
                ),
                timeout=SEARCH_TIMEOUT,
            )
        except asyncio.TimeoutError:
            raise ValueError("YouTube search timed out")

    if proc.returncode != 0 and not proc.stdout:
        logger.warning(f"[SEARCH] yt-dlp failed: {proc.stderr}")
        raise ValueError(f"YouTube search failed: {proc.stderr.strip()[:200]}")

    results: list[dict] = []
    for line in proc.stdout.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        result = _to_result(entry)
        if result:
            results.append(result)

    logger.info(f"[SEARCH] {len(results)} results for {query!r}")

    now = time.monotonic()
    if len(_cache) > 200:
        for key, (stored_at, _) in list(_cache.items()):
            if now - stored_at >= CACHE_TTL:
                _cache.pop(key, None)
    _cache[cache_key] = (now, results)
    return results
