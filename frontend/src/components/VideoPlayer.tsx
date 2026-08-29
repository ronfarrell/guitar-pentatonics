import { useEffect } from "react";
import type { ReactNode } from "react";
import { registerMedia } from "../services/audioGraph";

type Props = {
  videoPath: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  videoKey: string;
  onTogglePlay: () => void;
  visualizerOn: boolean;
  onToggleVisualizer: () => void;
  /** CSS aspect-ratio to pin the stage to, or null to follow the video. */
  stageAspect: string | null;
  /** Visualizer canvas, laid over the video when it's on */
  children?: ReactNode;
};

export default function VideoPlayer({
  videoPath,
  videoRef,
  videoKey,
  onTogglePlay,
  visualizerOn,
  onToggleVisualizer,
  stageAspect,
  children,
}: Props) {
  // Let the visualizer tap this element's audio. No-op until the visualizer
  // actually starts the audio graph.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    return registerMedia(el);
  }, [videoPath, videoRef]);

  return (
    <section className="video-card">
      {/* A pinned frame only makes sense while the canvas is covering the
          video — with the visualizer off, the video keeps its own shape. */}
      <div
        className={`video-stage${stageAspect ? " video-stage--fixed" : ""}`}
        style={stageAspect ? { aspectRatio: stageAspect } : undefined}
      >
        {/* crossOrigin is what keeps the Web Audio tap from being tainted
            (and silent) when the backend is on another origin. */}
        <video
          key={videoPath}
          ref={videoRef}
          crossOrigin="anonymous"
          playsInline
          onClick={onTogglePlay}
          style={{ cursor: "pointer" }}
        >
          <source src={videoPath} type="video/mp4" />
        </video>
        {children}
      </div>

      <div className="video-card-footer">
        <span>Key: {videoKey}</span>
        <button
          className={`toggle-btn${visualizerOn ? " toggle-btn--on" : ""}`}
          onClick={onToggleVisualizer}
          title={
            visualizerOn
              ? "Hide the visualizer and show the video"
              : "Show a visualizer driven by the audio and the detected chords"
          }
        >
          Visualizer {visualizerOn ? "On" : "Off"}
        </button>
      </div>
    </section>
  );
}
