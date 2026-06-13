# 🎸 Guitar Pentatonics Backend

Backend service for the Guitar Pentatonics & Improvisation Assistant.

This service is responsible for:
- Audio ingestion (YouTube / local files)
- Harmonic analysis (key + chord detection)
- Time-aligned chord timeline generation
- Scale mapping logic for guitar improvisation

Built with FastAPI and designed to support future ML-based audio analysis (PyTorch).

---

## 🧠 System Purpose

The backend acts as the **music intelligence layer** of the application.

It converts raw audio input into structured musical data:

```text id="xq9m2a"
Audio Input
   ↓
Signal Processing / ML (future)
   ↓
Chord Timeline + Key Detection
   ↓
Frontend Visualization