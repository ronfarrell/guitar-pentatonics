import { useState, useEffect, useMemo, useRef } from "react";
import "./App.css";

import Fretboard from "./components/Fretboard";
import Controls from "./components/Controls";
import VideoPlayer from "./components/VideoPlayer";
import ChordSidebar from "./components/ChordSidebar";
import FretModeToggle from "./components/FretModeToggle";
import type { FretMode } from "./components/FretModeToggle";
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
import { useStemPlayer } from "./hooks/useStemPlayer";
import { isTriadType, matchScaleToKeyQuality } from "./theory/scales";
import { suggestScales, detectProgression } from "./theory/analysis";
import { PROGRESSIONS, CUSTOM_PROGRESSION_ID, getChordRoot, type ProgressionChord } from "./theory/progressions";
import ProgressionPanel from "./components/ProgressionPanel";
import { loadFretboardColors } from "./components/FretboardColorSettings";
import type { FretboardColors } from "./components/FretboardColorSettings";
import { loadPlaybackSession, savePlaybackSession } from "./services/sessionStore";
import type { PlaybackSession } from "./services/sessionStore";
import SettingsPage from "./components/SettingsPage";
import { loadThemeSettings, saveThemeSettings, applyThemeSettings } from "./theme/themeSettings";
import type { ThemeSettings } from "./theme/themeSettings";

