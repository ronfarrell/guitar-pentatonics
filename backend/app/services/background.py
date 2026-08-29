"""Fire-and-forget task helper.

asyncio only holds a weak reference to a running task, so a bare
`asyncio.create_task(...)` can be garbage-collected mid-job; and when such a
task raises, the traceback only surfaces later as "Task exception was never
retrieved". Both jobs here already report failures through ProgressTracker,
so this keeps a strong reference and logs the exception once, cleanly.
"""
import asyncio
import logging
from typing import Coroutine

logger = logging.getLogger(__name__)

_background_tasks: set[asyncio.Task] = set()


def spawn(coro: Coroutine, label: str) -> asyncio.Task:
    task = asyncio.create_task(coro, name=label)
    _background_tasks.add(task)

    def _done(t: asyncio.Task) -> None:
        _background_tasks.discard(t)
        if t.cancelled():
            return
        exc = t.exception()
        if exc:
            logger.error(f"[{label}] Background job failed: {exc}", exc_info=exc)

    task.add_done_callback(_done)
    return task
