// The signed-in session's bearer token. Lives in localStorage so a refresh
// stays signed in; every API call reads it from here.

const TOKEN_KEY = "auth-token";

let unauthorizedListener: (() => void) | null = null;

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable — the session just won't survive a refresh
  }
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Registered by the auth gate: called when the server rejects our token. */
export function onUnauthorized(listener: (() => void) | null) {
  unauthorizedListener = listener;
}

export function notifyUnauthorized() {
  unauthorizedListener?.();
}
