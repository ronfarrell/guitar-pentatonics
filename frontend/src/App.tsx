import { useState, useEffect, useMemo } from "react";
import "./App.css";

import Fretboard from "./components/Fretboard";
import Controls from "./components/Controls";
import VideoPlayer from "./components/VideoPlayer";
import ChordSidebar from "./components/ChordSidebar";
import FretModeToggle from "./components/FretModeToggle";
import SavedSongs from "./components/SavedSongs";

import type { NoteName } from "./theory/notes";
import type { ScaleType } from "./theory/scales";
import { ROOT_NOTES } from "./theory/notes";

import { useChordAnalysis } from "./hooks/useChordAnalysis";
import { useChordTracker } from "./hooks/useChordTracker";
import { useSavedSongs } from "./hooks/useSavedSongs";
import { isTriadType } from "./theory/scales";
import { PROGRESSIONS, getTriadNotes } from "./theory/progressions";
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

  const [progressionId, setProgressionId] = useState<string | null>(null);
  const [selectedChordIdx, setSelectedChordIdx] = useState<number | null>(null);

  const { savedSongs, deleteSong, refresh } = useSavedSongs();

  const { analysisData, loading, error, analyze } = useChordAnalysis(refresh);

  const { videoRef, currentChord, nextChord, progressToNext } =
    useChordTracker(analysisData);

  const liveRoot = extractRoot(currentChord);

  const fretRoot = fretMode === "live" && liveRoot ? liveRoot : root;

  const isMinorChord = fretMode === "live" && !!currentChord?.match(/m(?!aj)/i);
  const fretScaleType = isMinorChord
    ? isTriadType(scaleType)
      ? "Minor Triad"
      : "Minor Pentatonic"
    : scaleType;

  const chordNotes = useMemo(() => {
    if (progressionId === null || selectedChordIdx === null) return undefined;
    const progression = PROGRESSIONS.find((p) => p.id === progressionId);
    if (!progression) return undefined;
    return getTriadNotes(fretRoot, progression.chords[selectedChordIdx]);
  }, [progressionId, selectedChordIdx, fretRoot]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1 className="app-title">Pentatonic Guitar Explorer</h1>
        <p className="app-subtitle">
          Visualize scales, analyze solos, and map fretboard patterns instantly
        </p>
      </header>
      {/* Hamburger */}
      <button
        className="hamburger"
        onClick={() => setMenuOpen((prev) => !prev)}
      >
        ☰
      </button>

      {/* Drawer */}
      <div className={`sidebar-drawer ${menuOpen ? "open" : ""}`}>
        <SavedSongs
          songs={savedSongs}
          onSelectSong={(song) => {
            const url = song.youtubeUrl ?? "";
            setYoutubeUrl(url);
            setMenuOpen(false);
            analyze(url);
          }}
          onDeleteSong={deleteSong}
        />
      </div>

      {/* Backdrop */}
      {menuOpen && (
        <div className="backdrop" onClick={() => setMenuOpen(false)} />
      )}

      {/* Controls */}
      <div className="top-section">
        <Controls
          root={root}
          setRoot={setRoot}
          scaleType={scaleType}
          setScaleType={setScaleType}
          youtubeUrl={youtubeUrl}
          setYoutubeUrl={setYoutubeUrl}
          onAnalyze={() => analyze(youtubeUrl)}
          loading={loading}
          theme={theme}
          setTheme={setTheme}
        />
      </div>

      <ProgressionPanel
        root={root}
        progressionId={progressionId}
        selectedChordIdx={selectedChordIdx}
        onChangeProgression={(id) => {
          setProgressionId(id);
          setSelectedChordIdx(null);
        }}
        onSelectChord={setSelectedChordIdx}
      />

      {/* Video */}
      {analysisData?.video_path && (
        <VideoPlayer
          videoPath={`${
            import.meta.env.VITE_API_BASE_URL
          }/analysis/video/${analysisData.video_path}`}
          videoRef={videoRef}
          videoKey={analysisData?.key ?? ""}
        />
      )}

      <FretModeToggle mode={fretMode} setMode={setFretMode} />

      {/* Fretboard */}
      <div className="main-grid">
        <div className="fretboard-area">
          <Fretboard
            root={fretRoot}
            scaleType={fretScaleType}
            progress={progressToNext}
            currentChord={currentChord}
            nextChord={nextChord}
            chordNotes={chordNotes}
          />
        </div>
      </div>

      {/* Chords */}
      {analysisData?.chords && (
        <div className="sidebar-area">
          <ChordSidebar chords={analysisData.chords} />
        </div>
      )}

      {error && <div className="error">{error}</div>}
    </main>
  );
}

export default App;
