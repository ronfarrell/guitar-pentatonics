import { useState, useEffect, useMemo, useRef } from "react";
import "./App.css";

import Fretboard from "./components/Fretboard";
import Controls from "./components/Controls";
import VideoPlayer from "./components/VideoPlayer";
import ChordSidebar from "./components/ChordSidebar";
import FretModeToggle from "./components/FretModeToggle";
import SavedSongs from "./components/SavedSongs";
import MediaBar from "./components/MediaBar";
import MiniPlayer from "./components/MiniPlayer";

import type { NoteName } from "./theory/notes";
import type { ScaleType } from "./theory/scales";
import { ROOT_NOTES, NOTE_NAMES, noteIndex } from "./theory/notes";
import { SCALE_TYPES, TRIAD_TYPES } from "./theory/scales";

import { useChordAnalysis } from "./hooks/useChordAnalysis";
import { useChordTracker } from "./hooks/useChordTracker";
import { useSavedSongs } from "./hooks/useSavedSongs";
import { useMediaControls } from "./hooks/useMediaControls";
import { isTriadType } from "./theory/scales";
import { PROGRESSIONS, CUSTOM_PROGRESSION_ID, getChordRoot, type ProgressionChord } from "./theory/progressions";
import ProgressionPanel from "./components/ProgressionPanel";

