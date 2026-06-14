import { useState } from "react";
import "./App.css";

import Fretboard from "./components/Fretboard";
import Controls from "./components/Controls";
import VideoPlayer from "./components/VideoPlayer";
import ChordSidebar from "./components/ChordSidebar";
import FretModeToggle from "./components/FretModeToggle";

import { ROOT_NOTES } from "./theory/notes";
import { getScaleNotes, SCALE_TYPES } from "./theory/scales";
import type { NoteName } from "./theory/notes";
import type { ScaleType } from "./theory/scales";

import { useChordAnalysis } from "./hooks/useChordAnalysis";
import { useChordTracker } from "./hooks/useChordTracker";

import { useEffect } from "react";

function extractRoot(chord: string | null): NoteName | null {
  return chord?.match(/^[A-G](#|b)?/)?.[0] as NoteName | null;
}

function App() {
  const [root, setRoot] = useState<NoteName>(ROOT_NOTES[0]);
  const [scaleType, setScaleType] = useState<ScaleType>("Major Pentatonic");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [fretMode, setFretMode] = useState<"manual" | "live">("manual");

  const { analysisData, loading, error, progress, analyze } =
    useChordAnalysis();

  const { videoRef, currentChord, nextChord, progressToNext } =
    useChordTracker(analysisData);

  const liveRoot = extractRoot(currentChord);

  const fretRoot = fretMode === "live" && liveRoot ? liveRoot : root;

  const fretScaleType =
    fretMode === "live" && currentChord?.includes("m")
      ? "Minor Pentatonic"
      : scaleType;

  const scaleNotes = getScaleNotes(fretRoot, fretScaleType);

  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <main className="app-shell">
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

      {analysisData?.video_path && (
        <VideoPlayer
          videoPath={`${import.meta.env.VITE_API_BASE_URL}/analysis/video/${analysisData.video_path}`}
          videoRef={videoRef}
        />
      )}

      <FretModeToggle mode={fretMode} setMode={setFretMode} />

      <div className="main-grid">
        <div className="fretboard-area">
          <Fretboard
            root={fretRoot}
            scaleType={fretScaleType}
            progress={progressToNext}
            currentChord={currentChord}
            nextChord={nextChord}
          />
        </div>
      </div>

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
