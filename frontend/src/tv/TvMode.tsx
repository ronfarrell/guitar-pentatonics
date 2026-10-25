import { useEffect, useState } from "react";
import "./tv.css";
import { api, apiErrorMessage, type ApiUser } from "../services/api";
import TvScreen from "./TvScreen";

type Props = {
  user: ApiUser;
  onExit: () => void;
};

// Survives a reload of the TV page, so a refresh rejoins the running party
// instead of stranding everyone's phones in a dead room.
const ROOM_KEY = "tv-room";
// The address phones are sent to, when the owner has corrected it by hand.
const ADDRESS_KEY = "tv-join-address";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

function readStored(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(storage: Storage, key: string, value: string | null) {
  try {
    if (value) storage.setItem(key, value);
    else storage.removeItem(key);
  } catch {
    // storage unavailable — only costs the convenience
  }
}

/**
 * The address phones should open (without the room part), plus whether the
 * server thinks they'll actually get through.
 *
 * Opened via a LAN address already? Then that's the address. Opened via
 * localhost (the Windows launcher, `npm run dev`), the page can't know its
 * own LAN address, so ask the backend — keeping this page's port, since in
 * dev the frontend and backend listen on different ones.
 */
async function detectNetwork(): Promise<{ base: string | null; warning: string | null }> {
  const here = window.location;
  try {
    const { base_url, warning } = await api.rooms.network();
    if (!LOOPBACK.has(here.hostname)) return { base: `${here.protocol}//${here.host}`, warning };
    if (!base_url) return { base: null, warning };
    const lan = new URL(base_url);
    return { base: `${here.protocol}//${lan.hostname}${here.port ? `:${here.port}` : ""}`, warning };
  } catch {
    return { base: LOOPBACK.has(here.hostname) ? null : `${here.protocol}//${here.host}`, warning: null };
  }
}

export default function TvMode({ user, onExit }: Props) {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [resumable, setResumable] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joinBase, setJoinBase] = useState<string | null>(() => readStored(localStorage, ADDRESS_KEY));
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);
  const [addressDraft, setAddressDraft] = useState("");
  const [editingAddress, setEditingAddress] = useState(false);

  // Offer to pick up a session this tab was already running.
  useEffect(() => {
    const stored = readStored(sessionStorage, ROOM_KEY);
    if (!stored) return;
    api.rooms
      .info(stored)
      .then(() => setResumable(stored))
      .catch(() => writeStored(sessionStorage, ROOM_KEY, null));
  }, []);

  // Always asked, even with an address set by hand: the warning still matters.
  useEffect(() => {
    detectNetwork().then(({ base, warning }) => {
      setNetworkWarning(warning);
      if (base) setJoinBase((current) => current ?? base);
    });
  }, []);

  // Starting is always a click: that click is what lets the browser play
  // sound afterwards, and what lets us go fullscreen.
  async function start(resumeId: string | null) {
    setBusy(true);
    setError(null);
    try {
      const id = resumeId ?? (await api.rooms.create()).room_id;
      writeStored(sessionStorage, ROOM_KEY, id);
      document.documentElement.requestFullscreen?.().catch(() => {});
      setRoomId(id);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function endSession() {
    if (roomId) {
      try {
        await api.rooms.end(roomId);
      } catch {
        // already gone
      }
    }
    writeStored(sessionStorage, ROOM_KEY, null);
    setRoomId(null);
    setResumable(null);
  }

  function exit() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    onExit();
  }

  function saveAddress() {
    const value = addressDraft.trim().replace(/\/+$/, "");
    const normalized = value && !/^https?:\/\//.test(value) ? `http://${value}` : value;
    writeStored(localStorage, ADDRESS_KEY, normalized || null);
    setJoinBase(normalized || null);
    setEditingAddress(false);
  }

  if (roomId) {
    return (
      <TvScreen
        roomId={roomId}
        joinUrl={joinBase ? `${joinBase}/?join=${roomId}` : null}
        onEnd={endSession}
        onExit={exit}
      />
    );
  }

  return (
    <div className="tv-root tv-start">
      <div className="tv-start-card">
        <h1 className="app-title">TV mode</h1>
        <p className="tv-start-lead">
          This screen becomes the player. Everyone on the same Wi-Fi scans the code to join from their
          phone, queue songs from their own library, and run the show.
        </p>
        <p className="tv-start-owner">Hosting as {user.display_name}</p>

        <div className="tv-start-actions">
          {resumable && (
            <button className="settings-save-btn tv-big-btn" onClick={() => start(resumable)} disabled={busy}>
              Resume session
            </button>
          )}
          <button
            className={`${resumable ? "settings-cancel-btn" : "settings-save-btn"} tv-big-btn`}
            onClick={() => start(null)}
            disabled={busy}
          >
            {resumable ? "Start a new session" : "Start session"}
          </button>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <div className="tv-address">
          <span>Phones will connect to</span>
          {editingAddress ? (
            <form
              className="tv-address-edit"
              onSubmit={(e) => {
                e.preventDefault();
                saveAddress();
              }}
            >
              <input
                className="auth-input"
                value={addressDraft}
                onChange={(e) => setAddressDraft(e.target.value)}
                placeholder="http://192.168.1.20:8010"
                autoFocus
              />
              <button className="settings-save-btn" type="submit">
                Save
              </button>
            </form>
          ) : (
            <>
              <code>{joinBase ?? "unknown — set it by hand"}</code>
              <button
                className="tv-link-btn"
                onClick={() => {
                  setAddressDraft(joinBase ?? "");
                  setEditingAddress(true);
                }}
              >
                Change
              </button>
            </>
          )}
        </div>

        {networkWarning === "wsl-nat" && (
          <div className="tv-net-warning">
            <strong>Phones can't reach this PC yet.</strong> The app runs inside WSL, which by default
            only accepts connections from this computer. Run{" "}
            <code>windows\enable-phone-access.ps1</code> once as Administrator, then{" "}
            <code>wsl --shutdown</code> and start the app again.
          </div>
        )}

        <button className="tv-link-btn tv-start-exit" onClick={exit}>
          ← Back to the app
        </button>
      </div>
    </div>
  );
}
