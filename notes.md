# 🎸 Guitar Pentatonics App — Notes

This document tracks the architecture, stack, tools, and design decisions for the Guitar Pentatonics & Improvisation Assistant.

It is intended as a living technical reference for development.

---

# 🧠 Project Overview

The goal of this system is to:

- Take a YouTube link or audio file
- Extract harmonic structure (key + chords)
- Map chords to appropriate guitar scales
- Visualize scales in real time on a fretboard

The system combines:
- Frontend visualization
- Backend orchestration
- Audio signal processing (DSP)
- Machine learning (future phase)

---

# ⚙️ Tech Stack

## 🖥️ Frontend
- React
- TypeScript
- Vite
- HTML / CSS
- Custom fretboard visualization components

### Responsibilities
- UI rendering
- scale highlighting
- playback synchronization
- user interaction (YouTube input, controls)

---

## ⚙️ Backend
- Python 3.11
- FastAPI
- Pydantic
- Uvicorn

### Responsibilities
- API layer
- orchestration of analysis pipeline
- request handling
- returning structured music data

---

## 🎧 Audio / DSP Layer
- numpy
- librosa
- soundfile

### Responsibilities
- waveform loading
- FFT (frequency analysis)
- spectrogram generation
- chroma feature extraction
- preparing inputs for ML models

---

## 🧠 Machine Learning (Future Layer)
- PyTorch
- torchaudio

### Responsibilities
- chord detection
- key classification
- sequence modeling over time
- learning harmonic structure from audio

---

## 📊 Data / Utilities
- pandas (optional)
- numpy (core dependency)

### Responsibilities
- dataset inspection
- feature debugging
- structuring intermediate analysis outputs

---

## 📺 Audio / YouTube Ingestion
- yt-dlp

### Responsibilities
- download audio from YouTube URLs
- extract usable audio files
- normalize input for DSP pipeline

---

# 📦 Backend Structure

```text id="struct1"
backend/
│
├── app/
│   ├── main.py                  # FastAPI entrypoint
│   │
│   ├── api/                    # HTTP routes
│   │   ├── analysis.py
│   │   ├── songs.py
│   │   └── health.py
│   │
│   ├── services/               # Business logic layer
│   │   ├── youtube_service.py
│   │   ├── audio_service.py
│   │   ├── analysis_service.py
│   │   └── chord_service.py
│   │
│   ├── theory/                 # Music theory engine
│   │   ├── notes.py
│   │   ├── scales.py
│   │   └── chords.py
│   │
│   ├── models/                 # Pydantic schemas
│   │   ├── song.py
│   │   ├── chord.py
│   │   └── analysis.py
│   │
│   └── storage/                # Local persistence layer
│       └── analysis_cache/
│
├── requirements.txt
└── .venv/