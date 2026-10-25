import { useEffect, useRef, useState } from "react";
import type { RoomState } from "../services/api";
import { livePosition, type LivePlayback } from "../hooks/useRoom";

type Props = {
  state: RoomState;
  playback: LivePlayback | null;
  send: (message: Record<string, unknown>) => void;
  onAddSongs: () => void;
};

// Inline icons rather than ⏮/⏸ emoji: those render differently on every
// phone, and not at all on some.
const ICONS = {
  prev: "M6 5h2v14H6zM20 5v14L9 12z",
  next: "M16 5h2v14h-2zM4 5v14l11-7z",
  play: "M7 4.5v15L19.5 12z",
  pause: "M6 5h4v14H6zM14 5h4v14h-4z",
  volLow: "M4 9v6h4l5 4V5L8 9z",
  volHigh: "M4 9v6h4l5 4V5L8 9zm11.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM13 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z",
};

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d={d} />
  </svg>
);

const VOLUME_SEND_MS = 80;
const VOLUME_SETTLE_MS = 1500;

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function NowTab({ state, playback, send, onAddSongs }: Props) {
  const now = state.now_playing;
  const [tick, setTick] = useState(() => Date.now());
  // While dragging, the slider shows the finger, not the (lagging) TV.
  const [scrub, setScrub] = useState<number | null>(null);
  const [volumeDraft, setVolumeDraft] = useState<number | null>(null);
  const volumeSentAt = useRef(0);
  const volumeTrailing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeRelease = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!playback?.playing) return;
    const id = setInterval(() => setTick(Date.now()), 500);
    return () => clearInterval(id);
  }, [playback?.playing]);

  const position = scrub ?? livePosition(playback, tick);
  const duration = playback?.duration ?? 0;
  const volume = volumeDraft ?? playback?.volume ?? 1;

  const transport = (action: string, value?: number) => send({ type: "transport", action, value });

  // Slider drags fire per pixel. Throttle rather than debounce, so the TV
  // follows the finger while it moves, and always send the final level.
  const changeVolume = (level: number) => {
    setVolumeDraft(level);

    if (volumeTrailing.current) clearTimeout(volumeTrailing.current);
    const wait = VOLUME_SEND_MS - (Date.now() - volumeSentAt.current);
    const sendNow = () => {
      volumeSentAt.current = Date.now();
      transport("volume", level);
    };
    if (wait <= 0) sendNow();
    else volumeTrailing.current = setTimeout(sendNow, wait);

    // Keep showing the finger's level until the TV has had time to report it
    // back. Letting go sooner snaps the slider to a stale report — or to an
    // in-between level still on its way back — and then jumps again.
    if (volumeRelease.current) clearTimeout(volumeRelease.current);
    volumeRelease.current = setTimeout(() => setVolumeDraft(null), VOLUME_SETTLE_MS);
  };

  useEffect(
    () => () => {
      if (volumeTrailing.current) clearTimeout(volumeTrailing.current);
      if (volumeRelease.current) clearTimeout(volumeRelease.current);
    },
    [],
  );

  const move = (uid: string, to: number) => send({ type: "queue_move", uid, to });

  return (
    <div className="ctl-now">
      <section className="ctl-card ctl-now-card">
        {now ? (
          <>
            <span className="ctl-eyebrow">Now playing</span>
            <h2 className="ctl-now-title">{now.title}</h2>
            <p className="ctl-muted">
              {now.key} · added by {now.added_by}
            </p>

            <div className="ctl-seek">
              <span>{formatTime(position)}</span>
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={1}
                value={Math.min(position, duration || 1)}
                onChange={(e) => setScrub(Number(e.target.value))}
                onPointerUp={() => {
                  if (scrub !== null) transport("seek", scrub);
                  setScrub(null);
                }}
                onKeyUp={() => {
                  if (scrub !== null) transport("seek", scrub);
                  setScrub(null);
                }}
                aria-label="Seek"
              />
              <span>{formatTime(duration)}</span>
            </div>
          </>
        ) : (
          <>
            <span className="ctl-eyebrow">Nothing playing</span>
            <p className="ctl-muted">Queue a song and the TV starts right away.</p>
            <button className="settings-save-btn" onClick={onAddSongs}>
              Add songs
            </button>
          </>
        )}

        <div className="ctl-transport">
          <button onClick={() => transport("prev")} disabled={!now} aria-label="Previous">
            <Icon d={ICONS.prev} />
          </button>
          <button
            className="ctl-play"
            onClick={() => transport("toggle")}
            disabled={!now}
            aria-label={playback?.playing ? "Pause" : "Play"}
          >
            <Icon d={playback?.playing ? ICONS.pause : ICONS.play} />
          </button>
          <button onClick={() => transport("next")} disabled={!now} aria-label="Next">
            <Icon d={ICONS.next} />
          </button>
        </div>

        <label className="ctl-volume">
          <Icon d={ICONS.volLow} />
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={volume}
            onChange={(e) => changeVolume(Number(e.target.value))}
            aria-label="TV volume"
          />
          <Icon d={ICONS.volHigh} />
        </label>
      </section>

      <section className="ctl-card">
        <div className="ctl-row-between">
          <span className="ctl-eyebrow">Up next · {state.queue.length}</span>
          {state.queue.length > 0 && (
            <button className="ctl-link" onClick={() => send({ type: "queue_clear" })}>
              Clear
            </button>
          )}
        </div>
        {state.queue.length === 0 ? (
          <p className="ctl-muted">The queue is empty.</p>
        ) : (
          <ol className="ctl-queue">
            {state.queue.map((entry, i) => (
              <li key={entry.uid}>
                <div className="ctl-queue-text">
                  <span className="ctl-queue-title">{entry.title}</span>
                  <span className="ctl-muted">{entry.added_by}</span>
                </div>
                <div className="ctl-queue-actions">
                  <button onClick={() => move(entry.uid, i - 1)} disabled={i === 0} aria-label="Move up">
                    ↑
                  </button>
                  <button
                    onClick={() => move(entry.uid, i + 1)}
                    disabled={i === state.queue.length - 1}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button onClick={() => send({ type: "queue_remove", uid: entry.uid })} aria-label="Remove">
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
