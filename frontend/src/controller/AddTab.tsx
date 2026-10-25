import { useEffect, useMemo, useRef, useState } from "react";
import { api, type ApiPlaylist } from "../services/api";
import { savedSongsService, type SavedSong } from "../services/savedSongsService";

type Props = {
  isGuest: boolean;
  send: (message: Record<string, unknown>) => void;
  onSignIn: () => void;
};

type View = "songs" | "playlists";

export default function AddTab({ isGuest, send, onSignIn }: Props) {
  const [songs, setSongs] = useState<SavedSong[] | null>(null);
  const [playlists, setPlaylists] = useState<ApiPlaylist[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("songs");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isGuest) return;
    Promise.all([savedSongsService.getAll(), api.playlists.list()])
      .then(([library, { playlists }]) => {
        setSongs(library);
        setPlaylists(playlists.filter((p) => p.song_ids.length > 0));
      })
      .catch(() => setError("Couldn't load your library."));
  }, [isGuest]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!songs) return [];
    return q ? songs.filter((s) => s.title.toLowerCase().includes(q)) : songs;
  }, [songs, query]);

  const flash = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };

  const queue = (songIds: number[], next: boolean, label: string) => {
    send({ type: "queue_add", song_ids: songIds, next });
    flash(next ? `${label} plays next` : `Queued ${label}`);
  };

  if (isGuest) {
    return (
      <section className="ctl-card">
        <span className="ctl-eyebrow">Guests can't queue songs</span>
        <p className="ctl-muted">
          Songs come from your own library. Sign in to add yours — as a guest you can still run playback
          and the TV display.
        </p>
        <button className="settings-save-btn" onClick={onSignIn}>
          Sign in instead
        </button>
      </section>
    );
  }

  return (
    <div className="ctl-add">
      <div className="auth-tabs">
        {(["songs", "playlists"] as const).map((v) => (
          <button
            key={v}
            className={`auth-tab${view === v ? " auth-tab--active" : ""}`}
            onClick={() => setView(v)}
          >
            {v === "songs" ? `Songs${songs ? ` · ${songs.length}` : ""}` : `Playlists · ${playlists.length}`}
          </button>
        ))}
      </div>

      {error && <div className="auth-error">{error}</div>}

      {view === "songs" ? (
        <>
          <input
            className="auth-input"
            placeholder="Search your songs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
          />
          {songs === null && !error ? (
            <p className="ctl-muted">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="ctl-muted">
              {songs?.length ? "No matches." : "Your library is empty — analyze songs in the app first."}
            </p>
          ) : (
            <ul className="ctl-list">
              {filtered.map((song) => (
                <li key={song.id}>
                  <div className="ctl-queue-text">
                    <span className="ctl-queue-title">{song.title}</span>
                    <span className="ctl-muted">{song.key}</span>
                  </div>
                  <div className="ctl-queue-actions">
                    <button onClick={() => queue([Number(song.id)], true, song.title)} title="Play next">
                      Next
                    </button>
                    <button
                      className="ctl-primary"
                      onClick={() => queue([Number(song.id)], false, song.title)}
                      aria-label={`Queue ${song.title}`}
                    >
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : playlists.length === 0 ? (
        <p className="ctl-muted">No playlists with songs in them yet.</p>
      ) : (
        <ul className="ctl-list">
          {playlists.map((p) => (
            <li key={p.id}>
              <div className="ctl-queue-text">
                <span className="ctl-queue-title">{p.name}</span>
                <span className="ctl-muted">
                  {p.song_ids.length} song{p.song_ids.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="ctl-queue-actions">
                <button className="ctl-primary ctl-wide" onClick={() => queue(p.song_ids, false, p.name)}>
                  Queue all
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {toast && <div className="ctl-toast">{toast}</div>}
    </div>
  );
}
