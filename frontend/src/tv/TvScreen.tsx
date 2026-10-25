import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, mediaUrl, type RoomEntry } from "../services/api";
import type { AnalysisDemoResponse } from "../services/api";
import { getToken } from "../services/authToken";
import { registerMedia } from "../services/audioGraph";
import { useRoom, type TvCommand } from "../hooks/useRoom";
import { useChordTracker } from "../hooks/useChordTracker";
import Fretboard from "../components/Fretboard";
import Visualizer from "../components/Visualizer";
import { loadFretboardColors } from "../components/FretboardColorSettings";
import {
  VISUALIZER_MODES,
  normalizeVizSettings,
  type VisualizerMode,
} from "../components/visualizerModes";
import { NOTE_NAMES, noteIndex, type NoteName } from "../theory/notes";
import {
  SCALE_TYPES,
  TRIAD_TYPES,
  isTriadType,
  matchScaleToKeyQuality,
  type ScaleType,
} from "../theory/scales";
import QrCode from "./QrCode";

type Props = {
  roomId: string;
  joinUrl: string | null;
  onEnd: () => void;
  onExit: () => void;
};

const ALL_SCALES: ScaleType[] = [...SCALE_TYPES, ...TRIAD_TYPES];
const UP_NEXT_COUNT = 3;
const NOTICE_MS = 4500;