function extractRoot(chord: string | null): NoteName | null {
  return chord?.match(/^[A-G](#|b)?/)?.[0] as NoteName | null;
}

function App() {
  const [root, setRoot] = useState<NoteName>(ROOT_NOTES[0]);
  const [scaleType, setScaleType] = useState<ScaleType>("Major Pentatonic");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [fretMode, setFretMode] = useState<FretMode>("manual");

  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(loadThemeSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [chordOpen, setChordOpen] = useState(false);

  const [progressionId, setProgressionId] = useState<string | null>(null);
  const [selectedChordIdx, setSelectedChordIdx] = useState<number | null>(null);
  const [showTriads, setShowTriads] = useState(false);
  const [customChords, setCustomChords] = useState<ProgressionChord[]>([]);
  const [fretboardColors, setFretboardColors] = useState<FretboardColors>(loadFretboardColors);

  const { savedSongs, deleteSong, startReanalyze, clearReanalyzingId, reanalyzingId, refresh } = useSavedSongs();

  const { analysisData, loadedUrl, loading, error, analyze, loadCached, analyzeWithJobId } = useChordAnalysis(refresh);

  const { videoRef, prevChord, currentChord, nextChord, progressToNext } =
    useChordTracker(analysisData);

  const videoSrc = analysisData?.video_path
    ? `${import.meta.env.VITE_API_BASE_URL}/analysis/video/${analysisData.video_path}`
    : null;

  const mediaControls = useMediaControls(videoRef, videoSrc);

  const stemPlayer = useStemPlayer(
    videoRef,
    loadedUrl,
    analysisData?.instrumental_path ?? null,
    analysisData?.stems ?? null,
  );

  // Restore the last session (song + position) once on mount
  const resumeRef = useRef<PlaybackSession | null>(null);
  useEffect(() => {
    const saved = loadPlaybackSession();
    if (!saved) return;
    resumeRef.current = saved;
    setYoutubeUrl(saved.youtubeUrl);
    loadCached(saved.youtubeUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist playback position, and seek to the restored one when its video loads
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc || !loadedUrl) return;

    const resume = resumeRef.current;
    if (resume) {
      // only resume into the same song; a different selection drops it
      if (resume.youtubeUrl === loadedUrl) {
        const apply = () => {
          video.currentTime = resume.time;
        };
        if (video.readyState >= 1) apply();
        else video.addEventListener("loadedmetadata", apply, { once: true });
      }
      resumeRef.current = null;
    }

    let lastSaved = -Infinity;
    const saveThrottled = () => {
      if (Math.abs(video.currentTime - lastSaved) < 3) return;
      lastSaved = video.currentTime;
      savePlaybackSession({ youtubeUrl: loadedUrl, time: video.currentTime });
    };
    const saveNow = () =>
      savePlaybackSession({ youtubeUrl: loadedUrl, time: video.currentTime });

    video.addEventListener("timeupdate", saveThrottled);
    video.addEventListener("seeked", saveNow);
    video.addEventListener("pause", saveNow);
    window.addEventListener("pagehide", saveNow);
    return () => {
      video.removeEventListener("timeupdate", saveThrottled);
      video.removeEventListener("seeked", saveNow);
      video.removeEventListener("pause", saveNow);
      window.removeEventListener("pagehide", saveNow);
    };
  }, [videoSrc, loadedUrl]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const songRoot = extractRoot(analysisData?.key ?? null);
  const songIsMinor = /minor/i.test(analysisData?.key ?? "");

  const suggestedScales = useMemo(
    () => (analysisData ? suggestScales(analysisData.key, analysisData.chords) : []),
    [analysisData],
  );
  const detectedProgression = useMemo(
    () => (analysisData ? detectProgression(analysisData.key, analysisData.chords) : null),
    [analysisData],
  );

  // In song mode the analyzed song's key drives the fretboard (and
  // progressions); otherwise the manually selected key does.
  const baseRoot: NoteName = fretMode === "song" && songRoot ? songRoot : root;

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
      return getChordRoot(baseRoot, selectedProgressionChord) as NoteName;
    return baseRoot;
  }, [fretMode, liveRoot, selectedProgressionChord, baseRoot]);

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
    if (fretMode === "song" && songRoot)
      return matchScaleToKeyQuality(scaleType, songIsMinor);
    return scaleType;
  }, [fretMode, currentChord, selectedProgressionChord, scaleType, songRoot, songIsMinor]);

  const chordNotes = useMemo(() => {
    if (!showTriads) return undefined;
    const isMinor = fretScaleType.toLowerCase().includes("minor");
    const intervals = isMinor ? [0, 3, 7] : [0, 4, 7];
    const rootIdx = noteIndex(fretRoot);
    return intervals.map((i) => NOTE_NAMES[(rootIdx + i) % 12]);
  }, [showTriads, fretRoot, fretScaleType]);

  useEffect(() => {
    applyThemeSettings(themeSettings);
  }, [themeSettings]);

  const progressionLen =
    progressionId === null
      ? 0
      : progressionId === CUSTOM_PROGRESSION_ID
        ? customChords.length
        : (PROGRESSIONS.find((p) => p.id === progressionId)?.chords.length ?? 0);

  useEffect(() => {
    if (fretMode === "live" || progressionId === null || progressionLen === 0) return;
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
              loadCached(url);
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

        <div className="fret-controls-row">
          <FretModeToggle
            mode={fretMode}
            setMode={setFretMode}
            songKey={analysisData?.key ?? null}
          />

          <div className="inline-controls">
            <div className="control-group">
              <label>{fretMode === "song" && songRoot ? "Key (song)" : "Key"}</label>
              <select
                value={baseRoot}
                disabled={fretMode === "song" && !!songRoot}
                title={fretMode === "song" && songRoot ? "Key follows the analyzed song" : undefined}
                onChange={(e) => setRoot(e.target.value as NoteName)}
              >
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

            <div className="control-group">
              <label>Triads</label>
              <button
                className={`toggle-btn${showTriads ? " toggle-btn--on" : ""}`}
                onClick={() => setShowTriads((v) => !v)}
              >
                {showTriads ? "On" : "Off"}
              </button>
            </div>
          </div>
        </div>

        {suggestedScales.length > 0 && (
          <div className="suggestion-row">
            <span className="suggestion-label">Suggested scales</span>
            {suggestedScales.map((s) => {
              const active = baseRoot === s.root && scaleType === s.scale;
              return (
                <button
                  key={s.scale}
                  className={`suggestion-chip${active ? " active" : ""}`}
                  title={s.reason}
                  onClick={() => {
                    setRoot(s.root);
                    setScaleType(s.scale);
                  }}
                >
                  {s.root} {s.scale}
                </button>
              );
            })}
          </div>
        )}

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
              colors={fretboardColors}
              onColorsChange={setFretboardColors}
            />
          </div>
        </div>

        {/* Progression — below fretboard */}
        <div className="below-fretboard-card">
          {detectedProgression && (
            <div className="suggestion-row suggestion-row--progression">
              <span className="suggestion-label">Detected progression</span>
              <span className="detected-numerals">
                {detectedProgression.numerals.join(" – ")}
              </span>
              {detectedProgression.matchName && (
                <span className="detected-match">≈ {detectedProgression.matchName}</span>
              )}
              <button
                className="suggestion-chip"
                onClick={() => {
                  if (detectedProgression.matchId) {
                    setProgressionId(detectedProgression.matchId);
                  } else {
                    setCustomChords(detectedProgression.chords);
                    setProgressionId(CUSTOM_PROGRESSION_ID);
                  }
                  setSelectedChordIdx(null);
                }}
              >
                Load
              </button>
            </div>
          )}

          <ProgressionPanel
            root={baseRoot}
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
            fretMode={fretMode}
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
        stemPlayer={stemPlayer}
        {...mediaControls}
      />

      <button
        className="settings-fab"
        onClick={() => setSettingsOpen(true)}
        aria-label="Open settings"
        title="Settings"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>

      {settingsOpen && (
        <SettingsPage
          saved={themeSettings}
          onSave={(s) => {
            saveThemeSettings(s);
            setThemeSettings(s);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  );
}

export default App;
