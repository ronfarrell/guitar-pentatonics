import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { activateAnalyser, resumeAudio } from "../services/audioGraph";
import { noteIndex } from "../theory/notes";
import {
  DEFAULT_VIZ_SETTINGS,
  VISUALIZER_MODES,
  VISUALIZER_MODE_LABELS,
  VIZ_ASPECTS,
  VIZ_ASPECT_LABELS,
} from "./visualizerModes";
import type { VisualizerMode, VizSettings } from "./visualizerModes";

type Props = {
  mode: VisualizerMode;
  onModeChange: (mode: VisualizerMode) => void;
  settings: VizSettings;
  onSettingsChange: (settings: VizSettings) => void;
  playing: boolean;
  /** Chord under the playhead, from the song analysis */
  chord: string | null;
  /** 0 → 1 through the current chord */
  chordProgress: number;
  songKey: string | null;
  songTitle: string | null;
  /**
   * Transport for fullscreen. The real media bar lives outside this element,
   * and fullscreen renders only the fullscreen element's subtree — so without
   * these the controls simply vanish for as long as you're in it.
   */
  transport?: {
    playing: boolean;
    togglePlay: () => void;
    playPrev: () => void;
    playNext: () => void;
    hasPrev: boolean;
    hasNext: boolean;
    currentTime: number;
    duration: number;
    seek: (time: number) => void;
    formatTime: (seconds: number) => string;
  };
  /** The full media bar, for when the simple transport isn't enough. */
  fullBar?: ReactNode;
  /** The canvas covers the video, so it takes over click-to-play */
  onTogglePlay: () => void;
};

/** Opacity of each frame's background repaint — lower leaves longer trails. */
const BG_ALPHA: Record<VisualizerMode, number> = {
  orbit: 0.22,
  spectrum: 0.55,
  ribbon: 0.14,
  retro: 0.85,
  // Classic runs on frame feedback and paints no background of its own.
  classic: 1,
  bounce: 0.35,
};

const BANDS = 64;
const SPECTRUM_LO_HZ = 32;
const SPECTRUM_HI_HZ = 14000;

/**
 * Fibonacci lattice on the unit sphere. Bounce's ball wears these as surface
 * markings — without something fixed to the surface, a shaded circle sliding
 * around the screen reads as a sprite rather than a rolling ball.
 */
const SPHERE_DOTS = Array.from({ length: 90 }, (_, i) => {
  const t = (i + 0.5) / 90;
  const y = 1 - 2 * t;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const phi = i * Math.PI * (3 - Math.sqrt(5));
  return { x: Math.cos(phi) * r, y, z: Math.sin(phi) * r };
});

const hsl = (h: number, s: number, l: number, a = 1) =>
  `hsla(${h.toFixed(1)}, ${s}%, ${l}%, ${a})`;

/**
 * Hue for a chord, walked around the circle of fifths rather than the
 * chromatic scale: chords that are close musically (I → V → IV) then land on
 * neighbouring hues, so the colour drifts with the progression instead of
 * jumping at every change. Minor chords sit cooler and darker.
 */