const extractRoot = (chord: string | null): NoteName | null =>
  (chord?.match(/^[A-G](#|b)?/)?.[0] as NoteName | undefined) ?? null;

/** The visualizer look the owner tuned on this machine, minus the mode (the room owns that). */
function loadLocalVizSettings() {
  try {
    return normalizeVizSettings(JSON.parse(localStorage.getItem("visualizer") ?? "")?.settings);
  } catch {
    return normalizeVizSettings(null);
  }
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TvScreen({ roomId, joinUrl, onEnd, onExit }: Props) {
  const token = getToken();
  const [song, setSong] = useState<{ uid: string; data: AnalysisDemoResponse } | null>(null);
  const [needsClick, setNeedsClick] = useState(false);
  const [notices, setNotices] = useState<{ id: number; text: string }[]>([]);
  const [chromeVisible, setChromeVisible] = useState(false);
  const [clock, setClock] = useState({ position: 0, duration: 0, playing: false });

  const [vizSettings] = useState(loadLocalVizSettings);
  const [fretboardColors, setFretboardColors] = useState(loadFretboardColors);

  const noticeId = useRef(0);
  const videoRefForCommands = useRef<HTMLVideoElement | null>(null);

  const onCommand = useCallback((command: TvCommand) => {
    const video = videoRefForCommands.current;
    if (!video) return;
    switch (command.action) {
      case "play":
        video.play().catch(() => setNeedsClick(true));
        break;
      case "pause":
        video.pause();
        break;
      case "toggle":
        if (video.paused) video.play().catch(() => setNeedsClick(true));
        else video.pause();
        break;
      case "seek":
        if (command.value !== null) video.currentTime = Math.max(0, command.value);
        break;
      case "volume":
        if (command.value !== null) video.volume = Math.min(1, Math.max(0, command.value));
        break;
    }
  }, []);

  const onNotice = useCallback((text: string) => {
    const id = ++noticeId.current;
    setNotices((prev) => [...prev.slice(-2), { id, text }]);
    setTimeout(() => setNotices((prev) => prev.filter((n) => n.id !== id)), NOTICE_MS);
  }, []);

  const room = useRoom(roomId, token ? { role: "tv", token } : null, { onCommand, onNotice });
  const { send } = room;
  const state = room.state;
  const now: RoomEntry | null = state?.now_playing ?? null;
  const display = state?.display;

  // Only trust a fetched song while it's still the one the room says is on.
  const analysis = song && now && song.uid === now.uid ? song.data : null;
  const { videoRef, prevChord, currentChord, nextChord, progressToNext } = useChordTracker(analysis);

  useEffect(() => {
    videoRefForCommands.current = videoRef.current;
  });

  // The visualizer taps whatever the video element is playing.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    return registerMedia(el);
  }, [videoRef]);

  // Fetch whatever the room says is now playing.
  const nowUid = now?.uid ?? null;
  const nowHash = now?.url_hash ?? null;
  useEffect(() => {
    if (!nowUid || !nowHash) return;
    let cancelled = false;
    api.rooms
      .song(roomId, nowHash)
      .then((data) => !cancelled && setSong({ uid: nowUid, data }))
      .catch(() => !cancelled && send({ type: "unplayable", uid: nowUid }));
    return () => {
      cancelled = true;
    };
  }, [roomId, nowUid, nowHash, send]);

  const mediaPath = analysis?.video_path ?? analysis?.audio_path ?? null;
  const mediaSrc = mediaPath
    ? mediaUrl(analysis?.video_path ? "video" : "audio", mediaPath)
    : null;

  // Load and start each new song; go quiet when the queue runs dry.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!mediaSrc) {
      if (!nowUid) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      return;
    }
    video.src = mediaSrc;
    video.play().then(
      () => setNeedsClick(false),
      // Autoplay refused — typically after a reload, before anyone has
      // clicked this page. One click on the TV fixes it.
      (err: DOMException) => err.name === "NotAllowedError" && setNeedsClick(true),
    );
  }, [mediaSrc, nowUid, videoRef]);

  // Report the playhead so the phones can show it. ~1/s, plus every discrete change.
  const nowUidRef = useRef(nowUid);
  useEffect(() => {
    nowUidRef.current = nowUid;
  }, [nowUid]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let last = 0;
    const report = () => {
      const snapshot = {
        playing: !video.paused && !video.ended,
        position: video.currentTime || 0,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        volume: video.volume,
      };
      setClock(snapshot);
      send({ type: "playback", ...snapshot });
    };
    const throttled = () => {
      const t = performance.now();
      if (t - last < 1000) return;
      last = t;
      report();
    };
    const ended = () => {
      report();
      if (nowUidRef.current) send({ type: "ended", uid: nowUidRef.current });
    };
    const failed = () => {
      // An element with no src fires error too; only a real song counts.
      if (video.getAttribute("src") && nowUidRef.current)
        send({ type: "unplayable", uid: nowUidRef.current });
    };

    const discrete = ["play", "pause", "seeked", "volumechange", "loadedmetadata"] as const;
    discrete.forEach((e) => video.addEventListener(e, report));
    video.addEventListener("timeupdate", throttled);
    video.addEventListener("ended", ended);
    video.addEventListener("error", failed);
    return () => {
      discrete.forEach((e) => video.removeEventListener(e, report));
      video.removeEventListener("timeupdate", throttled);
      video.removeEventListener("ended", ended);
      video.removeEventListener("error", failed);
    };
  }, [send, videoRef]);

  // Mouse movement reveals the exit controls; they fade after a few seconds.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const show = () => {
      setChromeVisible(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setChromeVisible(false), 3000);
    };
    window.addEventListener("mousemove", show);
    return () => {
      window.removeEventListener("mousemove", show);
      if (timer) clearTimeout(timer);
    };
  }, []);

  /* ---------------------------------------------------------- fretboard */

  const songRoot = extractRoot(analysis?.key ?? now?.key ?? null);
  const songIsMinor = /minor/i.test(analysis?.key ?? now?.key ?? "");
  const roomScale: ScaleType = ALL_SCALES.includes(display?.scale_type as ScaleType)
    ? (display!.scale_type as ScaleType)
    : "Major Pentatonic";
  const liveRoot = extractRoot(currentChord);

  const { fretRoot, fretScale } = useMemo(() => {
    if (display?.fret_mode === "live" && liveRoot) {
      const minor = !!currentChord?.match(/m(?!aj)/i);
      return {
        fretRoot: liveRoot,
        fretScale: minor
          ? ((isTriadType(roomScale) ? "Minor Triad" : "Minor Pentatonic") as ScaleType)
          : roomScale,
      };
    }
    return {
      fretRoot: songRoot ?? ("A" as NoteName),
      fretScale: songRoot ? matchScaleToKeyQuality(roomScale, songIsMinor) : roomScale,
    };
  }, [display?.fret_mode, liveRoot, currentChord, roomScale, songRoot, songIsMinor]);

  const chordNotes = useMemo(() => {
    if (!display?.show_triads) return undefined;
    const intervals = fretScale.toLowerCase().includes("minor") ? [0, 3, 7] : [0, 4, 7];
    const rootIdx = noteIndex(fretRoot);
    return intervals.map((i) => NOTE_NAMES[(rootIdx + i) % 12]);
  }, [display?.show_triads, fretRoot, fretScale]);

  const showChords = display?.show_chords ?? true;
  const showFretboard = (display?.show_fretboard ?? true) && !!now;
  const vizMode: VisualizerMode = VISUALIZER_MODES.includes(display?.viz_mode as VisualizerMode)
    ? (display!.viz_mode as VisualizerMode)
    : "orbit";

  /* ------------------------------------------------------------- render */

  const upNext = state?.queue.slice(0, UP_NEXT_COUNT) ?? [];
  const moreQueued = (state?.queue.length ?? 0) - upNext.length;
  const members = state?.members ?? [];
  const progress = clock.duration > 0 ? (clock.position / clock.duration) * 100 : 0;

  if (room.status === "closed") {
    return (
      <div className="tv-root tv-start">
        <div className="tv-start-card">
          <h1 className="app-title">Session ended</h1>
          <p className="tv-start-lead">{room.closedReason}</p>
          <div className="tv-start-actions">
            <button className="settings-save-btn tv-big-btn" onClick={onEnd}>
              Back to TV mode
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`tv-root tv-screen${chromeVisible ? " tv-screen--chrome" : ""}`}>
      <div className={`tv-main${showFretboard ? " tv-main--with-fretboard" : ""}`}>
        <div className="tv-stage">
          {/* Always mounted: chord tracking, the visualizer tap and every
              transport command go through this one element. */}
          <video ref={videoRef} crossOrigin="anonymous" playsInline className={now ? "" : "tv-video--idle"} />

          {now && display?.view === "visualizer" && (
            <Visualizer
              mode={vizMode}
              onModeChange={(mode) => send({ type: "display", patch: { viz_mode: mode } })}
              settings={vizSettings}
              onSettingsChange={() => {}}
              playing={clock.playing}
              chord={currentChord}
              chordProgress={progressToNext}
              songKey={analysis?.key ?? null}
              songTitle={null}
              onTogglePlay={() => {}}
            />
          )}

          {!now && (
            <div className="tv-idle">
              {joinUrl ? <QrCode value={joinUrl} size={300} /> : <div className="tv-qr-missing">No address</div>}
              <div className="tv-idle-text">
                <h1>Scan to join</h1>
                <p>
                  Join from your phone on this Wi-Fi, sign in or come as a guest, and queue up songs.
                </p>
                {joinUrl && <code className="tv-join-url">{joinUrl}</code>}
                <p className="tv-idle-host">Hosted by {state?.owner ?? "…"}</p>
              </div>
            </div>
          )}

          {now && (
            <div className="tv-now">
              <span className="tv-eyebrow">Now playing</span>
              <h2 className="tv-now-title">{now.title}</h2>
              <div className="tv-now-meta">
                <span>{now.key}</span>
                <span>· added by {now.added_by}</span>
              </div>
              <div className="tv-progress">
                <span>{formatTime(clock.position)}</span>
                <div className="tv-progress-track">
                  <div className="tv-progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <span>{formatTime(clock.duration)}</span>
              </div>
            </div>
          )}

          {needsClick && (
            <button className="tv-click-resume" onClick={() => videoRef.current?.play().then(() => setNeedsClick(false), () => {})}>
              Click anywhere to start the sound
            </button>
          )}
        </div>

        <aside className="tv-side">
          <section className="tv-panel">
            <span className="tv-eyebrow">Up next</span>
            {upNext.length === 0 ? (
              <p className="tv-muted">Nothing queued — add songs from your phone.</p>
            ) : (
              <ol className="tv-upnext">
                {upNext.map((entry, i) => (
                  <li key={entry.uid} className={i === 0 ? "tv-upnext-first" : ""}>
                    <span className="tv-upnext-title">{entry.title}</span>
                    <span className="tv-upnext-by">{entry.added_by}</span>
                  </li>
                ))}
              </ol>
            )}
            {moreQueued > 0 && <p className="tv-muted">+ {moreQueued} more</p>}
          </section>

          {now && joinUrl && (
            <section className="tv-panel tv-panel--join">
              <QrCode value={joinUrl} size={112} />
              <div>
                <span className="tv-eyebrow">Join the queue</span>
                <p className="tv-muted">Scan with your phone</p>
              </div>
            </section>
          )}

          <section className="tv-panel">
            <span className="tv-eyebrow">
              {members.length === 0 ? "Nobody connected yet" : `${members.length} connected`}
            </span>
            <div className="tv-members">
              {members.map((m) => (
                <span key={m.id} className={`tv-member${m.guest ? " tv-member--guest" : ""}`} title={m.name}>
                  <span className="tv-member-initial" aria-hidden>
                    {m.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="tv-member-name">{m.name}</span>
                </span>
              ))}
            </div>
          </section>

          {room.status === "reconnecting" && <p className="tv-warn">Reconnecting to the server…</p>}
        </aside>
      </div>

      {showFretboard && (
        <div className="tv-fretboard">
          <Fretboard
            root={fretRoot}
            scaleType={fretScale}
            progress={progressToNext}
            prevChord={showChords ? prevChord : null}
            currentChord={showChords ? currentChord : null}
            nextChord={showChords ? nextChord : null}
            chordNotes={chordNotes}
            colors={fretboardColors}
            onColorsChange={setFretboardColors}
          />
        </div>
      )}

      <div className="tv-notices">
        {notices.map((n) => (
          <div key={n.id} className="tv-notice">
            {n.text}
          </div>
        ))}
      </div>

      <div className="tv-chrome">
        <button className="settings-cancel-btn" onClick={onEnd}>
          End session
        </button>
        <button className="settings-cancel-btn" onClick={onExit}>
          Exit TV mode
        </button>
      </div>
    </div>
  );
}
