import { useEffect, useState } from "react";
import "../App.css";
import "./controller.css";
import LoginPage from "../components/LoginPage";
import { api, APIError, type ApiUser } from "../services/api";
import { getToken, setToken } from "../services/authToken";
import { applyThemeSettings, loadThemeSettings } from "../theme/themeSettings";
import { useRoom } from "../hooks/useRoom";
import NowTab from "./NowTab";
import AddTab from "./AddTab";
import DisplayTab from "./DisplayTab";

type Props = { roomId: string };

type Identity = { kind: "user"; user: ApiUser; token: string } | { kind: "guest"; name: string };

type Tab = "now" | "add" | "display";

const GUEST_NAME_KEY = "guest-name";

function storedGuestName(): string {
  try {
    return localStorage.getItem(GUEST_NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * The phone side of TV mode, opened from the TV's QR code (`/?join=<room>`).
 * It never plays anything itself — it's a remote for the room.
 */
export default function ControllerApp({ roomId }: Props) {
  const [owner, setOwner] = useState<string | null>(null);
  const [roomMissing, setRoomMissing] = useState(false);
  // Separate from "missing": a server we can't reach says nothing about the room.
  const [unreachable, setUnreachable] = useState(false);
  const [infoAttempt, setInfoAttempt] = useState(0);
  // A signed-in account from an earlier visit, offered as a one-tap join.
  const [knownUser, setKnownUser] = useState<ApiUser | null>(null);
  const [checkingUser, setCheckingUser] = useState(() => !!getToken());
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [guestName, setGuestName] = useState(storedGuestName);
  const [tab, setTab] = useState<Tab>("now");

  useEffect(() => {
    applyThemeSettings(loadThemeSettings());
  }, []);

  useEffect(() => {
    api.rooms
      .info(roomId)
      .then((info) => {
        setOwner(info.owner);
        setUnreachable(false);
      })
      .catch((err) => {
        if (err instanceof APIError && err.status === 404) setRoomMissing(true);
        else setUnreachable(true);
      });
  }, [roomId, infoAttempt]);

  useEffect(() => {
    if (!getToken()) return;
    api.auth
      .me()
      .then(setKnownUser)
      .catch((err) => {
        if (err instanceof APIError && err.status === 401) setToken(null);
      })
      .finally(() => setCheckingUser(false));
  }, []);

  if (roomMissing) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="app-title auth-title">Session not found</h1>
          <p className="settings-hint">This TV session has ended. Scan the code on the TV again.</p>
        </div>
      </div>
    );
  }

  if (unreachable) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="app-title auth-title">Can't reach the TV</h1>
          <p className="settings-hint">
            This phone couldn't connect to the app's server at {window.location.hostname}. Make sure you're
            on the same Wi-Fi as the TV. If you are, the PC running the app may need its network access
            turned on — the TV's start screen says how.
          </p>
          <button className="settings-save-btn auth-submit" onClick={() => setInfoAttempt((n) => n + 1)}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!identity) {
    if (checkingUser) return null;

    const joinAsGuest = () => {
      const name = guestName.trim();
      if (!name) return;
      try {
        localStorage.setItem(GUEST_NAME_KEY, name);
      } catch {
        // fine — just won't be prefilled next time
      }
      setIdentity({ kind: "guest", name });
    };

    if (knownUser) {
      return (
        <div className="auth-page">
          <div className="auth-card">
            <h1 className="app-title auth-title">{owner ? `Join ${owner}'s TV` : "Join the TV"}</h1>
            <p className="settings-hint">You're signed in — your library comes with you.</p>
            <button
              className="settings-save-btn auth-submit"
              onClick={() => setIdentity({ kind: "user", user: knownUser, token: getToken()! })}
            >
              Join as {knownUser.display_name}
            </button>
            <button
              className="settings-cancel-btn"
              onClick={() => {
                setToken(null);
                setKnownUser(null);
              }}
            >
              Use a different account
            </button>
          </div>
        </div>
      );
    }

    return (
      <LoginPage
        heading={owner ? `Join ${owner}'s TV` : "Join the TV"}
        blurb="Sign in to queue songs from your library — or join as a guest to help run the show."
        onSignedIn={({ token, user }) => {
          setToken(token);
          setIdentity({ kind: "user", user, token });
        }}
        footer={
          <div className="ctl-guest">
            <span className="ctl-or">or</span>
            <div className="account-row">
              <input
                className="auth-input"
                placeholder="Your name"
                value={guestName}
                maxLength={40}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    joinAsGuest();
                  }
                }}
                aria-label="Guest name"
              />
              <button
                type="button"
                className="settings-cancel-btn"
                onClick={joinAsGuest}
                disabled={!guestName.trim()}
              >
                Join as guest
              </button>
            </div>
          </div>
        }
      />
    );
  }

  return (
    <ControllerSession
      roomId={roomId}
      identity={identity}
      tab={tab}
      setTab={setTab}
      onLeave={() => setIdentity(null)}
    />
  );
}

function ControllerSession({
  roomId,
  identity,
  tab,
  setTab,
  onLeave,
}: {
  roomId: string;
  identity: Identity;
  tab: Tab;
  setTab: (tab: Tab) => void;
  onLeave: () => void;
}) {
  const hello =
    identity.kind === "user"
      ? ({ role: "controller", token: identity.token } as const)
      : ({ role: "controller", guest_name: identity.name } as const);
  const room = useRoom(roomId, hello);
  const { state, status } = room;

  if (status === "closed") {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="app-title auth-title">Disconnected</h1>
          <p className="settings-hint">{room.closedReason}</p>
          <button className="settings-cancel-btn" onClick={onLeave}>
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ctl">
      <header className="ctl-header">
        <div className="ctl-header-text">
          <strong>{state ? `${state.owner}'s TV` : "Connecting…"}</strong>
          <span>
            {identity.kind === "user" ? identity.user.display_name : `${identity.name} (guest)`}
            {state && ` · ${state.members.length} here`}
            {state && !state.tv_connected && " · TV offline"}
            {status === "reconnecting" && " · reconnecting…"}
          </span>
        </div>
        <button className="ctl-leave" onClick={onLeave}>
          Leave
        </button>
      </header>

      <main className="ctl-body">
        {!state ? (
          <p className="ctl-empty">Connecting to the TV…</p>
        ) : tab === "now" ? (
          <NowTab state={state} playback={room.playback} send={room.send} onAddSongs={() => setTab("add")} />
        ) : tab === "add" ? (
          <AddTab isGuest={identity.kind === "guest"} send={room.send} onSignIn={onLeave} />
        ) : (
          <DisplayTab display={state.display} send={room.send} />
        )}
      </main>

      <nav className="ctl-tabs">
        {(
          [
            ["now", "Now playing", "♪"],
            ["add", "Add songs", "+"],
            ["display", "TV display", "▣"],
          ] as const
        ).map(([id, label, icon]) => (
          <button
            key={id}
            className={`ctl-tab${tab === id ? " ctl-tab--on" : ""}`}
            onClick={() => setTab(id)}
          >
            <span className="ctl-tab-icon" aria-hidden>
              {icon}
            </span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
