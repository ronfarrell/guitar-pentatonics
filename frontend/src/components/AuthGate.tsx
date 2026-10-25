import { useCallback, useEffect, useState } from "react";
import "../App.css";
import App from "../App";
import LoginPage from "./LoginPage";
import TvMode from "../tv/TvMode";
import { api, APIError, type ApiUser, type AuthResponse } from "../services/api";
import { getToken, onUnauthorized, setToken } from "../services/authToken";
import { setSessionScope } from "../services/sessionStore";
import { applyThemeSettings, loadThemeSettings } from "../theme/themeSettings";

type State =
  | { status: "checking" }
  | { status: "signed-out"; notice: string | null }
  | { status: "signed-in"; user: ApiUser };

// In the URL so a reload of the TV comes back up as the TV.
const TV_PARAM = "tv";

function urlWantsTv(): boolean {
  return new URLSearchParams(window.location.search).has(TV_PARAM);
}

function setTvInUrl(on: boolean) {
  const url = new URL(window.location.href);
  if (on) url.searchParams.set(TV_PARAM, "1");
  else url.searchParams.delete(TV_PARAM);
  window.history.replaceState(null, "", url);
}

/**
 * Decides between the sign-in screen and the app. The app is keyed by user
 * id, so switching accounts remounts it with nothing left over from the last
 * person — player, queue, library, playlists all start fresh.
 */
export default function AuthGate() {
  const [state, setState] = useState<State>(() =>
    getToken() ? { status: "checking" } : { status: "signed-out", notice: null },
  );

  const [tvMode, setTvMode] = useState(urlWantsTv);

  const toggleTv = useCallback((on: boolean) => {
    setTvInUrl(on);
    setTvMode(on);
  }, []);

  const signOut = useCallback((notice: string | null = null) => {
    setToken(null);
    setState({ status: "signed-out", notice });
  }, []);

  const signIn = useCallback((user: ApiUser) => {
    // Must happen before App mounts: it restores the session on first render.
    setSessionScope(String(user.id));
    setState({ status: "signed-in", user });
  }, []);

  // The login page renders before App, which normally applies the theme.
  useEffect(() => {
    applyThemeSettings(loadThemeSettings());
  }, []);

  useEffect(() => {
    onUnauthorized(() => signOut("Your session expired — please sign in again."));
    return () => onUnauthorized(null);
  }, [signOut]);

  useEffect(() => {
    if (state.status !== "checking") return;
    api.auth
      .me()
      .then(signIn)
      .catch((err) => {
        if (err instanceof APIError && err.status === 0) {
          signOut("Can't reach the server.");
        } else {
          signOut();
        }
      });
  }, [state.status, signIn, signOut]);

  if (state.status === "checking") return null;

  if (state.status === "signed-out") {
    return (
      <LoginPage
        notice={state.notice}
        onSignedIn={({ token, user }: AuthResponse) => {
          setToken(token);
          signIn(user);
        }}
      />
    );
  }

  if (tvMode) {
    return <TvMode user={state.user} onExit={() => toggleTv(false)} />;
  }

  return (
    <App
      key={state.user.id}
      onEnterTv={() => toggleTv(true)}
      user={state.user}
      onUserChange={(user) => setState({ status: "signed-in", user })}
      onLogout={async () => {
        try {
          await api.auth.logout();
        } catch {
          // already invalid server-side — signing out locally is what matters
        }
        signOut();
      }}
    />
  );
}
