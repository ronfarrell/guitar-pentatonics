import { useRef, useEffect, useState } from "react";
import type { RefObject } from "react";
import type { MediaControls } from "../hooks/useMediaControls";
import type { StemPlayer } from "../hooks/useStemPlayer";
import { STEM_NAMES } from "../hooks/useStemPlayer";

type Props = MediaControls & {
  videoRef: RefObject<HTMLVideoElement | null>;
  videoSrc: string | null;
  title?: string | null;
  videoKey?: string | null;
  stemPlayer: StemPlayer;
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
}: Props) {
  const titleWrapRef = useRef<HTMLDivElement>(null);
  const titleInnerRef = useRef<HTMLSpanElement>(null);
  const [titleOverflow, setTitleOverflow] = useState(0);

  const [mixerOpen, setMixerOpen] = useState(false);
  const mixerWrapRef = useRef<HTMLDivElement>(null);

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

  if (!videoSrc) return null;

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

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
                {STEM_NAMES.map((name) => (
                  <label key={name} className={`stem-row${stemPlayer.mixActive ? "" : " stem-row--inactive"}`}>
                    <span className="stem-row-name">{name}</span>
                    <input
                      type="checkbox"
                      checked={stemPlayer.mix[name]}
                      disabled={!stemPlayer.mixActive}
                      onChange={(e) => stemPlayer.setStemAudible(name, e.target.checked)}
                    />
                  </label>
                ))}
                {stemPlayer.error && <p className="stem-panel-error">{stemPlayer.error}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      <button className="media-play-btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
        {playing ? "⏸" : "▶"}
      </button>

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

      {(title || videoKey) && (
        <div className="media-info">
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