function extractRoot(chord: string | null): NoteName | null {
  return chord?.match(/^[A-G](#|b)?/)?.[0] as NoteName | null;
}

function App() {
  const [root, setRoot] = useState<NoteName>(ROOT_NOTES[0]);
  const [scaleType, setScaleType] = useState<ScaleType>("Major Pentatonic");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [fretMode, setFretMode] = useState<"manual" | "live">("manual");

  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [menuOpen, setMenuOpen] = useState(false);
  const [chordOpen, setChordOpen] = useState(false);

  const [progressionId, setProgressionId] = useState<string | null>(null);
  const [selectedChordIdx, setSelectedChordIdx] = useState<number | null>(null);
  const [showTriads, setShowTriads] = useState(false);
  const [customChords, setCustomChords] = useState<ProgressionChord[]>([]);

  const { savedSongs, deleteSong, startReanalyze, clearReanalyzingId, reanalyzingId, refresh } = useSavedSongs();

  const { analysisData, loading, error, analyze, analyzeWithJobId } = useChordAnalysis(refresh);

  const { videoRef, prevChord, currentChord, nextChord, progressToNext } =
    useChordTracker(analysisData);

  const videoSrc = analysisData?.video_path
    ? `${import.meta.env.VITE_API_BASE_URL}/analysis/video/${analysisData.video_path}`
    : null;

  const mediaControls = useMediaControls(videoRef, videoSrc);

  // track whether the main video card is visible in the viewport
  const videoSectionRef = useRef<HTMLDivElement>(null);
  const [isVideoVisible, setIsVideoVisible] = useState(true);

  useEffect(() => {
    const el = videoSectionRef.current;
    if (!el || !videoSrc) {
      setIsVideoVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setIsVideoVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [videoSrc]);

  const liveRoot = extractRoot(currentChord);

  const selectedProgressionChord = useMemo(() => {
    if (progressionId === null || selectedChordIdx === null) return null;
    const chords =
      progressionId === CUSTOM_PROGRESSION_ID
        ? customChords
        : (PROGRESSIONS.find((p) => p.id === progressionId)?.chords ?? []);
    return chords[selectedChordIdx] ?? null;
  }, [progressionId, selectedChordIdx, customChords]);

  const fretRoot: NoteName = useMemo(() => {
    if (fretMode === "live" && liveRoot) return liveRoot;
    if (selectedProgressionChord)
      return getChordRoot(root, selectedProgressionChord) as NoteName;
    return root;
  }, [fretMode, liveRoot, selectedProgressionChord, root]);

  const fretScaleType: ScaleType = useMemo(() => {
    if (fretMode === "live") {
      const isMinor = !!currentChord?.match(/m(?!aj)/i);
      return isMinor
        ? isTriadType(scaleType) ? "Minor Triad" : "Minor Pentatonic"
        : scaleType;
    }
    if (selectedProgressionChord)
      return selectedProgressionChord.quality === "minor"
        ? "Minor Pentatonic"
        : "Major Pentatonic";
    return scaleType;
  }, [fretMode, currentChord, selectedProgressionChord, scaleType]);

  const chordNotes = useMemo(() => {
    if (!showTriads) return undefined;
    const isMinor = fretScaleType.toLowerCase().includes("minor");
    const intervals = isMinor ? [0, 3, 7] : [0, 4, 7];
    const rootIdx = noteIndex(fretRoot);
    return intervals.map((i) => NOTE_NAMES[(rootIdx + i) % 12]);
  }, [showTriads, fretRoot, fretScaleType]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const progressionLen =
    progressionId === null
      ? 0
      : progressionId === CUSTOM_PROGRESSION_ID
        ? customChords.length
        : (PROGRESSIONS.find((p) => p.id === progressionId)?.chords.length ?? 0);

  useEffect(() => {
    if (fretMode !== "manual" || progressionId === null || progressionLen === 0) return;
    const len = progressionLen;

    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setSelectedChordIdx((prev) => (prev === null ? 0 : (prev + 1) % len));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedChordIdx((prev) => (prev === null ? len - 1 : (prev - 1 + len) % len));
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fretMode, progressionId, progressionLen]);

  return (
    <>
      <main className={`app-shell${videoSrc ? " has-media-bar" : ""}`}>
        <header className="app-header">
          <h1 className="app-title">Pentatonic Guitar Explorer</h1>
          <p className="app-subtitle">
            Visualize scales, analyze solos, and map fretboard patterns instantly
          </p>
        </header>

        {/* Drawer — hamburger lives inside so they're one combined element */}
        <div className={`sidebar-drawer ${menuOpen ? "open" : ""}`}>
          <button
            className="hamburger"
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            {menuOpen ? "✕" : "☰"}
          </button>

          <span className="drawer-collapsed-label">Saved Songs</span>

          <SavedSongs
            songs={savedSongs}
            onSelectSong={(song) => {
              const url = song.youtubeUrl ?? "";
              setYoutubeUrl(url);
              setMenuOpen(false);
              analyze(url);
            }}
            onDeleteSong={deleteSong}
            onReanalyzeSong={async (song) => {
              const result = await startReanalyze(song);
              if (!result) return;
              setYoutubeUrl(result.youtube_url);
              setMenuOpen(false);
              analyzeWithJobId(result.job_id, result.youtube_url, clearReanalyzingId);
            }}
            reanalyzingId={reanalyzingId}
          />
        </div>

        {/* Chord drawer — right side, mirrors saved songs */}
        <div className={`chord-drawer ${chordOpen ? "open" : ""}`}>
          <button
            className="chord-toggle"
            onClick={() => setChordOpen((prev) => !prev)}
          >
            {chordOpen ? "✕" : "♩"}
          </button>

          <ChordSidebar chords={analysisData?.chords ?? []} currentTime={mediaControls.currentTime} seek={mediaControls.seek} />
        </div>

        {/* Backdrop — only for saved songs drawer */}
        {menuOpen && (
          <div className="backdrop" onClick={() => setMenuOpen(false)} />
        )}

        {/* Controls */}
        <div className="top-section">
          <Controls
            youtubeUrl={youtubeUrl}
            setYoutubeUrl={setYoutubeUrl}
            onAnalyze={() => analyze(youtubeUrl)}
            loading={loading}
          />
        </div>

        {/* Video */}
        <div ref={videoSectionRef}>
          {videoSrc && (
            <VideoPlayer
              videoPath={videoSrc}
              videoRef={videoRef}
              videoKey={analysisData?.key ?? ""}
              onTogglePlay={mediaControls.togglePlay}
            />
          )}
        </div>

        <FretModeToggle
          mode={fretMode}
          setMode={setFretMode}
          songKey={analysisData?.key ?? null}
          onUseSongKey={() => {
            const raw = analysisData?.key ?? "";
            const rootNote = raw.match(/^[A-G](#|b)?/)?.[0] as NoteName | undefined;
            if (rootNote) setRoot(rootNote);
            setFretMode("manual");
            setProgressionId(null);
            setSelectedChordIdx(null);
          }}
        />

        {/* Fretboard */}
        <div className="main-grid">
          <div className="fretboard-area">
            <Fretboard
              root={fretRoot}
              scaleType={fretScaleType}
              progress={progressToNext}
              prevChord={prevChord}
              currentChord={currentChord}
              nextChord={nextChord}
              chordNotes={chordNotes}
            />
          </div>
        </div>

        {/* Key, Scale, and Progression — below fretboard */}
        <div className="below-fretboard-card">
          <div className="controls-panel">
            <div className="control-group">
              <label>Key</label>
              <select value={root} onChange={(e) => setRoot(e.target.value as NoteName)}>
                {ROOT_NOTES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div className="control-group">
              <label>Scale</label>
              <select value={scaleType} onChange={(e) => setScaleType(e.target.value as ScaleType)}>
                <optgroup label="Scales">
                  {SCALE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                </optgroup>
                <optgroup label="Triads">
                  {TRIAD_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                </optgroup>
              </select>
            </div>
          </div>

          <ProgressionPanel
          root={root}
          progressionId={progressionId}
          selectedChordIdx={selectedChordIdx}
          customChords={customChords}
          onChangeProgression={(id) => {
            setProgressionId(id);
            setSelectedChordIdx(null);
          }}
          onSelectChord={setSelectedChordIdx}
          onUpdateCustomChords={(chords) => {
            setCustomChords(chords);
            setSelectedChordIdx(null);
          }}
          showTriads={showTriads}
          fretMode={fretMode}
          onToggleTriads={() => setShowTriads((v) => !v)}
        />
        </div>

        {error && <div className="error">{error}</div>}
      </main>

      <MiniPlayer
        videoRef={videoRef}
        videoSrc={videoSrc}
        visible={!!videoSrc && !isVideoVisible}
        playing={mediaControls.playing}
        onTogglePlay={mediaControls.togglePlay}
      />

      <MediaBar
        videoRef={videoRef}
        videoSrc={videoSrc}
        title={analysisData?.video_title}
        videoKey={analysisData?.key}
        {...mediaControls}
      />

      <button
        className="theme-fab"
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
        title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      >
        {theme === "light" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        )}
      </button>
    </>
  );
}

export default App;
