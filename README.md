# Guitar Pentatonics

Paste a YouTube link, get a live fretboard. The app downloads the audio, detects the key and chord changes, and shows you the matching pentatonic scale on a guitar fretboard in real time as the song plays.

**What you get:**
- Detected key and scale displayed on a full fretboard
- Chord-by-chord playback tracker (previous / now / next)
- Toggle triads on the fretboard to see chord tones highlighted
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
