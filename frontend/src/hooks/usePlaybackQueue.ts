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
  /** The playlist's own order — the thing shuffle is a permutation of. */
  songIds: string[];
  /** The shuffled run while shuffle is on; null when playing in playlist order. */
  shuffleOrder: string[] | null;
  /** Cursor into the effective order, i.e. `shuffleOrder ?? songIds`. */
  index: number;
};

/** A context resolved against the library, with its effective play order. */
export type LiveContext = PlaybackContext & { order: string[] };

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

/**
 * Fisher-Yates on a copy: the playlist's own order is a saved thing, so a
 * shuffled run only ever reorders the context's snapshot of it.
 */
const shuffled = <T,>(items: T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** A shuffled run with `first` pinned to the front, when one is given. */
const shuffledFrom = (songIds: string[], first?: string) =>
  first && songIds.includes(first)
    ? [first, ...shuffled(songIds.filter((id) => id !== first))]
    : shuffled(songIds);

/** Drop the derived `order` before the context goes back into state. */
const storable = (
  c: LiveContext,
  patch: Partial<PlaybackContext> = {},
): PlaybackContext => ({
  playlistId: c.playlistId,
  playlistName: c.playlistName,
  songIds: c.songIds,
  shuffleOrder: c.shuffleOrder,
  index: c.index,
  ...patch,
});

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
  // Sticky: it outlives the playlist it was turned on for, so the next one you
  // start comes up shuffled too, the way the transport toggle implies.
  const [shuffle, setShuffle] = useState(restored?.shuffle ?? false);
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
  const liveContext = useMemo((): LiveContext | null => {
    if (!context) return null;
    const inLibrary = (id: string) => songs.some((s) => s.id === id);
    const songIds = context.songIds.filter(inLibrary);
    const shuffleOrder = context.shuffleOrder?.filter(inLibrary) ?? null;
    const order = shuffleOrder ?? songIds;
    if (order.length === 0) return null;
    const currentId = (context.shuffleOrder ?? context.songIds)[context.index];
    const index = order.indexOf(currentId);
    return { ...context, songIds, shuffleOrder, order, index: index === -1 ? 0 : index };
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

  /** What the playlist plays after the current song, in the order it will. */
  const contextUpNext = useMemo(() => {
    if (!liveContext) return [];
    return liveContext.order
      .slice(liveContext.index + 1)
      .map((songId) => {
        const song = songs.find((s) => s.id === songId);
        return song ? { songId, song } : null;
      })
      .filter(Boolean) as { songId: string; song: SavedSong }[];
  }, [liveContext, songs]);

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

  /** The playlist's songs that still exist in the library, in playlist order. */
  const playableSongIds = useCallback(
    (playlist: Playlist) =>
      playlist.songIds.filter((id) => songs.some((s) => s.id === id)),
    [songs],
  );

  const startContext = useCallback(
    (
      playlist: Playlist,
      songIds: string[],
      shuffleOrder: string[] | null,
      index: number,
    ) => {
      const song = findSong((shuffleOrder ?? songIds)[index]);
      if (!song) return;

      setContext({
        playlistId: playlist.id,
        playlistName: playlist.name,
        songIds,
        shuffleOrder,
        index,
      });
      setPlayingFromQueue(false);
      loadSong(song);
    },
    [findSong, loadSong],
  );

  /**
   * Start a playlist, optionally at a specific song. With shuffle on the run
   * is shuffled up front rather than picked track by track, so next/prev step
   * through one stable order and a refresh resumes that same run instead of
   * reshuffling underneath the listener.
   */
  const playPlaylist = useCallback(
    (playlist: Playlist, startSongId?: string) => {
      const songIds = playableSongIds(playlist);
      if (songIds.length === 0) return;

      if (shuffle) {
        // Shuffling still honours the song you clicked: it leads, the rest
        // follow shuffled behind it.
        startContext(playlist, songIds, shuffledFrom(songIds, startSongId), 0);
        return;
      }

      const at = startSongId ? songIds.indexOf(startSongId) : 0;
      startContext(playlist, songIds, null, at === -1 ? 0 : at);
    },
    [playableSongIds, shuffle, startContext],
  );

  /**
   * Shuffle-play a playlist, turning shuffle on for whatever follows. Pass
   * `avoidSongId` to keep the run from opening on a song that's already
   * playing — the rest of the shuffle is untouched, so every other song is
   * still equally likely to lead.
   */
  const playPlaylistShuffled = useCallback(
    (playlist: Playlist, avoidSongId?: string) => {
      const songIds = playableSongIds(playlist);
      if (songIds.length === 0) return;

      const order = shuffled(songIds);
      if (order.length > 1 && order[0] === avoidSongId) {
        const swap = 1 + Math.floor(Math.random() * (order.length - 1));
        [order[0], order[swap]] = [order[swap], order[0]];
      }

      setShuffle(true);
      startContext(playlist, songIds, order, 0);
    },
    [playableSongIds, startContext],
  );

  /**
   * Flip shuffle for the current run and everything started after it. What's
   * playing keeps playing — only the songs still ahead are reordered — so the
   * toggle never sounds like a skip.
   */
  const toggleShuffle = useCallback(() => {
    const next = !shuffle;
    setShuffle(next);
    if (!liveContext) return;

    const current = liveContext.order[liveContext.index];
    if (next) {
      setContext(
        storable(liveContext, {
          shuffleOrder: [current, ...shuffled(liveContext.songIds.filter((id) => id !== current))],
          index: 0,
        }),
      );
    } else {
      // Back to playlist order, picking up from where this song sits in it.
      const at = liveContext.songIds.indexOf(current);
      setContext(storable(liveContext, { shuffleOrder: null, index: at === -1 ? 0 : at }));
    }
  }, [shuffle, liveContext]);

  /** Jump straight to a song further along the current playlist run. */
  const playContextSong = useCallback(
    (songId: string) => {
      if (!liveContext) return false;
      const index = liveContext.order.indexOf(songId);
      if (index === -1) return false;
      const song = findSong(songId);
      if (!song) return false;

      setContext(storable(liveContext, { index }));
      setPlayingFromQueue(false);
      return loadSong(song);
    },
    [liveContext, findSong, loadSong],
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

  const hasNext =
    liveQueue.length > 0 ||
    (!!liveContext && liveContext.index < liveContext.order.length - 1);
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

    if (!liveContext || liveContext.index >= liveContext.order.length - 1) return false;

    const index = liveContext.index + 1;
    const song = findSong(liveContext.order[index]);
    if (!song) return false;

    setContext(storable(liveContext, { index }));
    setPlayingFromQueue(false);
    return loadSong(song);
  }, [liveQueue, liveContext, findSong, loadSong]);

  const playPrev = useCallback(() => {
    if (!liveContext || liveContext.index <= 0) return false;

    const index = liveContext.index - 1;
    const song = findSong(liveContext.order[index]);
    if (!song) return false;

    setContext(storable(liveContext, { index }));
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
    saveQueueSession({ context, queue: userQueue, shuffle });
  }, [context, userQueue, shuffle]);

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
        total: liveContext.order.length,
        songId: playingFromQueue ? null : liveContext.order[liveContext.index],
      }
    : null;

  return {
    context: liveContext,
    nowPlaying,
    playingFromQueue,
    upNext,
    contextUpNext,
    queueLength: liveQueue.length,
    shuffle,
    hasNext,
    hasPrev,
    playPlaylist,
    playPlaylistShuffled,
    toggleShuffle,
    playContextSong,
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