function chordColor(chord: string | null): { hue: number; minor: boolean } {
  const root = chord?.match(/^[A-G](#|b)?/)?.[0];
  if (!root) return { hue: 264, minor: false };
  const fifths = (noteIndex(root) * 7) % 12;
  return { hue: fifths * 30, minor: /m(?!aj)/i.test(chord ?? "") };
}

/** Interpolate hues the short way around the wheel. */
function lerpHue(from: number, to: number, t: number) {
  const delta = ((to - from + 540) % 360) - 180;
  return (from + delta * t + 360) % 360;
}

export default function Visualizer({
  mode,
  onModeChange,
  settings,
  onSettingsChange,
  playing,
  chord,
  chordProgress,
  songKey,
  songTitle,
  transport,
  fullBar,
  onTogglePlay,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [silent, setSilent] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [barExpanded, setBarExpanded] = useState(false);

  // The draw loop reads live values through a ref so a chord tick (20×/sec)
  // never tears down and restarts the animation.
  const live = useRef({ mode, playing, chord, chordProgress, settings });
  useEffect(() => {
    live.current = { mode, playing, chord, chordProgress, settings };
  });

  useEffect(() => {
    if (playing) resumeAudio();
  }, [playing]);

  // Fullscreen can also be left by Escape or the browser's own chrome, so the
  // state has to come from the event rather than from the toggle below.
  useEffect(() => {
    const onChange = () => {
      const isFull = document.fullscreenElement === rootRef.current;
      setFullscreen(isFull);
      if (!isFull) setBarExpanded(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!root || !canvas || !context) return;
    // Bind to non-nullable locals: the draw helpers below are hoisted
    // declarations, which don't inherit the narrowing from this guard.
    const c: CanvasRenderingContext2D = context;
    const cv: HTMLCanvasElement = canvas;

    const analyser = activateAnalyser();
    const bins = analyser?.frequencyBinCount ?? 0;
    const freq = new Uint8Array(bins);
    const wave = new Uint8Array(analyser?.fftSize ?? 0);
    const binHz = analyser
      ? analyser.context.sampleRate / 2 / Math.max(1, bins)
      : 1;

    // Log-spaced band edges: an even split would spend most of the picture on
    // the top two octaves, where music has almost no energy.
    const edges: number[] = [];
    for (let i = 0; i <= BANDS; i++) {
      const f = SPECTRUM_LO_HZ * Math.pow(SPECTRUM_HI_HZ / SPECTRUM_LO_HZ, i / BANDS);
      edges.push(Math.min(Math.max(bins - 1, 0), Math.round(f / binHz)));
    }
    const bassEnd = Math.max(2, Math.min(bins, Math.round(160 / binHz)));

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = root.clientWidth;
      h = root.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(root);

    const bands = new Float32Array(BANDS);
    const bassHistory: number[] = [];
    const rings: { r: number; alpha: number }[] = [];
    // Retro's star field, in normalised coords so a resize never reshuffles it.
    const stars = Array.from({ length: 90 }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: Math.random() < 0.85 ? 1 : 2,
      phase: Math.random() * Math.PI * 2,
    }));

    let hue = chordColor(live.current.chord).hue;
    let minorMix = 0;
    let level = 0;
    let pulse = 0;
    let flash = 0;
    let spin = 0;
    let scroll = 0;
    let rot = 0;
    let lastFrame = performance.now();
    // One beat's worth of "a kick just landed", consumed by Bounce and
    // cleared at the end of the frame.
    let beat = false;
    // Bounce's whole world: metres-ish, camera at the origin looking down +z.
    const ball = { x: 0, y: 0, z: 5.2, vx: 0.55, vy: 0, vz: 0.35, rollX: 0, rollZ: 0 };
    let squash = 0;
    const ghosts: { x: number; y: number; z: number }[] = [];
    let lastBeat = 0;
    let lastChord = live.current.chord;
    let lastSignal = performance.now();
    let quiet = false;
    let raf = 0;
    // Mirrors settings.chords for the draw helpers, which run below the point
    // where frame() reads the live settings.
    let showChords = live.current.settings.chords;

    /** Pull one frame of audio into the smoothed values the modes draw from. */
    function sample(now: number) {
      if (!analyser) return;
      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(wave);

      const gain = live.current.settings.intensity;
      let peak = 0;
      for (let i = 0; i < BANDS; i++) {
        const lo = edges[i];
        const hi = Math.max(lo + 1, edges[i + 1]);
        let max = 0;
        for (let b = lo; b < hi && b < bins; b++) if (freq[b] > max) max = freq[b];
        // Tilt the top end up: real music rolls off with frequency, and an
        // untilted spectrum reads as a ramp sliding into nothing.
        const v = Math.min(1, (max / 255) * (1 + 1.1 * (i / BANDS)) * gain);
        // Fast attack, slow release — transients pop, decays stay smooth.
        bands[i] += (v - bands[i]) * (v > bands[i] ? 0.55 : 0.11);
        if (max > peak) peak = max;
      }

      let sum = 0;
      for (let i = 0; i < wave.length; i++) {
        const s = (wave[i] - 128) / 128;
        sum += s * s;
      }
      const rms = wave.length ? Math.sqrt(sum / wave.length) : 0;
      level += (Math.min(1, rms * 2.6 * gain) - level) * 0.18;

      // Onset detection on the bass band: an energy spike well above the
      // running average is a kick/downbeat. Cheap, and it locks on well
      // enough to hang ripples and pulses off. Deliberately reads the raw
      // bins, so the reactivity slider can't drag the beat detector around.
      let bass = 0;
      for (let i = 0; i < bassEnd; i++) bass += freq[i];
      bass = bass / bassEnd / 255;
      bassHistory.push(bass);
      if (bassHistory.length > 60) bassHistory.shift();
      const avg = bassHistory.reduce((a, b) => a + b, 0) / bassHistory.length;
      if (bass > avg * 1.32 && bass > 0.22 && now - lastBeat > 200) {
        lastBeat = now;
        pulse = 1;
        beat = true;
        // Only Orbit consumes these; cap the backlog so the other modes
        // don't accumulate ripples they never draw.
        if (rings.length > 24) rings.shift();
        rings.push({ r: 0, alpha: 1 });
      }

      if (peak > 0) lastSignal = now;
    }

    function background(alpha: number) {
      const base = 4 + minorMix * -1;
      c.globalCompositeOperation = "source-over";
      c.fillStyle = hsl(hue, 45, Math.max(2, base), alpha);
      c.fillRect(0, 0, w, h);

      const glow = c.createRadialGradient(
        w / 2,
        h / 2,
        0,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.7,
      );
      const strength = (0.1 + level * 0.3 + pulse * 0.18) * alpha;
      glow.addColorStop(0, hsl(hue, 70, 40 - minorMix * 10, strength));
      glow.addColorStop(1, hsl(hue, 70, 8, 0));
      c.fillStyle = glow;
      c.fillRect(0, 0, w, h);

      if (flash > 0.01) {
        c.fillStyle = hsl(hue, 80, 60, flash * 0.1);
        c.fillRect(0, 0, w, h);
      }
    }

    function drawSpectrum() {
      const sat = 78 - minorMix * 18;
      const floor = h * 0.9;
      const span = h * 0.72;
      const slot = w / BANDS;
      const barW = Math.max(2, slot * 0.62);

      c.globalCompositeOperation = "lighter";
      for (let i = 0; i < BANDS; i++) {
        const v = bands[i];
        const bh = Math.max(2, v * span * (0.55 + pulse * 0.12));
        const x = i * slot + (slot - barW) / 2;
        const bandHue = (hue + (i / BANDS) * 70 - 35 + 360) % 360;
        const light = 42 + v * 30;

        const g = c.createLinearGradient(0, floor - bh, 0, floor);
        g.addColorStop(0, hsl(bandHue, sat, Math.min(80, light + 14), 0.95));
        g.addColorStop(1, hsl(bandHue, sat, light * 0.55, 0.5));
        c.fillStyle = g;
        c.shadowBlur = 14 * v;
        c.shadowColor = hsl(bandHue, sat, 60, 0.55);
        c.beginPath();
        c.roundRect(x, floor - bh, barW, bh, barW / 2);
        c.fill();

        // Reflection under the floor line, fading out.
        c.shadowBlur = 0;
        c.globalAlpha = 0.18;
        c.beginPath();
        c.roundRect(x, floor + 2, barW, bh * 0.32, barW / 2);
        c.fill();
        c.globalAlpha = 1;
      }
      c.shadowBlur = 0;
      c.globalCompositeOperation = "source-over";

      // Chord timeline along the floor.
      if (!showChords) return;
      const p = Math.min(1, Math.max(0, live.current.chordProgress));
      c.fillStyle = hsl(hue, 60, 40, 0.25);
      c.fillRect(0, floor + h * 0.09, w, 2);
      c.fillStyle = hsl(hue, 85, 65, 0.9);
      c.fillRect(0, floor + h * 0.09, w * p, 2);
    }

    function drawOrbit(now: number) {
      const cx = w / 2;
      const cy = h / 2;
      const unit = Math.min(w, h);
      const r0 = unit * (0.19 + pulse * 0.012 + level * 0.02);
      const sat = 80 - minorMix * 22;

      spin += 0.0016 + level * 0.006;

      c.save();
      c.translate(cx, cy);
      c.rotate(spin);
      c.globalCompositeOperation = "lighter";
      c.lineCap = "round";
      for (let i = 0; i < BANDS; i++) {
        const v = bands[i];
        const angle = (i / BANDS) * Math.PI * 2;
        const len = unit * 0.03 + v * unit * 0.26;
        const bandHue = (hue + (i / BANDS) * 80 - 40 + 360) % 360;
        c.strokeStyle = hsl(bandHue, sat, 45 + v * 28, 0.35 + v * 0.6);
        c.lineWidth = Math.max(1.5, (unit * 0.008) * (0.6 + v));
        c.shadowBlur = 12 * v;
        c.shadowColor = hsl(bandHue, sat, 62, 0.6);
        c.beginPath();
        c.moveTo(Math.cos(angle) * r0, Math.sin(angle) * r0);
        c.lineTo(Math.cos(angle) * (r0 + len), Math.sin(angle) * (r0 + len));
        c.stroke();
      }
      c.shadowBlur = 0;
      c.restore();

      // Beat ripples expanding out of the ring.
      c.globalCompositeOperation = "lighter";
      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i];
        ring.r += unit * 0.006 + level * unit * 0.004;
        ring.alpha *= 0.955;
        if (ring.alpha < 0.02 || ring.r > unit) {
          rings.splice(i, 1);
          continue;
        }
        c.strokeStyle = hsl(hue, sat, 66, ring.alpha * 0.35);
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(cx, cy, r0 + ring.r, 0, Math.PI * 2);
        c.stroke();
      }
      c.globalCompositeOperation = "source-over";

      const rIn = r0 - unit * 0.028;
      const label = showChords ? live.current.chord : null;

      if (showChords) {
        // Inner ring fills as the current chord runs out.
        const p = Math.min(1, Math.max(0, live.current.chordProgress));
        c.strokeStyle = hsl(hue, 40, 32, 0.55);
        c.lineWidth = Math.max(2, unit * 0.008);
        c.beginPath();
        c.arc(cx, cy, rIn, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = hsl(hue, 85, 66, 0.95);
        c.lineCap = "round";
        c.beginPath();
        c.arc(cx, cy, rIn, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
        c.stroke();
      }

      if (label) {
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillStyle = hsl(hue, 30, 96, 0.92);
        c.font = `600 ${Math.round(unit * 0.13)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        c.fillText(label, cx, cy);
      } else {
        // No chord to show — breathe gently so the middle never looks frozen.
        c.strokeStyle = hsl(hue, 50, 60, 0.25 + 0.15 * Math.sin(now / 900));
        c.lineWidth = 1;
        c.beginPath();
        c.arc(cx, cy, rIn * (showChords ? 0.5 : 0.85), 0, Math.PI * 2);
        c.stroke();
      }
    }

    function drawRibbon(now: number) {
      const sat = 82 - minorMix * 24;
      const mid = h / 2;
      const n = wave.length || 256;
      const step = Math.max(1, Math.floor(n / Math.max(1, Math.round(w))));
      const gain = live.current.settings.intensity;

      c.globalCompositeOperation = "lighter";
      for (let layer = 0; layer < 3; layer++) {
        const depth = layer / 2;
        const amp = h * (0.34 - depth * 0.09) * (0.35 + level * 1.5 + pulse * 0.2);
        const drift = Math.sin(now / (1400 + layer * 620)) * h * 0.05;
        const layerHue = (hue + layer * 26 - 26 + 360) % 360;

        c.strokeStyle = hsl(layerHue, sat, 58 + layer * 6, 0.75 - depth * 0.32);
        c.lineWidth = Math.max(1.2, 2.6 - layer * 0.7);
        c.shadowBlur = 16 - layer * 4;
        c.shadowColor = hsl(layerHue, sat, 62, 0.5);
        c.beginPath();
        for (let i = 0, x = 0; i < n; i += step, x = (i / n) * w) {
          const s = wave.length
            ? ((wave[i] - 128) / 128) * gain
            : Math.sin(i / 9 + now / 400) * 0.2;
          const y = mid + drift + s * amp;
          if (i === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.stroke();
      }
      c.shadowBlur = 0;

      // Low-end bloom behind the waveform, driven by the bass bands.
      let low = 0;
      for (let i = 0; i < 10; i++) low += bands[i];
      low /= 10;
      const bloom = c.createRadialGradient(w / 2, mid, 0, w / 2, mid, w * 0.5);
      bloom.addColorStop(0, hsl(hue, 90, 60, low * 0.22 + pulse * 0.1));
      bloom.addColorStop(1, hsl(hue, 90, 60, 0));
      c.fillStyle = bloom;
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = "source-over";

      const label = showChords ? live.current.chord : null;
      if (label) {
        c.textAlign = "left";
        c.textBaseline = "alphabetic";
        c.fillStyle = hsl(hue, 30, 96, 0.5);
        c.font = `600 ${Math.round(Math.min(w, h) * 0.11)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        c.fillText(label, w * 0.045, h * 0.9);
      }
    }

    /**
     * Retro paints a whole scene rather than accumulating strokes, so it lays
     * down its own sky instead of the shared radial background.
     */
    function retroSky(alpha: number) {
      c.globalCompositeOperation = "source-over";
      const g = c.createLinearGradient(0, 0, 0, h * 0.6);
      g.addColorStop(0, hsl(hue, 70, 5, alpha));
      g.addColorStop(0.6, hsl((hue + 25) % 360, 75, 10, alpha));
      g.addColorStop(1, hsl((hue + 45) % 360, 85, 20, alpha));
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
    }

    function drawRetro(now: number) {
      const horizon = h * 0.54;
      const unit = Math.min(w, h);
      const cx = w / 2;
      const sat = 92 - minorMix * 22;
      // Grid and skyline sit opposite the sun on the wheel — that magenta /
      // cyan split is most of what makes this read as "retro".
      const neon = (hue + 165) % 360;

      // Star field, twinkling slightly with the music.
      c.globalCompositeOperation = "lighter";
      for (const star of stars) {
        const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(now / 900 + star.phase));
        c.fillStyle = hsl((hue + 40) % 360, 35, 90, twinkle * (0.3 + level * 0.5));
        c.fillRect(star.x * w, star.y * horizon * 0.94, star.s, star.s);
      }
      c.globalCompositeOperation = "source-over";

      // Sun: a neon disc sliced by cuts that widen toward the bottom.
      const r = unit * (0.17 + level * 0.035 + pulse * 0.012);
      const cy = horizon - unit * 0.02;
      c.save();
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.clip();
      const sun = c.createLinearGradient(0, cy - r, 0, cy + r);
      sun.addColorStop(0, hsl((hue + 55) % 360, 100, 68));
      sun.addColorStop(0.55, hsl((hue + 20) % 360, 100, 58));
      sun.addColorStop(1, hsl(hue, 100, 44));
      c.fillStyle = sun;
      c.fillRect(cx - r, cy - r, r * 2, r * 2);
      c.fillStyle = hsl(hue, 60, 5, 0.92);
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        c.fillRect(cx - r, cy - r * 0.15 + t * r * 1.2, r * 2, r * (0.012 + t * 0.075));
      }
      c.restore();

      c.globalCompositeOperation = "lighter";
      const glow = c.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 2.6);
      glow.addColorStop(0, hsl((hue + 30) % 360, 100, 55, 0.26 + pulse * 0.1));
      glow.addColorStop(1, hsl(hue, 100, 50, 0));
      c.fillStyle = glow;
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = "source-over";

      // Skyline cut straight out of the spectrum, standing in front of the sun.
      c.beginPath();
      c.moveTo(0, horizon);
      for (let i = 0; i < BANDS; i++) {
        const x = (i / (BANDS - 1)) * w;
        c.lineTo(x, horizon - h * 0.008 - bands[i] * h * 0.2);
      }
      c.lineTo(w, horizon);
      c.closePath();
      c.fillStyle = hsl(hue, 55, 5, 0.95);
      c.fill();
      c.strokeStyle = hsl(neon, sat, 64, 0.9);
      c.lineWidth = 1.5;
      c.shadowBlur = 12;
      c.shadowColor = hsl(neon, sat, 60, 0.8);
      c.stroke();
      c.shadowBlur = 0;

      // Floor plane, then the grid over it.
      c.fillStyle = hsl(hue, 65, 4, 0.92);
      c.fillRect(0, horizon, w, h - horizon);

      scroll = (scroll + 0.004 + level * 0.022 + pulse * 0.01) % 1;
      const depth = h - horizon;
      c.lineWidth = 1;
      // Rows: t² compresses them toward the horizon, which is the whole trick.
      for (let i = 0; i < 14; i++) {
        const t = (i + scroll) / 14;
        const y = horizon + depth * t * t;
        c.strokeStyle = hsl(neon, sat, 55, (0.12 + t * 0.7) * 0.8);
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(w, y);
        c.stroke();
      }
      c.strokeStyle = hsl(neon, sat, 55, 0.32);
      for (let i = -12; i <= 12; i++) {
        c.beginPath();
        c.moveTo(cx, horizon);
        c.lineTo(cx + i * w * 0.13, h);
        c.stroke();
      }

      c.globalCompositeOperation = "lighter";
      c.strokeStyle = hsl(neon, sat, 72, 0.9);
      c.lineWidth = 2;
      c.shadowBlur = 18;
      c.shadowColor = hsl(neon, sat, 62, 1);
      c.beginPath();
      c.moveTo(0, horizon);
      c.lineTo(w, horizon);
      c.stroke();
      c.shadowBlur = 0;
      c.globalCompositeOperation = "source-over";

      if (showChords) {
        const label = live.current.chord;
        const size = Math.round(unit * 0.15);
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.font = `700 ${size}px "Courier New", ui-monospace, monospace`;
        const ly = horizon * 0.42;
        if (label) {
          // Split the text into RGB ghosts — cheap chromatic aberration.
          c.globalCompositeOperation = "lighter";
          c.fillStyle = hsl(330, 100, 62, 0.5);
          c.fillText(label, cx - 3, ly);
          c.fillStyle = hsl(185, 100, 62, 0.5);
          c.fillText(label, cx + 3, ly);
          c.globalCompositeOperation = "source-over";
          c.fillStyle = "rgba(255, 255, 255, 0.95)";
          c.fillText(label, cx, ly);
        }

        // Chord progress as a segmented counter along the bottom.
        const p = Math.min(1, Math.max(0, live.current.chordProgress));
        const segs = 16;
        const segW = unit * 0.02;
        const gap = segW * 0.45;
        const total = segs * segW + (segs - 1) * gap;
        const x0 = cx - total / 2;
        const y0 = h - unit * 0.07;
        for (let i = 0; i < segs; i++) {
          const lit = i / segs < p;
          c.fillStyle = lit
            ? hsl(neon, sat, 66, 0.95)
            : hsl(neon, 40, 60, 0.16);
          c.fillRect(x0 + i * (segW + gap), y0, segW, unit * 0.012);
        }
      }

      // CRT dressing: fixed scanlines plus one slow bright roll.
      c.fillStyle = "rgba(0, 0, 0, 0.16)";
      for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
      const roll = ((now / 14) % (h + 260)) - 130;
      const rg = c.createLinearGradient(0, roll - 60, 0, roll + 60);
      rg.addColorStop(0, "rgba(255, 255, 255, 0)");
      rg.addColorStop(0.5, "rgba(255, 255, 255, 0.045)");
      rg.addColorStop(1, "rgba(255, 255, 255, 0)");
      c.fillStyle = rg;
      c.fillRect(0, roll - 60, w, 120);
    }

    /**
     * The old Windows / Winamp look: every frame redraws the *previous* frame
     * slightly zoomed and rotated, so anything drawn once gets dragged outward
     * forever. That feedback loop is the whole effect — the only thing drawn
     * fresh each frame is a waveform ring in the middle.
     */
    function drawClassic(now: number, trails: number) {
      const cw = cv.width;
      const ch = cv.height;

      c.save();
      // Feedback has to happen in device pixels: the canvas is being drawn
      // into itself, so the DPR transform would compound every frame.
      c.setTransform(1, 0, 0, 1, 0, 0);
      const zoom = 1.012 + level * 0.026 + pulse * 0.014;
      rot += 0.0012 + level * 0.004;
      c.globalAlpha = 0.97;
      c.translate(cw / 2, ch / 2);
      c.rotate(Math.sin(rot) * 0.05);
      c.scale(zoom, zoom);
      c.translate(-cw / 2, -ch / 2);
      c.drawImage(cv, 0, 0);
      c.globalAlpha = 1;
      c.restore();

      // Bleed toward black, or the feedback saturates to a white blob within
      // a few seconds. This is what the trails slider actually controls here.
      c.globalCompositeOperation = "source-over";
      c.fillStyle = `rgba(3, 2, 10, ${0.16 - trails * 0.11})`;
      c.fillRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const unit = Math.min(w, h);
      const sat = 92 - minorMix * 20;
      const n = 200;
      const base = unit * (0.13 + level * 0.05 + pulse * 0.01);
      const amp = unit * 0.1 * (0.45 + level * 1.6);

      c.globalCompositeOperation = "lighter";
      c.lineCap = "round";

      // Two counter-rotating waveform rings, offset in hue.
      for (let ring = 0; ring < 2; ring++) {
        const dir = ring ? -1 : 1;
        const ringHue = (hue + ring * 40 + 360) % 360;
        c.strokeStyle = hsl(ringHue, sat, 62 - ring * 8, 0.9 - ring * 0.3);
        c.lineWidth = Math.max(1.4, unit * (ring ? 0.0035 : 0.006));
        c.shadowBlur = 18;
        c.shadowColor = hsl(ringHue, sat, 60, 0.9);
        c.beginPath();
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const angle = t * Math.PI * 2 + dir * rot * 3;
          const idx = Math.floor(t * (wave.length - 1));
          const sampleValue = wave.length
            ? (wave[idx] - 128) / 128
            : Math.sin(t * 14 + now / 300) * 0.35;
          const r = base * (1 + ring * 0.42) + sampleValue * amp;
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          if (i === 0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        c.closePath();
        c.stroke();
      }

      // Beat spikes: short rays that the feedback then smears into the tunnel.
      if (beat) {
        const rays = 12;
        c.strokeStyle = hsl((hue + 180) % 360, sat, 70, 0.75);
        c.lineWidth = Math.max(1.2, unit * 0.004);
        c.beginPath();
        for (let i = 0; i < rays; i++) {
          const angle = (i / rays) * Math.PI * 2 + rot;
          const r0 = base * 1.5;
          const r1 = r0 + unit * 0.09;
          c.moveTo(cx + Math.cos(angle) * r0, cy + Math.sin(angle) * r0);
          c.lineTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
        }
        c.stroke();
      }

      // Core.
      const core = c.createRadialGradient(cx, cy, 0, cx, cy, base * 0.85);
      core.addColorStop(0, hsl(hue, 40, 96, 0.5 + pulse * 0.3));
      core.addColorStop(1, hsl(hue, 90, 55, 0));
      c.fillStyle = core;
      c.fillRect(cx - base, cy - base, base * 2, base * 2);

      c.shadowBlur = 0;
      c.globalCompositeOperation = "source-over";

      if (showChords) {
        const label = live.current.chord;
        if (label) {
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillStyle = "rgba(255, 255, 255, 0.9)";
          c.font = `600 ${Math.round(unit * 0.09)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
          c.fillText(label, cx, h * 0.88);
        }
      }
    }

    /**
     * A ball bouncing in a room, drawn with a hand-rolled perspective
     * projection: world coordinates are metres with the camera at the origin
     * looking down +z, and everything on screen is x*f/z. Kicks throw the ball
     * upward, so it plays the track rather than just looping an animation.
     */
    function drawBounce(dt: number) {
      const f = Math.min(w, h) * 1.15;
      const cx = w / 2;
      const cy = h * 0.44;
      const FLOOR = 1.15;
      const R = 0.4 + level * 0.06;
      const sat = 80 - minorMix * 22;
      const project = (x: number, y: number, z: number) => {
        const s = f / Math.max(0.6, z);
        return { x: cx + x * s, y: cy + y * s, s };
      };

      // --- physics -------------------------------------------------------
      ball.vy += 7.4 * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      ball.z += ball.vz * dt;
      // Rolling: something travelling at v over the ground turns at v / R,
      // about the axis perpendicular to travel. Sideways motion rolls it
      // about the depth axis; motion in depth rolls it about the horizontal.
      ball.rollZ += (ball.vx / R) * dt;
      ball.rollX -= (ball.vz / R) * dt;
      squash *= Math.exp(-dt * 9);

      if (ball.y > FLOOR - R) {
        ball.y = FLOOR - R;
        const impact = Math.abs(ball.vy);
        squash = Math.min(0.42, 0.1 + impact * 0.055);
        // Keep a floor of energy in the bounce so a quiet passage doesn't
        // leave the ball sitting still on the ground.
        ball.vy = -Math.max(1.5, impact * 0.82);
      }
      if (beat) {
        ball.vy = -(2.6 + Math.min(1.8, level * 2.4));
        ball.vx += (Math.random() - 0.5) * 0.7;
        ball.vz += (Math.random() - 0.5) * 0.5;
      }
      // Invisible walls, so it can't wander out of frame.
      if (Math.abs(ball.x) > 1.7) {
        ball.x = Math.sign(ball.x) * 1.7;
        ball.vx *= -0.9;
      }
      if (ball.z < 3.4 || ball.z > 7.4) {
        ball.z = Math.min(7.4, Math.max(3.4, ball.z));
        ball.vz *= -0.9;
      }
      ball.vx *= 0.995;
      ball.vz *= 0.995;

      ghosts.push({ x: ball.x, y: ball.y, z: ball.z });
      if (ghosts.length > 16) ghosts.shift();

      // --- floor ---------------------------------------------------------
      c.globalCompositeOperation = "source-over";
      c.lineWidth = 1;
      for (let i = -8; i <= 8; i++) {
        const x = i * 0.42;
        const a = project(x, FLOOR, 3.0);
        const b = project(x, FLOOR, 8.6);
        c.strokeStyle = hsl(hue, 45, 52, 0.13);
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
      }
      for (let z = 3.0; z <= 8.6; z += 0.42) {
        const a = project(-3.4, FLOOR, z);
        const b = project(3.4, FLOOR, z);
        // Fade the far rows out instead of ending the floor on a hard line.
        c.strokeStyle = hsl(hue, 45, 52, 0.2 * (1 - (z - 3) / 5.6));
        c.beginPath();
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
        c.stroke();
      }

      // --- spectrum ring standing on the floor ---------------------------
      // Painter's algorithm, far to near — and the ball is part of that
      // ordering, not a layer on top of it: bars closer to the camera than
      // the ball have to be drawn after it, or the ball floats in front of
      // the whole ring no matter where it actually is in the room.
      const bars: { i: number; x: number; z: number }[] = [];
      for (let i = 0; i < BANDS; i++) {
        const angle = (i / BANDS) * Math.PI * 2;
        bars.push({
          i,
          x: Math.cos(angle) * 2.35,
          z: 5.4 + Math.sin(angle) * 2.35,
        });
      }
      bars.sort((a, b) => b.z - a.z);

      function drawBars(list: { i: number; x: number; z: number }[]) {
        c.globalCompositeOperation = "lighter";
        c.lineCap = "round";
        for (const bar of list) {
          const v = bands[bar.i];
          const top = project(bar.x, FLOOR - 0.06 - v * 1.7, bar.z);
          const bottom = project(bar.x, FLOOR, bar.z);
          const bandHue = (hue + (bar.i / BANDS) * 70 - 35 + 360) % 360;
          c.strokeStyle = hsl(bandHue, sat, 46 + v * 30, 0.25 + v * 0.6);
          c.lineWidth = Math.max(1.5, bottom.s * 0.055);
          c.beginPath();
          c.moveTo(bottom.x, bottom.y);
          c.lineTo(top.x, top.y);
          c.stroke();
        }
        c.globalCompositeOperation = "source-over";
      }

      drawBars(bars.filter((bar) => bar.z >= ball.z));

      // --- shadow --------------------------------------------------------
      const height = Math.max(0, FLOOR - R - ball.y);
      const shadow = project(ball.x, FLOOR, ball.z);
      const shadowR = R * shadow.s * (1 + height * 0.42);
      c.fillStyle = `rgba(0, 0, 0, ${0.42 * Math.max(0.12, 1 - height * 0.5)})`;
      c.beginPath();
      c.ellipse(shadow.x, shadow.y, shadowR, shadowR * 0.3, 0, 0, Math.PI * 2);
      c.fill();

      // --- motion trail ---------------------------------------------------
      c.globalCompositeOperation = "lighter";
      ghosts.forEach((g, i) => {
        const t = i / ghosts.length;
        const p = project(g.x, g.y, g.z);
        c.fillStyle = hsl(hue, sat, 58, 0.05 + t * 0.1);
        c.beginPath();
        c.arc(p.x, p.y, R * p.s * (0.35 + t * 0.6), 0, Math.PI * 2);
        c.fill();
      });
      c.globalCompositeOperation = "source-over";

      // --- ball ------------------------------------------------------------
      const p = project(ball.x, ball.y, ball.z);
      const rr = R * p.s;
      // Squash on impact, stretch while falling fast.
      const stretch = Math.min(0.15, Math.abs(ball.vy) * 0.02);
      const sx = 1 + squash * 0.5 - stretch * 0.5;
      const sy = 1 - squash * 0.5 + stretch;
      // Deform about the contact point, so a squashed ball stays planted on
      // the floor instead of shrinking away from it.
      const bx = p.x;
      const by = p.y + rr * (1 - sy);

      const shade = c.createRadialGradient(
        bx - rr * 0.36,
        by - rr * 0.42,
        rr * 0.06,
        bx,
        by,
        rr,
      );
      shade.addColorStop(0, hsl((hue + 20) % 360, 60, 96));
      shade.addColorStop(0.42, hsl(hue, sat, 62));
      shade.addColorStop(1, hsl(hue, sat, 22));
      c.fillStyle = shade;
      c.shadowBlur = 30 + pulse * 24;
      c.shadowColor = hsl(hue, sat, 58, 0.8);
      c.beginPath();
      c.ellipse(bx, by, rr * sx, rr * sy, 0, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;

      // Surface markings, turned by however far the ball has actually rolled.
      // The lighting gradient above stays put in screen space — it's the room
      // lighting the ball, not part of the ball — so the texture visibly
      // travels under the highlight.
      const ca = Math.cos(ball.rollX);
      const sa = Math.sin(ball.rollX);
      const cb = Math.cos(ball.rollZ);
      const sb = Math.sin(ball.rollZ);
      c.save();
      c.beginPath();
      c.ellipse(bx, by, rr * sx, rr * sy, 0, 0, Math.PI * 2);
      c.clip();
      for (let i = 0; i < SPHERE_DOTS.length; i++) {
        const d = SPHERE_DOTS[i];
        // Rotate about x, then about z.
        const y1 = d.y * ca - d.z * sa;
        const z1 = d.y * sa + d.z * ca;
        if (z1 > 0) continue; // back of the sphere, facing away
        const x2 = d.x * cb - y1 * sb;
        const y2 = d.x * sb + y1 * cb;
        const facing = -z1; // 1 dead centre, 0 at the rim
        const v = bands[(i * 7) % BANDS];
        c.fillStyle = hsl(
          (hue + 30 + v * 40) % 360,
          70,
          96,
          (0.1 + v * 0.5) * facing,
        );
        c.beginPath();
        c.arc(
          bx + x2 * rr * sx,
          by + y2 * rr * sy,
          rr * (0.05 + v * 0.045) * (0.35 + 0.65 * facing),
          0,
          Math.PI * 2,
        );
        c.fill();
      }
      c.restore();

      // Rim light along the far edge.
      c.strokeStyle = hsl((hue + 160) % 360, 90, 72, 0.5);
      c.lineWidth = Math.max(1, rr * 0.06);
      c.beginPath();
      c.ellipse(
        bx,
        by,
        rr * sx * 0.97,
        rr * sy * 0.97,
        0,
        Math.PI * 0.15,
        Math.PI * 0.95,
      );
      c.stroke();

      // Anything nearer than the ball, over the top of it.
      drawBars(bars.filter((bar) => bar.z < ball.z));

      if (showChords) {
        const label = live.current.chord;
        if (label) {
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillStyle = hsl(hue, 25, 96, 0.75);
          c.font = `600 ${Math.round(Math.min(w, h) * 0.085)}px system-ui, -apple-system, "Segoe UI", sans-serif`;
          c.fillText(label, w / 2, h * 0.9);
        }
      }
    }

    function frame(now: number) {
      raf = requestAnimationFrame(frame);
      if (document.hidden || w === 0 || h === 0) return;

      sample(now);

      const s = live.current.settings;
      showChords = s.chords;

      const current = showChords ? live.current.chord : null;
      if (current !== lastChord) {
        lastChord = current;
        flash = 1;
      }
      // With chords off the colour comes from the settings instead: either a
      // held hue or a slow drift. Ease faster there so dragging the slider
      // feels connected rather than laggy.
      const target = showChords
        ? chordColor(current)
        : { hue: s.cycle ? (now / 90) % 360 : s.hue, minor: false };
      hue = lerpHue(hue, target.hue, showChords ? 0.045 : 0.2);
      minorMix += ((target.minor ? 1 : 0) - minorMix) * 0.05;
      pulse *= 0.9;
      flash *= 0.93;

      const m = live.current.mode;
      // trails 0 → repaint hard (crisp); 1 → barely repaint (long smears).
      // 0.5 lands on the multiplier 1, i.e. each mode's tuned default.
      const alpha = Math.min(1, Math.max(0.03, BG_ALPHA[m] * (1.9 - 1.8 * s.trails)));
      const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
      lastFrame = now;

      if (m === "retro") {
        retroSky(alpha);
        drawRetro(now);
      } else if (m === "classic") {
        // No background pass: Classic's picture *is* the last frame.
        drawClassic(now, s.trails);
      } else {
        background(alpha);
        if (m === "spectrum") drawSpectrum();
        else if (m === "orbit") drawOrbit(now);
        else if (m === "bounce") drawBounce(dt);
        else drawRibbon(now);
      }
      beat = false;

      // Surface a dead tap (blocked context, muted mix) rather than just
      // showing an empty canvas and letting it look broken.
      const isQuiet = live.current.playing && now - lastSignal > 2500;
      if (isQuiet !== quiet) {
        quiet = isQuiet;
        setSilent(isQuiet);
      }
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  function toggleFullscreen() {
    const el = rootRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen().catch(() => {});
  }

  function set<K extends keyof VizSettings>(key: K, value: VizSettings[K]) {
    onSettingsChange({ ...settings, [key]: value });
  }

  const hueLocked = settings.chords || settings.cycle;
  const showTitle = settings.title && !!songTitle;
  const showKey = settings.chords && !!songKey;

  return (
    <div className="viz" ref={rootRef}>
      <canvas className="viz-canvas" ref={canvasRef} onClick={onTogglePlay} />

      {(showTitle || showKey) && (
        <div className="viz-caption">
          {showTitle && <span className="viz-title">{songTitle}</span>}
          {showKey && <span className="viz-key">{songKey}</span>}
        </div>
      )}

      {silent && (
        <span className="viz-hint">
          No audio reaching the visualizer — check the volume or stem mix
        </span>
      )}

      {panelOpen && (
        <div className="viz-settings">
          <div className="viz-setting">
            <span>Chords</span>
            <button
              role="switch"
              aria-checked={settings.chords}
              className={`viz-switch${settings.chords ? " viz-switch--on" : ""}`}
              onClick={() => set("chords", !settings.chords)}
              title="Chord name, progress and chord-driven colour"
            >
              {settings.chords ? "On" : "Off"}
            </button>
          </div>

          <div className="viz-setting">
            <span>Song title</span>
            <button
              role="switch"
              aria-checked={settings.title}
              className={`viz-switch${settings.title ? " viz-switch--on" : ""}`}
              onClick={() => set("title", !settings.title)}
              title="Show the song title in the corner"
            >
              {settings.title ? "On" : "Off"}
            </button>
          </div>

          <div className="viz-setting">
            <span>Cycle colour</span>
            <button
              role="switch"
              aria-checked={settings.cycle}
              className={`viz-switch${settings.cycle ? " viz-switch--on" : ""}`}
              onClick={() => set("cycle", !settings.cycle)}
              disabled={settings.chords}
              title={
                settings.chords
                  ? "Turn chords off to colour the visualizer by hand"
                  : "Drift the hue continuously"
              }
            >
              {settings.cycle ? "On" : "Off"}
            </button>
          </div>

          <label className="viz-setting">
            <span>Hue</span>
            <input
              className="viz-range viz-range--hue"
              type="range"
              min={0}
              max={359}
              value={settings.hue}
              disabled={hueLocked}
              onChange={(e) => set("hue", Number(e.target.value))}
              title={
                settings.chords
                  ? "The chord is driving the colour"
                  : settings.cycle
                    ? "Cycling — turn it off to pick a hue"
                    : "Base colour"
              }
            />
          </label>

          <label className="viz-setting">
            <span>Reactivity</span>
            <input
              className="viz-range"
              type="range"
              min={0.4}
              max={1.8}
              step={0.05}
              value={settings.intensity}
              onChange={(e) => set("intensity", Number(e.target.value))}
              title="How hard the picture reacts to the audio"
            />
          </label>

          <label className="viz-setting">
            <span>Trails</span>
            <input
              className="viz-range"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.trails}
              onChange={(e) => set("trails", Number(e.target.value))}
              title="Motion trail length"
            />
          </label>

          <div className="viz-setting viz-setting--stack">
            <span>Frame</span>
            <div className="viz-segmented">
              {VIZ_ASPECTS.map((a) => (
                <button
                  key={a}
                  className={`viz-seg-btn${a === settings.aspect ? " viz-seg-btn--on" : ""}`}
                  onClick={() => set("aspect", a)}
                  title={
                    a === "video"
                      ? "Match the video's own shape"
                      : `Fixed ${a} frame`
                  }
                >
                  {VIZ_ASPECT_LABELS[a]}
                </button>
              ))}
            </div>
          </div>

          <button
            className="viz-reset"
            onClick={() => onSettingsChange(DEFAULT_VIZ_SETTINGS)}
          >
            Reset
          </button>
        </div>
      )}

      {fullscreen && transport && !barExpanded && (
        <div className="viz-transport">
          <button
            className="viz-tp-btn"
            onClick={transport.playPrev}
            disabled={!transport.hasPrev}
            aria-label="Previous track"
            title="Previous track"
          >
            ⏮
          </button>

          <button
            className="viz-tp-btn viz-tp-btn--play"
            onClick={transport.togglePlay}
            aria-label={transport.playing ? "Pause" : "Play"}
          >
            {transport.playing ? "⏸" : "▶"}
          </button>

          <button
            className="viz-tp-btn"
            onClick={transport.playNext}
            disabled={!transport.hasNext}
            aria-label="Next track"
            title="Next track"
          >
            ⏭
          </button>

          <span className="viz-tp-time">
            {transport.formatTime(transport.currentTime)}
          </span>

          <div className="viz-tp-seek">
            <div className="viz-tp-track">
              <div
                className="viz-tp-fill"
                style={{
                  width: `${
                    transport.duration > 0
                      ? (transport.currentTime / transport.duration) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
            <input
              className="viz-tp-range"
              type="range"
              min={0}
              max={transport.duration || 1}
              step={0.5}
              value={transport.currentTime}
              onChange={(e) => transport.seek(Number(e.target.value))}
              aria-label="Seek"
            />
          </div>

          <span className="viz-tp-time">
            {transport.formatTime(transport.duration)}
          </span>

          {fullBar && (
            <button
              className="viz-tp-btn"
              onClick={() => setBarExpanded(true)}
              aria-label="Show the full media bar"
              title="Show the full media bar"
            >
              ⋯
            </button>
          )}
        </div>
      )}

      {fullscreen && barExpanded && fullBar && (
        <>
          {fullBar}
          <button
            className="viz-tp-collapse"
            onClick={() => setBarExpanded(false)}
            title="Back to the simple controls"
          >
            ▾ Simple controls
          </button>
        </>
      )}

      <div className={`viz-controls${panelOpen ? " viz-controls--pinned" : ""}`}>
        {VISUALIZER_MODES.map((m) => (
          <button
            key={m}
            className={`viz-mode-btn${m === mode ? " viz-mode-btn--on" : ""}`}
            onClick={() => onModeChange(m)}
          >
            {VISUALIZER_MODE_LABELS[m]}
          </button>
        ))}
        <button
          className={`viz-mode-btn${panelOpen ? " viz-mode-btn--on" : ""}`}
          onClick={() => setPanelOpen((open) => !open)}
          aria-label="Visualizer settings"
          aria-expanded={panelOpen}
          title="Visualizer settings"
        >
          ⚙
        </button>
        <button
          className="viz-mode-btn"
          onClick={toggleFullscreen}
          aria-label="Fullscreen"
          title="Fullscreen"
        >
          ⛶
        </button>
      </div>
    </div>
  );
}
