import { useState, type ReactNode } from "react";
import { api, apiErrorMessage, type AuthResponse } from "../services/api";

type Props = {
  onSignedIn: (auth: AuthResponse) => void;
  notice?: string | null;
  /** Replaces the app name, e.g. "Join Alice's TV". */
  heading?: string;
  /** Replaces the one-line explanation under the heading. */
  blurb?: string;
  /** Rendered under the form — the join page puts its guest option here. */
  footer?: ReactNode;
};

type Mode = "login" | "register";

export default function LoginPage({ onSignedIn, notice, heading, blurb, footer }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const auth =
        mode === "login"
          ? await api.auth.login(username.trim(), password)
          : await api.auth.register(username.trim(), password, displayName.trim());
      onSignedIn(auth);
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="app-title auth-title">{heading ?? "Pentatonic Guitar Explorer"}</h1>
        <p className="settings-hint">
          {blurb ??
            (mode === "login"
              ? "Sign in to get to your songs and playlists."
              : "Create an account — your songs and playlists are your own.")}
        </p>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            className={`auth-tab${mode === "login" ? " auth-tab--active" : ""}`}
            onClick={() => switchMode("login")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "register"}
            className={`auth-tab${mode === "register" ? " auth-tab--active" : ""}`}
            onClick={() => switchMode("register")}
          >
            Create account
          </button>
        </div>

        {notice && !error && <div className="auth-notice">{notice}</div>}

        <label className="auth-field">
          <span>Username</span>
          <input
            className="auth-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>

        {mode === "register" && (
          <label className="auth-field">
            <span>Display name <em>(optional)</em></span>
            <input
              className="auth-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="nickname"
              maxLength={60}
            />
          </label>
        )}

        <label className="auth-field">
          <span>Password</span>
          <input
            className="auth-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </label>

        {error && <div className="auth-error">{error}</div>}

        <button className="settings-save-btn auth-submit" type="submit" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
        </button>

        {footer}
      </form>
    </div>
  );
}
