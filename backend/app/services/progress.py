"""Progress tracking for long-running operations"""
from typing import Dict
from datetime import datetime
import asyncio

# In-memory progress store (could use Redis in production)
progress_store: Dict[str, dict] = {}


class ProgressTracker:
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.started_at = datetime.now().isoformat()
        progress_store[job_id] = {
            "status": "starting",
            "percentage": 0,
            "message": "Initializing...",
            "started_at": self.started_at,
            "completed_at": None,
        }

    def update(self, status: str, percentage: int, message: str):
        """Update progress"""
        progress_store[self.job_id] = {
            "status": status,
            "percentage": min(100, percentage),
            "message": message,
            "started_at": self.started_at,
            "completed_at": None,
        }

    def complete(self, message: str = "Completed"):
        """Mark as completed"""
        progress_store[self.job_id] = {
            "status": "completed",
            "percentage": 100,
            "message": message,
            "started_at": self.started_at,
            "completed_at": datetime.now().isoformat(),
        }

    def error(self, message: str):
        """Mark as error"""
        progress_store[self.job_id] = {
            "status": "error",
            "percentage": -1,
            "message": message,
            "started_at": self.started_at,
            "completed_at": datetime.now().isoformat(),
        }


def get_progress(job_id: str) -> dict | None:
    """Get current progress"""
    return progress_store.get(job_id)


def cleanup_progress(job_id: str):
    """Clean up old progress entries"""
    if job_id in progress_store:
        del progress_store[job_id]
