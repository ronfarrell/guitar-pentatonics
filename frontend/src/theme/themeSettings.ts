export type ThemeMode = "dark" | "light";

export type ThemeSettings = {
  mode: ThemeMode;
  accent: string; // accent preset id
};

export type AccentPreset = {
  id: string;
  label: string;
  // hand-picked per mode so soft tints stay readable in both themes
  light: { accent: string; soft: string };
  dark: { accent: string; soft: string };
};

export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: "violet",
    label: "Violet",
    light: { accent: "#6355e8", soft: "#eeecff" },
    dark: { accent: "#8b7ff7", soft: "#1d1a3e" },
  },
  {
    id: "blue",
    label: "Blue",
    light: { accent: "#2563eb", soft: "#e8efff" },
    dark: { accent: "#60a5fa", soft: "#132b4d" },
  },
  {
    id: "green",
    label: "Green",
    light: { accent: "#059669", soft: "#e4f6ee" },
    dark: { accent: "#34d399", soft: "#0e2f23" },
  },
  {
    id: "amber",
    label: "Amber",
    light: { accent: "#d97706", soft: "#fcf0dd" },
    dark: { accent: "#fbbf24", soft: "#332507" },
  },
  {
    id: "rose",
    label: "Rose",
    light: { accent: "#e11d48", soft: "#fde7ec" },
    dark: { accent: "#fb7185", soft: "#3a141d" },
  },
];

export const DEFAULT_THEME_SETTINGS: ThemeSettings = { mode: "dark", accent: "violet" };

const STORAGE_KEY = "themeSettings";

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function loadThemeSettings(): ThemeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        mode: parsed.mode === "light" ? "light" : "dark",
        accent: ACCENT_PRESETS.some((p) => p.id === parsed.accent)
          ? parsed.accent
          : DEFAULT_THEME_SETTINGS.accent,
      };
    }
  } catch {
    /* fall through to legacy/default */
  }
  // migrate from the old standalone "theme" key
  const legacy = localStorage.getItem("theme");
  return {
    ...DEFAULT_THEME_SETTINGS,
    mode: legacy === "light" ? "light" : "dark",
  };
}

export function saveThemeSettings(settings: ThemeSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  // keep the legacy key in sync in case anything else still reads it
  localStorage.setItem("theme", settings.mode);
}

/** Apply mode + accent to the document (does not persist). */
export function applyThemeSettings(settings: ThemeSettings) {
  const root = document.documentElement;
  root.dataset.theme = settings.mode;

  const preset =
    ACCENT_PRESETS.find((p) => p.id === settings.accent) ?? ACCENT_PRESETS[0];
  const colors = settings.mode === "light" ? preset.light : preset.dark;
  root.style.setProperty("--accent", colors.accent);
  root.style.setProperty("--accent-soft", colors.soft);
  root.style.setProperty(
    "--accent-border",
    hexToRgba(colors.accent, settings.mode === "light" ? 0.22 : 0.32),
  );
}
