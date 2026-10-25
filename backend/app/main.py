import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import health, auth, analysis, songs, search, playlists

import logging

logging.getLogger().setLevel(logging.INFO)
logging.getLogger("networkx").setLevel(logging.ERROR)
logging.getLogger("matplotlib").setLevel(logging.ERROR)


app = FastAPI(
    title="Guitar Pentatonics Backend",
    description="Audio analysis + chord detection + scale mapping API",
    version="0.1.0",
)

# -----------------------
# CORS (for React frontend)
# -----------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permissive for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------
# Routers
# -----------------------
app.include_router(health.router, prefix="/health", tags=["Health"])
app.include_router(auth.router, prefix="/auth", tags=["Auth"])
app.include_router(analysis.router, prefix="/analysis", tags=["Analysis"])
app.include_router(songs.router, prefix="/songs", tags=["Songs"])
app.include_router(search.router, prefix="/search", tags=["Search"])
app.include_router(playlists.router, prefix="/playlists", tags=["Playlists"])


# -----------------------
# Frontend (optional)
# -----------------------
# When a production build is present (frontend/dist), serve it directly from
# this process — used by the Windows launcher, which runs the backend
# standalone instead of through Docker/nginx. Local `npm run dev` (port 5173)
# is unaffected since this only activates when the built dist/ exists.
FRONTEND_DIST = Path(__file__).parent.parent.parent / "frontend" / "dist"

if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:
    @app.get("/")
    def root():
        return {
            "service": "guitar-pentatonics-backend",
            "status": "running"
        }