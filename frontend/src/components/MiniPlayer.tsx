import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  videoSrc: string | null;
  visible: boolean;
  playing: boolean;
  onTogglePlay: () => void;
};

type Pos = { x: number; y: number };

const MINI_W = 240;
const MINI_H = 136; // approx 16:9

function getInitialPos(): Pos {
  const barWidth = Math.min(520, window.innerWidth - 32);
  const barBottom = 18;
  const barHeight = 50;
  // place to the right of the centered media bar, vertically aligned with it
  const x = window.innerWidth / 2 + barWidth / 2 + 10;
  const y = window.innerHeight - barBottom - Math.max(MINI_H, barHeight);
  return {
    x: Math.min(x, window.innerWidth - MINI_W - 8),
    y: Math.max(8, y),
  };
}

export default function MiniPlayer({ videoRef, videoSrc, visible, playing, onTogglePlay }: Props) {
  const miniRef = useRef<HTMLVideoElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef<Pos>({ x: 0, y: 0 });

  // Set initial position once the player first becomes visible
  useEffect(() => {
    if (visible && pos === null) setPos(getInitialPos());
  }, [visible]); // eslint-disable-line

  // Sync mini video playback with main video
  useEffect(() => {
    const main = videoRef.current;
    const mini = miniRef.current;
    if (!main || !mini || !videoSrc) return;

    mini.currentTime = main.currentTime;
    if (!main.paused) mini.play().catch(() => {});

    const sync = () => {
      if (Math.abs(mini.currentTime - main.currentTime) > 0.5)
        mini.currentTime = main.currentTime;
    };
    const onPlay = () => mini.play().catch(() => {});
    const onPause = () => mini.pause();
    const onSeeked = () => { mini.currentTime = main.currentTime; };

    main.addEventListener("timeupdate", sync);
    main.addEventListener("play", onPlay);
    main.addEventListener("pause", onPause);
    main.addEventListener("seeked", onSeeked);
    return () => {
      main.removeEventListener("timeupdate", sync);
      main.removeEventListener("play", onPlay);
      main.removeEventListener("pause", onPause);
      main.removeEventListener("seeked", onSeeked);
    };
  }, [videoSrc]); // eslint-disable-line

  // Mouse drag
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(e.clientX - dragOffset.current.x, window.innerWidth - MINI_W)),
        y: Math.max(0, Math.min(e.clientY - dragOffset.current.y, window.innerHeight - MINI_H)),
      });
    }
    function onUp() {
      dragging.current = false;
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Touch drag
  useEffect(() => {
    function onMove(e: TouchEvent) {
      if (!dragging.current) return;
      e.preventDefault();
      const t = e.touches[0];
      setPos({
        x: Math.max(0, Math.min(t.clientX - dragOffset.current.x, window.innerWidth - MINI_W)),
        y: Math.max(0, Math.min(t.clientY - dragOffset.current.y, window.innerHeight - MINI_H)),
      });
    }
    function onEnd() { dragging.current = false; }
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  function startDrag(clientX: number, clientY: number) {
    dragging.current = true;
    dragOffset.current = { x: clientX - (pos?.x ?? 0), y: clientY - (pos?.y ?? 0) };
    document.body.style.userSelect = "none";
  }

  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    startDrag(e.clientX, e.clientY);
    e.preventDefault();
  }

  function onTouchStart(e: React.TouchEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    startDrag(e.touches[0].clientX, e.touches[0].clientY);
  }

  if (!videoSrc) return null;

  const posStyle: React.CSSProperties = pos !== null
    ? { left: pos.x, top: pos.y, bottom: "auto", right: "auto" }
    : {};

  return (
    <div
      className={`mini-player${visible ? " mini-player--visible" : ""}`}
      style={posStyle}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      <video ref={miniRef} src={videoSrc} muted playsInline className="mini-player-video" />
      <button
        className="mini-player-overlay"
        onClick={onTogglePlay}
        aria-label={playing ? "Pause" : "Play"}
      >
        <span className="mini-player-icon">{playing ? "⏸" : "▶"}</span>
      </button>
    </div>
  );
}
