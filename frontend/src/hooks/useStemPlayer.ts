import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { api, APIError } from "../services/api";

export const STEM_NAMES = ["vocals", "drums", "bass", "guitar", "piano", "other"] as const;
export type StemName = (typeof STEM_NAMES)[number];
export type StemMix = Record<StemName, boolean>;

export type StemPlayer = {
  /** Mic button: instrumental (vocals-stripped) playback, or the vocals stem when the mixer is active */
  vocalsOff: boolean;
  vocalsBusy: boolean;
  vocalsProgress: number;
  toggleVocals: () => void;

  /** Stem mixer */
  stemsAvailable: boolean;
  mixActive: boolean;
  mix: StemMix;
  setStemAudible: (stem: StemName, on: boolean) => void;
  setMixActive: (on: boolean) => void;
  generateStems: () => void;
  stemsBusy: boolean;
  stemsProgress: number;

  error: string | null;
};

const DEFAULT_MIX: StemMix = {
  vocals: true,
  drums: true,
  bass: true,
  guitar: true,
  piano: true,
  other: true,
};

/**
 * Separated-audio playback: the quick "vocals off" backing track and the
 * per-stem mixer, sharing one audio engine.
 *
 * The video element stays the source of truth for time/transport; when
 * either mode is on, it is muted and hidden Audio elements play the
 * separated tracks, kept in sync with the video's play/pause/seek/rate/
 * volume. In mixer mode all six stems play simultaneously and toggling a
 * stem just mutes its element, so changes are instant and never drift.
 *
 * Missing audio is generated on demand by backend Demucs jobs (two-stem for
 * the instrumental, six-stem for the mixer), tracked over the existing
 * progress SSE stream. All state is keyed by URL and derived against
 * loadedUrl, so switching songs naturally turns everything off.
 */
