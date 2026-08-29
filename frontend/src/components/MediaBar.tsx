import { useRef, useEffect, useState } from "react";
import type { RefObject } from "react";
import type { MediaControls } from "../hooks/useMediaControls";
import type { StemPlayer, StemName } from "../hooks/useStemPlayer";
import type { PlaybackQueue } from "../hooks/usePlaybackQueue";

const STEM_LABELS: Record<string, string> = {
  guitar_rhythm: "guitar (rhythm)",
  guitar_lead: "guitar (lead)",
};
const stemLabel = (name: StemName) => STEM_LABELS[name] ?? name;

type Props = MediaControls & {
  videoRef: RefObject<HTMLVideoElement | null>;
  videoSrc: string | null;
  title?: string | null;
  videoKey?: string | null;
  stemPlayer: StemPlayer;
  queue?: PlaybackQueue;
};

export default function MediaBar({
  videoSrc,
  playing,
  currentTime,
  duration,
  volume,
  repeat,
  togglePlay,
  restart,
  seek,
  setVolumeLevel,
  toggleRepeat,
  formatTime,
  title,
  videoKey,
  stemPlayer,
  queue,
}: Props) {
  const titleWrapRef = useRef<HTMLDivElement>(null);
  const titleInnerRef = useRef<HTMLSpanElement>(null);
  const [titleOverflow, setTitleOverflow] = useState(0);

  const [mixerOpen, setMixerOpen] = useState(false);
  const mixerWrapRef = useRef<HTMLDivElement>(null);

  const [queueOpen, setQueueOpen] = useState(false);
  const queueWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outer = titleWrapRef.current;
    const inner = titleInnerRef.current;
    if (!outer || !inner) { setTitleOverflow(0); return; }
    setTitleOverflow(Math.max(0, inner.scrollWidth - outer.clientWidth));
  }, [title]);

  // Close the mixer popover on outside click
  useEffect(() => {
    if (!mixerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!mixerWrapRef.current?.contains(e.target as Node)) setMixerOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [mixerOpen]);

  // Same for the queue popover
  useEffect(() => {
    if (!queueOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!queueWrapRef.current?.contains(e.target as Node)) setQueueOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [queueOpen]);

  if (!videoSrc) return null;

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  // Track skip only earns its space in the bar once there's an order to skip
  // through — a playlist playing, or something queued up.
  const showTrackNav = !!queue && (!!queue.context || queue.queueLength > 0);

  return (
    <div className="media-bar">
      <button className="media-icon-btn" onClick={restart} aria-label="Restart" title="Restart">
        ↩
      </button>

      <button
        className={`media-icon-btn${repeat ? " media-icon-btn--active" : ""}`}
        onClick={toggleRepeat}
        aria-label={repeat ? "Repeat on" : "Repeat off"}
        title={repeat ? "Repeat: On" : "Repeat: Off"}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="17 1 21 5 17 9" />
          <path d="M3 11V9a4 4 0 0 1 4-4h14" />
          <polyline points="7 23 3 19 7 15" />
          <path d="M21 13v2a4 4 0 0 1-4 4H3" />
        </svg>
      </button>

      <button
        className={`media-icon-btn${stemPlayer.vocalsOff ? " media-icon-btn--active" : ""}`}
        onClick={stemPlayer.toggleVocals}
        disabled={stemPlayer.vocalsBusy}
        aria-label={stemPlayer.vocalsOff ? "Vocals off" : "Vocals on"}
        title={
          stemPlayer.error
            ? `Backing track failed: ${stemPlayer.error}`
            : stemPlayer.vocalsBusy
              ? `Removing vocals... ${stemPlayer.vocalsProgress}%`
              : stemPlayer.vocalsOff
                ? "Vocals: Off — click to bring them back"
                : "Vocals: On — click to remove vocals"
        }
      >
        {stemPlayer.vocalsBusy ? (
          <span className="media-bt-progress">{stemPlayer.vocalsProgress}%</span>
        ) : (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        )}
      </button>

      <div className="media-mixer-wrap" ref={mixerWrapRef}>
        <button
          className={`media-icon-btn${stemPlayer.mixActive ? " media-icon-btn--active" : ""}`}
          onClick={() => setMixerOpen((v) => !v)}
          aria-label="Stem mixer"
          aria-expanded={mixerOpen}
          title="Stem mixer — choose which instruments play"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="21" x2="4" y2="14" />
            <line x1="4" y1="10" x2="4" y2="3" />
            <line x1="12" y1="21" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12" y2="3" />
            <line x1="20" y1="21" x2="20" y2="16" />
            <line x1="20" y1="12" x2="20" y2="3" />
            <line x1="1" y1="14" x2="7" y2="14" />
            <line x1="9" y1="8" x2="15" y2="8" />
            <line x1="17" y1="16" x2="23" y2="16" />
          </svg>
        </button>

        {mixerOpen && (
          <div className="stem-panel">
            <div className="stem-panel-header">
              <span>Stem mixer</span>
              {stemPlayer.stemsAvailable && (
                <button
                  className={`toggle-btn${stemPlayer.mixActive ? " toggle-btn--on" : ""}`}
                  onClick={() => stemPlayer.setMixActive(!stemPlayer.mixActive)}
                >
                  {stemPlayer.mixActive ? "On" : "Off"}
                </button>
              )}
            </div>

            {!stemPlayer.stemsAvailable ? (
              <div className="stem-panel-body">
                <p className="stem-panel-hint">
                  Split the song into six instrument stems, then choose exactly
                  what plays while you practice.
                </p>
                <button
                  className="stem-generate-btn"
                  onClick={stemPlayer.generateStems}
                  disabled={stemPlayer.stemsBusy}
                >
                  {stemPlayer.stemsBusy
                    ? `Splitting stems... ${stemPlayer.stemsProgress}%`
                    : "Split stems"}
                </button>
                {stemPlayer.error && <p className="stem-panel-error">{stemPlayer.error}</p>}
              </div>
            ) : (
              <div className="stem-panel-body">
                {stemPlayer.mixerStems.map((name) => (
                  <label key={name} className={`stem-row${stemPlayer.mixActive ? "" : " stem-row--inactive"}`}>
                    <span className="stem-row-name">{stemLabel(name)}</span>
                    <input
                      type="checkbox"
                      checked={stemPlayer.mix[name] ?? true}
                      disabled={!stemPlayer.mixActive}
                      onChange={(e) => stemPlayer.setStemAudible(name, e.target.checked)}
                    />
                  </label>
                ))}

                <div className="stem-beta">
                  {!stemPlayer.guitarSplitAvailable ? (
                    <button
                      className="stem-beta-btn"
                      onClick={stemPlayer.splitGuitar}
                      disabled={stemPlayer.guitarSplitBusy}
                    >
                      {stemPlayer.guitarSplitBusy
                        ? `Splitting guitar... ${stemPlayer.guitarSplitProgress}%`
                        : "Split guitar into rhythm & lead"}
                      <span className="stem-beta-tag">beta</span>
                    </button>
                  ) : (
                    <p className="stem-beta-note">
                      Guitar split into rhythm &amp; lead (beta — approximate,
                      expect some bleed).
                    </p>
                  )}
                </div>

                {stemPlayer.error && <p className="stem-panel-error">{stemPlayer.error}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      {showTrackNav && (
        <button
          className="media-icon-btn"
          onClick={queue!.playPrev}
          disabled={!queue!.hasPrev}
          aria-label="Previous track"
          title="Previous track"
        >
          ⏮
        </button>
      )}

      <button className="media-play-btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
        {playing ? "⏸" : "▶"}
      </button>

      {showTrackNav && (
        <button
          className="media-icon-btn"
          onClick={queue!.playNext}
          disabled={!queue!.hasNext}
          aria-label="Next track"
          title="Next track"
        >
          ⏭
        </button>
      )}

      {queue && (
        <div className="media-queue-wrap" ref={queueWrapRef}>
          <button
            className={`media-icon-btn${queue.queueLength > 0 ? " media-icon-btn--active" : ""}`}
            onClick={() => setQueueOpen((v) => !v)}
            aria-label="Queue"
            aria-expanded={queueOpen}
            title={queue.queueLength > 0 ? `Queue — ${queue.queueLength} up next` : "Queue"}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="15" y2="6" />
              <line x1="3" y1="12" x2="15" y2="12" />
              <line x1="3" y1="18" x2="11" y2="18" />
              <polygon points="17 14 22 17 17 20" fill="currentColor" stroke="none" />
            </svg>
            {queue.queueLength > 0 && (
              <span className="media-queue-badge">{queue.queueLength}</span>
            )}
          </button>

          {queueOpen && (
            <div className="queue-panel">
              <div className="queue-panel-header">
                <span>Up next</span>
                {queue.upNext.length > 0 && (
                  <button className="queue-clear-btn" onClick={queue.clearQueue}>
                    Clear
                  </button>
                )}
              </div>

              <div className="queue-panel-body">
                {queue.nowPlaying && (
                  <div className="queue-context">
                    Playing from <strong>{queue.nowPlaying.name}</strong> ·{" "}
                    {queue.nowPlaying.position}/{queue.nowPlaying.total}
                  </div>
                )}

                {queue.upNext.length === 0 ? (
                  <p className="queue-panel-hint">
                    Nothing queued. Use ＋ on a song in your library to line it up.
                  </p>
                ) : (
                  <ul className="queue-list">
                    {queue.upNext.map((entry, i) => (
                      <li key={entry.uid} className="queue-row">
                        <span className="queue-row-num">{i + 1}</span>
                        <span className="queue-row-title" title={entry.song.title}>
                          {entry.song.title}
                        </span>
                        <button
                          className="queue-row-remove"
                          onClick={() => queue.removeQueued(entry.uid)}
                          aria-label={`Remove ${entry.song.title} from queue`}
                          title="Remove from queue"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <span className="media-time">{formatTime(currentTime)}</span>

      <div className="media-seek-wrap">
        <div className="media-seek-track">
          <div className="media-seek-fill" style={{ width: `${pct}%` }} />
        </div>
        <input
          className="media-seek"
          type="range"
          min={0}
          max={duration || 1}
          step={0.5}
          value={currentTime}
          onChange={(e) => seek(Number(e.target.value))}
        />
      </div>

      <span className="media-time">{formatTime(duration)}</span>

      <div className="media-volume">
        <span className="media-vol-icon">{volume === 0 ? "🔇" : "🔊"}</span>
        <input
          className="media-vol-slider"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolumeLevel(Number(e.target.value))}
        />
      </div>

      {(title || videoKey || queue?.nowPlaying) && (
        <div className="media-info">
          {queue?.nowPlaying && (
            <span className="media-playlist-tag" title={`Playing from "${queue.nowPlaying.name}"`}>
              <span className="media-playlist-name">{queue.nowPlaying.name}</span>
              <span className="media-playlist-pos">
                {queue.nowPlaying.position}/{queue.nowPlaying.total}
              </span>
              <button
                className="media-playlist-stop"
                onClick={queue.stopContext}
                aria-label="Stop playing this playlist"
                title="Stop playing this playlist"
              >
                ✕
              </button>
            </span>
          )}
          {title && (
            <div ref={titleWrapRef} className="media-title-wrap">
              <span
                ref={titleInnerRef}
                className={`media-title${titleOverflow > 0 ? " media-title--scroll" : ""}`}
                style={
                  titleOverflow > 0
                    ? ({ "--td": `${titleOverflow}px` } as React.CSSProperties)
                    : undefined
                }
              >
                {title}
              </span>
            </div>
          )}
          {videoKey && <span className="media-key">{videoKey}</span>}
        </div>
      )}
    </div>
  );
}
