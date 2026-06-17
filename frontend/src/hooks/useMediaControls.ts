import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export type MediaControls = {
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  repeat: boolean;
  togglePlay: () => void;
  stop: () => void;
  restart: () => void;
  seek: (t: number) => void;
  setVolumeLevel: (v: number) => void;
  toggleRepeat: () => void;
  formatTime: (s: number) => string;
};

export function useMediaControls(
  videoRef: RefObject<HTMLVideoElement | null>,
  videoSrc: string | null,
): MediaControls {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [repeat, setRepeat] = useState(false);
  const repeatRef = useRef(false);
  const volumeRef = useRef(0.5);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    video.volume = volumeRef.current;
    setPlaying(!video.paused);
    setCurrentTime(video.currentTime);
    if (video.readyState >= 1) setDuration(video.duration);

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => setDuration(video.duration);
    const onVolumeChange = () => setVolume(video.volume);
    const onEnded = () => {
      if (repeatRef.current) {
        video.currentTime = 0;
        video.play();
      }
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("ended", onEnded);
    };
  }, [videoSrc]); // eslint-disable-line react-hooks/exhaustive-deps

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    v.paused ? v.play() : v.pause();
  }

  function stop() {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
  }

  function restart() {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play();
  }

  function seek(time: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = time;
  }

  function toggleRepeat() {
    const next = !repeatRef.current;
    repeatRef.current = next;
    setRepeat(next);
  }

  function setVolumeLevel(level: number) {
    const v = videoRef.current;
    if (!v) return;
    volumeRef.current = level;
    v.volume = level;
  }

  function formatTime(s: number) {
    if (!isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  return { playing, currentTime, duration, volume, repeat, togglePlay, stop, restart, seek, setVolumeLevel, toggleRepeat, formatTime };
}
