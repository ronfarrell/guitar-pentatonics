import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health, analysis


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
app.include_router(analysis.router, prefix="/analysis", tags=["Analysis"])


# -----------------------
# Root endpoint
# -----------------------
@app.get("/")
def root():
    return {
        "service": "guitar-pentatonics-backend",
        "status": "running"
    }