export function useStemPlayer(
  videoRef: RefObject<HTMLVideoElement | null>,
  loadedUrl: string | null,
  instrumentalPath: string | null,
  stemPaths: Record<string, string> | null,
): StemPlayer {
  // Results produced by separations this session (before analysisData refetch)
  const [separated, setSeparated] = useState<{ url: string; path: string } | null>(null);
  const [sessionStems, setSessionStems] = useState<{ url: string; stems: Record<string, string> } | null>(null);

  const [backingUrl, setBackingUrl] = useState<string | null>(null);
  const [mixUrl, setMixUrl] = useState<string | null>(null);
  const [mixState, setMixState] = useState<{ url: string; mix: StemMix } | null>(null);

  const [instrumentalJob, setInstrumentalJob] = useState<{ url: string; progress: number } | null>(null);
  const [stemsJob, setStemsJob] = useState<{ url: string; progress: number } | null>(null);
  const [failure, setFailure] = useState<{ url: string; message: string } | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const loadedUrlRef = useRef(loadedUrl);
  useEffect(() => {
    loadedUrlRef.current = loadedUrl;
  }, [loadedUrl]);

  // Drop any in-flight progress stream when the song changes / on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [loadedUrl]);

  const instrumental =
    instrumentalPath ??
    (separated && separated.url === loadedUrl ? separated.path : null);
  const stems =
    stemPaths ??
    (sessionStems && sessionStems.url === loadedUrl ? sessionStems.stems : null);

  const mixActive = !!loadedUrl && mixUrl === loadedUrl && !!stems;
  const backingActive = !mixActive && !!loadedUrl && backingUrl === loadedUrl && !!instrumental;
  const mix: StemMix =
    mixState && mixState.url === loadedUrl ? mixState.mix : DEFAULT_MIX;

  const vocalsOff = mixActive ? !mix.vocals : backingActive;
  const vocalsBusy = !!loadedUrl && instrumentalJob?.url === loadedUrl;
  const stemsBusy = !!loadedUrl && stemsJob?.url === loadedUrl;
  const error = failure && failure.url === loadedUrl ? failure.message : null;

  const toSrc = (path: string) =>
    `${import.meta.env.VITE_API_BASE_URL}/analysis/audio/${path}`;

  // The set of audio tracks the engine should be playing right now
  const tracks = useMemo(() => {
    if (mixActive && stems) {
      return STEM_NAMES.filter((name) => stems[name]).map((name) => ({
        key: name as string,
        src: toSrc(stems[name]),
      }));
    }
    if (backingActive && instrumental) {
      return [{ key: "instrumental", src: toSrc(instrumental) }];
    }
    return [];
  }, [mixActive, backingActive, stems, instrumental]);

  const audioMapRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const mixRef = useRef(mix);
  useEffect(() => {
    mixRef.current = mix;
  }, [mix]);
  const mixActiveRef = useRef(mixActive);
  useEffect(() => {
    mixActiveRef.current = mixActive;
  }, [mixActive]);

  const tracksKey = tracks.map((t) => t.src).join("|");

  // Engine: keep the separated audio locked to the video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || tracks.length === 0) return;

    const audios = new Map<string, HTMLAudioElement>();
    for (const t of tracks) {
      const a = new Audio(t.src);
      a.preload = "auto";
      a.volume = video.volume;
      a.playbackRate = video.playbackRate;
      a.muted = mixActiveRef.current ? !mixRef.current[t.key as StemName] : false;
      audios.set(t.key, a);
    }
    audioMapRef.current = audios;
    video.muted = true;

    const each = (fn: (a: HTMLAudioElement) => void) => audios.forEach(fn);
    const syncTime = () => each((a) => { a.currentTime = video.currentTime; });
    const onPlay = () => {
      syncTime();
      each((a) => a.play().catch(() => {}));
    };
    const onPause = () => each((a) => a.pause());
    const onSeeked = syncTime;
    const onRateChange = () => each((a) => { a.playbackRate = video.playbackRate; });
    const onVolumeChange = () => each((a) => { a.volume = video.volume; });
    const onTimeUpdate = () => {
      // correct drift; big jumps are handled by seeked
      if (video.paused) return;
      each((a) => {
        if (Math.abs(a.currentTime - video.currentTime) > 0.3) {
          a.currentTime = video.currentTime;
        }
      });
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("ratechange", onRateChange);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("timeupdate", onTimeUpdate);

    syncTime();
    if (!video.paused) each((a) => a.play().catch(() => {}));

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("ratechange", onRateChange);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("timeupdate", onTimeUpdate);
      each((a) => {
        a.pause();
        a.src = "";
      });
      audioMapRef.current = new Map();
      video.muted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracksKey]);

  // Mixer toggles just mute/unmute the already-playing stem elements
  useEffect(() => {
    if (!mixActive) return;
    for (const name of STEM_NAMES) {
      const a = audioMapRef.current.get(name);
      if (a) a.muted = !mix[name];
    }
  }, [mix, mixActive]);

  function setStemAudible(stem: StemName, on: boolean) {
    if (!loadedUrl) return;
    setMixState({ url: loadedUrl, mix: { ...mix, [stem]: on } });
  }

  function activateMix(vocalsAudible: boolean) {
    if (!loadedUrl) return;
    if (!mixState || mixState.url !== loadedUrl) {
      setMixState({ url: loadedUrl, mix: { ...DEFAULT_MIX, vocals: vocalsAudible } });
    }
    setMixUrl(loadedUrl);
  }

  function setMixActive(on: boolean) {
    if (!loadedUrl) return;
    if (!on) {
      setMixUrl(null);
      return;
    }
    if (stems) {
      // carry the current vocal muting into the mixer
      activateMix(!vocalsOff);
    } else if (!stemsBusy) {
      generateStems();
    }
  }

  function toggleVocals() {
    if (!loadedUrl) return;
    if (mixActive) {
      setStemAudible("vocals", !mix.vocals);
      return;
    }
    if (backingActive) {
      setBackingUrl(null);
      return;
    }
    if (instrumental) {
      setBackingUrl(loadedUrl);
      return;
    }
    if (vocalsBusy) return;
    void startInstrumentalJob(loadedUrl);
  }

  function generateStems() {
    if (!loadedUrl || stemsBusy) return;
    void startStemsJob(loadedUrl);
  }

  /**
   * Run a backend separation job, following its progress stream, then
   * refetch the analysis (jobs store results server-side) and apply it.
   */
  function trackJob(
    url: string,
    jobId: string,
    setJob: (j: { url: string; progress: number } | null) => void,
    onDone: (result: { instrumental_path?: string; stems?: Record<string, string> }) => boolean,
    failMessage: string,
  ) {
    const fail = (message: string) => {
      setFailure({ url, message });
      setJob(null);
    };

    const es = api.analysis.streamProgress(jobId);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      if (loadedUrlRef.current !== url) {
        es.close();
        return;
      }
      const data = JSON.parse(event.data);
      if (typeof data.percentage === "number" && data.percentage >= 0) {
        setJob({ url, progress: data.percentage });
      }
      if (data.status === "completed") {
        es.close();
        eventSourceRef.current = null;
        api.analysis
          .analyze(url)
          .then((result) => {
            if (loadedUrlRef.current !== url) return;
            if (onDone(result)) setJob(null);
            else fail(failMessage);
          })
          .catch(() => fail(failMessage));
      } else if (data.status === "error") {
        es.close();
        eventSourceRef.current = null;
        fail(data.message || failMessage);
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      if (loadedUrlRef.current !== url) return;
      fail("Connection lost");
    };
  }

  async function startInstrumentalJob(url: string) {
    setInstrumentalJob({ url, progress: 0 });
    setFailure(null);

    const apply = (path: string | undefined) => {
      if (!path) return false;
      setSeparated({ url, path });
      setBackingUrl(url);
      return true;
    };

    try {
      const res = await api.analysis.startInstrumental(url);
      if (loadedUrlRef.current !== url) return;
      if (res.status === "completed") {
        if (apply(res.instrumental_path)) setInstrumentalJob(null);
        else {
          setFailure({ url, message: "Backing track unavailable" });
          setInstrumentalJob(null);
        }
        return;
      }
      trackJob(url, res.job_id!, setInstrumentalJob, (r) => apply(r.instrumental_path), "Backing track unavailable");
    } catch (err) {
      setFailure({ url, message: err instanceof APIError ? err.message : "Vocal separation failed" });
      setInstrumentalJob(null);
    }
  }

  async function startStemsJob(url: string) {
    setStemsJob({ url, progress: 0 });
    setFailure(null);

    const wasVocalsOff = vocalsOff;
    const apply = (result: Record<string, string> | undefined) => {
      if (!result) return false;
      setSessionStems({ url, stems: result });
      setMixState({ url, mix: { ...DEFAULT_MIX, vocals: !wasVocalsOff } });
      setMixUrl(url);
      return true;
    };

    try {
      const res = await api.analysis.startStems(url);
      if (loadedUrlRef.current !== url) return;
      if (res.status === "completed") {
        if (apply(res.stems)) setStemsJob(null);
        else {
          setFailure({ url, message: "Stems unavailable" });
          setStemsJob(null);
        }
        return;
      }
      trackJob(url, res.job_id!, setStemsJob, (r) => apply(r.stems), "Stems unavailable");
    } catch (err) {
      setFailure({ url, message: err instanceof APIError ? err.message : "Stem split failed" });
      setStemsJob(null);
    }
  }

  return {
    vocalsOff,
    vocalsBusy,
    vocalsProgress: vocalsBusy && instrumentalJob ? instrumentalJob.progress : 0,
    toggleVocals,
    stemsAvailable: !!stems,
    mixActive,
    mix,
    setStemAudible,
    setMixActive,
    generateStems,
    stemsBusy,
    stemsProgress: stemsBusy && stemsJob ? stemsJob.progress : 0,
    error,
  };
}
