# Guitar Pentatonics

Paste a YouTube link, get a live fretboard. The app downloads the audio, detects the key and chord changes, and shows you the matching pentatonic scale on a guitar fretboard in real time as the song plays.

**What you get:**
- Detected key and scale displayed on a full fretboard
- Chord-by-chord playback tracker (previous / now / next)
- Toggle triads on the fretboard to see chord tones highlighted
- Backing-track mode — strip the vocals (Demucs) and play along with the instrumental
- Per-stem mixer — split into vocals/drums/bass/guitar/piano/other and solo or mute any of them
- **Beta:** split the guitar stem further into *rhythm* and *lead* — a heuristic (stereo-panning based, with a mono register fallback), so it's approximate and can bleed
- Music-reactive visualizer — three styles (Orbit / Spectrum / Ribbon) drawn live from the audio, coloured by the chord under the playhead and pulsing on detected beats
- Customizable fretboard colors (root, triads, scale notes)
- Previously analyzed songs saved and replayable without re-downloading

---

## Run with Docker (recommended)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker + Docker Compose.

```bash
git clone <repo-url>
cd guitar-pentatonics
docker compose up --build
```

Open [http://localhost](http://localhost) in your browser.

> The first build takes several minutes — PyTorch is large. Subsequent starts are fast.
> Analyzed audio and video files persist in a Docker volume across restarts.

### Windows: launch as a standalone app

If this repo lives inside WSL (as it does here), you can launch the app straight from the Windows Desktop — no VS Code, no terminal, no browser tab.

This path skips Docker: it runs the backend directly against the project's own `.venv` (so GPU-accelerated Torch/Demucs stay exactly as configured — meaningfully faster than the CPU-only Torch build Docker installs) and opens the app in a chromeless Edge/Chrome window, so it looks and behaves like a real app rather than a page in your browser.

One-time setup:

```bash
# build the frontend once, pointed at the port the launcher uses
cd frontend && VITE_API_BASE_URL=http://localhost:8010 npm run build
```

```powershell
# from Windows PowerShell, once — creates the Desktop shortcuts
powershell -ExecutionPolicy Bypass -File windows\install-shortcuts.ps1
```

That adds **Guitar Pentatonics** and **Stop Guitar Pentatonics** shortcuts to your Desktop. The first launch starts the backend on port 8010 and opens it in its own app window; the stop shortcut shuts the backend down (your saved songs and cache are untouched — they live in `backend/data`). The scripts assume the WSL distro named in `windows/start.bat`/`run_backend.sh` (edit if yours differs — check with `wsl -l -v`) and port 8010 (chosen to avoid colliding with a `--reload` dev server on the default 8000 — change it in `windows/run_backend.sh` and rebuild the frontend with a matching `VITE_API_BASE_URL` if you'd rather use a different port).

---

## Run locally

### Requirements

- Python 3.11+
- Node.js 18+
- [ffmpeg](https://ffmpeg.org/download.html) installed and on your PATH

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend runs at `http://localhost:8000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

### One-shot start (Mac/Linux)

```bash
./start.sh
```

Starts both services in the background. Press `Ctrl+C` to stop both.

---

## Usage

1. Paste a YouTube URL into the input and click **Analyze**
2. Wait for the download and analysis to finish (progress shown live)
3. The fretboard updates automatically as the song plays
4. Use the **Key** and **Scale** dropdowns to explore other scales manually
5. Toggle **Triads** to overlay chord tones on the fretboard
6. Click the **⚙** icon on the fretboard to customize highlight colors
