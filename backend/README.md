# 🎸 Guitar Pentatonics & Improvisation Assistant

A full-stack music intelligence application that analyzes songs and visualizes guitar improvisation guidance in real time. The system maps chord progressions to musical scales and displays them on an interactive fretboard to help guitarists improvise more effectively.

> 🚧 This project is currently in active development (MVP phase: frontend + mock analysis pipeline complete).

---

## 🧠 Overview

This application bridges **audio signal processing**, **music theory**, and **interactive visualization**.

Given a song (eventually via YouTube link or local audio file), the system will:

- Extract harmonic structure (chords + key)
- Map harmonic context to appropriate guitar scales
- Visualize scales on a fretboard in sync with playback

The long-term goal is a hybrid system combining:
- DSP (Digital Signal Processing)
- Machine learning (PyTorch)
- Real-time visualization

---

## 🎯 Current MVP

### ✅ Implemented
- Interactive guitar fretboard UI (React + TypeScript)
- Key-based pentatonic scale visualization
- Scale selection and highlighting logic
- Basic project structure for full-stack expansion

### 🚧 In Progress
- Backend API (FastAPI)
- Chord progression timeline system
- YouTube audio ingestion pipeline (via yt-dlp)
- Audio analysis pipeline (librosa + DSP)

---

## 🧩 Planned Architecture

```text
Frontend (React + TypeScript)
        ↓
Backend API (FastAPI)
        ↓
Audio Processing Pipeline (librosa / DSP)
        ↓
ML Models (PyTorch - chord/key detection)
        ↓
Chord Timeline + Key Estimation
        ↓
Scale Mapping Engine
        ↓
Fretboard Visualization