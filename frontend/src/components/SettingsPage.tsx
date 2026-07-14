import { useEffect, useState } from "react";
import {
  ACCENT_PRESETS,
  applyThemeSettings,
  type ThemeMode,
  type ThemeSettings,
} from "../theme/themeSettings";

type Props = {
  saved: ThemeSettings;
  onSave: (settings: ThemeSettings) => void;
  onClose: () => void;
};

const MODE_PREVIEWS: Record<ThemeMode, { page: string; surface: string; text: string }> = {
  light: { page: "#f1f1f7", surface: "#ffffff", text: "#0c0d14" },
  dark: { page: "#0c0d13", surface: "#13141e", text: "#e2e4f0" },
};

export default function SettingsPage({ saved, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<ThemeSettings>(saved);

  // Live-preview the draft; cancel restores the saved settings
  function update(patch: Partial<ThemeSettings>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    applyThemeSettings(next);
  }

  function cancel() {
    applyThemeSettings(saved);
    onClose();
  }

  function save() {
    onSave(draft);
    onClose();
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const dirty = draft.mode !== saved.mode || draft.accent !== saved.accent;

  return (
    <div className="settings-page">
      <div className="settings-container">
        <header className="settings-header">
          <button className="settings-back" onClick={cancel} aria-label="Close settings" title="Close (Esc)">
            ←
          </button>
          <h2>Settings</h2>
        </header>

        <section className="settings-section">
          <h3>Appearance</h3>
          <p className="settings-hint">Theme for the whole app.</p>
          <div className="mode-cards">
            {(["light", "dark"] as ThemeMode[]).map((mode) => {
              const preview = MODE_PREVIEWS[mode];
              const accent =
                ACCENT_PRESETS.find((p) => p.id === draft.accent)?.[mode].accent;
              return (
                <button
                  key={mode}
                  className={`mode-card${draft.mode === mode ? " mode-card--selected" : ""}`}
                  onClick={() => update({ mode })}
                >
                  <span className="mode-card-preview" style={{ background: preview.page }}>
                    <span className="mode-card-surface" style={{ background: preview.surface }}>
                      <span className="mode-card-dot" style={{ background: accent }} />
                      <span className="mode-card-line" style={{ background: preview.text, opacity: 0.55 }} />
                      <span className="mode-card-line mode-card-line--short" style={{ background: preview.text, opacity: 0.3 }} />
                    </span>
                  </span>
                  <span className="mode-card-label">{mode === "light" ? "Light" : "Dark"}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="settings-section">
          <h3>Accent color</h3>
          <p className="settings-hint">Used for highlights, buttons, and the fretboard UI.</p>
          <div className="accent-swatches">
            {ACCENT_PRESETS.map((preset) => {
              const color = preset[draft.mode].accent;
              return (
                <button
                  key={preset.id}
                  className={`accent-swatch${draft.accent === preset.id ? " accent-swatch--selected" : ""}`}
                  onClick={() => update({ accent: preset.id })}
                  title={preset.label}
                  aria-label={`${preset.label} accent`}
                >
                  <span className="accent-swatch-dot" style={{ background: color }} />
                  <span className="accent-swatch-label">{preset.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <footer className="settings-footer">
          <button className="settings-cancel-btn" onClick={cancel}>
            Cancel
          </button>
          <button className="settings-save-btn" onClick={save} disabled={!dirty}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
