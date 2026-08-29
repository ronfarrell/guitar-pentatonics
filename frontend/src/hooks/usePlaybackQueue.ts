import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { SavedSong } from "../services/savedSongsService";
import type { Playlist } from "./usePlaylistStore";
import { loadQueueSession, saveQueueSession } from "../services/sessionStore";

/**
 * Playback ordering, in two layers — the same split Spotify uses:
 *
 *  - `context`: a playlist being played through, with a cursor.
 *  - `userQueue`: songs explicitly lined up. These always play first, and each
 *    one is consumed as it starts. When the queue drains, playback resumes
 *    from wherever the context cursor was left.
 */

export type PlaybackContext = {
  playlistId: string;
  playlistName: string;
  songIds: string[];
  index: number;
};

/** A queued entry; `uid` keeps duplicates of the same song addressable. */
export type QueueEntry = {
  uid: string;
  songId: string;
};

type Options = {
  songs: SavedSong[];
  videoRef: RefObject<HTMLVideoElement | null>;
  videoSrc: string | null;
  loadedUrl: string | null;
  loadCached: (url: string) => void;
  /** Repeat-one wins over advancing. */
  repeat: boolean;
  onLoadSong?: (song: SavedSong) => void;
};

// Not a counter: uids now outlive the page that minted them, so a fresh
// counter starting from zero on the next load would hand out ids that collide
// with the restored queue's — and removeQueued would drop the wrong row.
const nextUid = () =>
  `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function usePlaybackQueue({
  songs,
  videoRef,
  videoSrc,
  loadedUrl,
  loadCached,
  repeat,
  onLoadSong,
}: Options) {
  // Restored from the last session so a refresh doesn't lose the playlist you
  // were part way through, or what you'd lined up behind it.
  const restored = useMemo(() => loadQueueSession(), []);

  const [context, setContext] = useState<PlaybackContext | null>(
    restored?.context ?? null,
  );
  const [userQueue, setUserQueue] = useState<QueueEntry[]>(restored?.queue ?? []);
  // Set when a queued song is what's currently playing, so the UI can say so
  // without the context cursor having moved.
  const [playingFromQueue, setPlayingFromQueue] = useState(false);

  // Set when we start a song ourselves, so it plays without a second click.
  const autoplayRef = useRef(false);
  // Bumped on every explicit load. Re-selecting the song that is already
  // loaded leaves videoSrc/loadedUrl unchanged, so this is what tells the
  // autoplay effect to restart it rather than silently do nothing.
  const [loadToken, setLoadToken] = useState(0);

  // Songs can be deleted while queued; treat the library as the source of
  // truth and derive the live view rather than storing pruned copies.
  const liveContext = useMemo(() => {
    if (!context) return null;
    const songIds = context.songIds.filter((id) => songs.some((s) => s.id === id));
    if (songIds.length === 0) return null;
    const currentId = context.songIds[context.index];
    const index = songIds.indexOf(currentId);
    return { ...context, songIds, index: index === -1 ? 0 : index };
  }, [context, songs]);

  const liveQueue = useMemo(
    () => userQueue.filter((entry) => songs.some((s) => s.id === entry.songId)),
    [userQueue, songs],
  );

  const upNext = useMemo(
    () =>
      liveQueue
        .map((entry) => {
          const song = songs.find((s) => s.id === entry.songId);
          return song ? { uid: entry.uid, song } : null;
        })
        .filter(Boolean) as { uid: string; song: SavedSong }[],
    [liveQueue, songs],
  );

  const loadSong = useCallback(
    (song: SavedSong) => {
      if (!song.youtubeUrl) return false;
      autoplayRef.current = true;
      setLoadToken((t) => t + 1);
      loadCached(song.youtubeUrl);
      onLoadSong?.(song);
      return true;
    },
    [loadCached, onLoadSong],
  );

  const findSong = useCallback(
    (songId: string) => songs.find((s) => s.id === songId),
    [songs],
  );

  /** Start a playlist, optionally at a specific song. */
  const playPlaylist = useCallback(
    (playlist: Playlist, startSongId?: string) => {
      const songIds = playlist.songIds.filter((id) => songs.some((s) => s.id === id));
      if (songIds.length === 0) return;

      const at = startSongId ? songIds.indexOf(startSongId) : 0;
      const index = at === -1 ? 0 : at;
      const song = findSong(songIds[index]);
      if (!song) return;

      setContext({
        playlistId: playlist.id,
        playlistName: playlist.name,
        songIds,
        index,
      });
      setPlayingFromQueue(false);
      loadSong(song);
    },
    [songs, findSong, loadSong],
  );

  /** Play a single song now, dropping any playlist context but keeping the queue. */
  const playSong = useCallback(
    (song: SavedSong, autoplay = true) => {
      setContext(null);
      setPlayingFromQueue(false);
      if (autoplay) {
        loadSong(song);
      } else if (song.youtubeUrl) {
        loadCached(song.youtubeUrl);
        onLoadSong?.(song);
      }
    },
    [loadSong, loadCached, onLoadSong],
  );

  const enqueue = useCallback((songId: string) => {
    setUserQueue((prev) => [...prev, { uid: nextUid(), songId }]);
  }, []);

  /** Jump a song to the front of the queue. */
  const playNextUp = useCallback((songId: string) => {
    setUserQueue((prev) => [{ uid: nextUid(), songId }, ...prev]);
  }, []);

  const removeQueued = useCallback((uid: string) => {
    setUserQueue((prev) => prev.filter((entry) => entry.uid !== uid));
  }, []);

  const clearQueue = useCallback(() => setUserQueue([]), []);

  const hasNext = liveQueue.length > 0 || (!!liveContext && liveContext.index < liveContext.songIds.length - 1);
  const hasPrev = !!liveContext && liveContext.index > 0;

  const playNext = useCallback(() => {
    // Explicitly queued songs always win.
    const head = liveQueue[0];
    if (head) {
      const song = findSong(head.songId);
      setUserQueue((prev) => prev.filter((entry) => entry.uid !== head.uid));
      if (song && loadSong(song)) {
        setPlayingFromQueue(true);
        return true;
      }
    }

    if (!liveContext || liveContext.index >= liveContext.songIds.length - 1) return false;

    const index = liveContext.index + 1;
    const song = findSong(liveContext.songIds[index]);
    if (!song) return false;

    setContext({ ...liveContext, index });
    setPlayingFromQueue(false);
    return loadSong(song);
  }, [liveQueue, liveContext, findSong, loadSong]);

  const playPrev = useCallback(() => {
    if (!liveContext || liveContext.index <= 0) return false;

    const index = liveContext.index - 1;
    const song = findSong(liveContext.songIds[index]);
    if (!song) return false;

    setContext({ ...liveContext, index });
    setPlayingFromQueue(false);
    return loadSong(song);
  }, [liveContext, findSong, loadSong]);

  const stopContext = useCallback(() => {
    setContext(null);
    setPlayingFromQueue(false);
  }, []);

  // Persist the raw state, not the library-filtered view: saved songs load
  // asynchronously, so on the first render everything looks deleted and
  // saving the live view would wipe the queue we just restored.
  useEffect(() => {
    saveQueueSession({ context, queue: userQueue });
  }, [context, userQueue]);

  // Advance when the current track finishes.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    const onEnded = () => {
      if (repeat) return; // useMediaControls restarts the track instead
      playNext();
    };

    video.addEventListener("ended", onEnded);
    return () => video.removeEventListener("ended", onEnded);
  }, [videoSrc, repeat, playNext, videoRef]);

  // Start playback once the song we asked for has actually loaded.
  useEffect(() => {
    if (!autoplayRef.current) return;
    const video = videoRef.current;
    if (!video || !videoSrc || !loadedUrl) return;

    autoplayRef.current = false;

    const start = () => {
      video.currentTime = 0;
      // Autoplay can still be refused without a prior user gesture; ignore it.
      video.play().catch(() => {});
    };

    if (video.readyState >= 1) {
      start();
      return;
    }

    video.addEventListener("loadedmetadata", start, { once: true });
    return () => video.removeEventListener("loadedmetadata", start);
  }, [videoSrc, loadedUrl, loadToken, videoRef]);

  const nowPlaying = liveContext
    ? {
        playlistId: liveContext.playlistId,
        name: liveContext.playlistName,
        position: liveContext.index + 1,
        total: liveContext.songIds.length,
        songId: playingFromQueue ? null : liveContext.songIds[liveContext.index],
      }
    : null;

  return {
    context: liveContext,
    nowPlaying,
    playingFromQueue,
    upNext,
    queueLength: liveQueue.length,
    hasNext,
    hasPrev,
    playPlaylist,
    playSong,
    playNext,
    playPrev,
    enqueue,
    playNextUp,
    removeQueued,
    clearQueue,
    stopContext,
  };
}

export type PlaybackQueue = ReturnType<typeof usePlaybackQueue>;
