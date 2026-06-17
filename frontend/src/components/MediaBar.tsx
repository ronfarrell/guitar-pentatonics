import { useRef, useEffect, useState } from "react";
import type { RefObject } from "react";
import type { MediaControls } from "../hooks/useMediaControls";

type Props = MediaControls & {
  videoRef: RefObject<HTMLVideoElement | null>;
  videoSrc: string | null;
  title?: string | null;
  videoKey?: string | null;
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
}: Props) {
  const titleWrapRef = useRef<HTMLDivElement>(null);
  const titleInnerRef = useRef<HTMLSpanElement>(null);
  const [titleOverflow, setTitleOverflow] = useState(0);

  useEffect(() => {
    const outer = titleWrapRef.current;
    const inner = titleInnerRef.current;
    if (!outer || !inner) { setTitleOverflow(0); return; }
    setTitleOverflow(Math.max(0, inner.scrollWidth - outer.clientWidth));
  }, [title]);

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
