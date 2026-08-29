/** Visualizer modes and settings. Kept out of the component file so fast refresh works. */
export const VISUALIZER_MODES = [
  "orbit",
  "spectrum",
  "ribbon",
  "retro",
  "classic",
  "bounce",
] as const;

export type VisualizerMode = (typeof VISUALIZER_MODES)[number];

export const VISUALIZER_MODE_LABELS: Record<VisualizerMode, string> = {
  orbit: "Orbit",
  spectrum: "Spectrum",
  ribbon: "Ribbon",
  retro: "Retro",
  classic: "Classic",
  bounce: "Bounce",
};

/**
 * Frame the visualizer draws into. Videos arrive in every shape (4:3 uploads,
 * vertical phone clips, letterboxed uploads), and the visualizer inherited
 * whatever the video happened to be — so it gets its own frame by default.
 */
export const VIZ_ASPECTS = ["16:9", "4:3", "1:1", "video"] as const;

export type VizAspect = (typeof VIZ_ASPECTS)[number];

/** CSS aspect-ratio per option; "video" means don't constrain the stage. */
export const VIZ_ASPECT_CSS: Record<VizAspect, string | null> = {
  "16:9": "16 / 9",
  "4:3": "4 / 3",
  "1:1": "1 / 1",
  video: null,
};

export const VIZ_ASPECT_LABELS: Record<VizAspect, string> = {
  "16:9": "16:9",
  "4:3": "4:3",
  "1:1": "1:1",
  video: "Video",
};

export type VizSettings = {
  /** Chord name, progress arc and chord-driven colour. Off = pure audio toy. */
  chords: boolean;
  /** Song title in the corner. */
  title: boolean;
  /** Base hue (0–359) used when chords aren't driving the colour. */
  hue: number;
  /** Drift the hue continuously instead of holding it. */
  cycle: boolean;
  /** Gain on the band/level values the modes draw from. 0.4 → 1.8. */
  intensity: number;
  /** 0 = crisp, no motion trails; 1 = long smears. */
  trails: number;
  /** Shape of the frame, independent of the video's own aspect ratio. */
  aspect: VizAspect;
};

export const DEFAULT_VIZ_SETTINGS: VizSettings = {
  chords: true,
  title: true,
  hue: 264,
  cycle: false,
  intensity: 1,
  trails: 0.5,
  aspect: "16:9",
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Settings come back from localStorage untrusted — fill in whatever is missing. */
export function normalizeVizSettings(raw: unknown): VizSettings {
  const v = (raw ?? {}) as Partial<Record<keyof VizSettings, unknown>>;
  const num = (x: unknown, fallback: number, lo: number, hi: number) =>
    typeof x === "number" && Number.isFinite(x) ? clamp(x, lo, hi) : fallback;
  return {
    chords: v.chords !== false,
    title: v.title !== false,
    hue: num(v.hue, DEFAULT_VIZ_SETTINGS.hue, 0, 359),
    cycle: v.cycle === true,
    intensity: num(v.intensity, DEFAULT_VIZ_SETTINGS.intensity, 0.4, 1.8),
    trails: num(v.trails, DEFAULT_VIZ_SETTINGS.trails, 0, 1),
    aspect: VIZ_ASPECTS.includes(v.aspect as VizAspect)
      ? (v.aspect as VizAspect)
      : DEFAULT_VIZ_SETTINGS.aspect,
  };
}
