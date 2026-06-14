import { useEffect, useRef, useState } from "react";
import type { AnalysisDemoResponse } from "../services/api";

type TrackerState = {
  currentChord: string | null;
  nextChord: string | null;
  progressToNext: number; // 0 → 1
};

export function useChordTracker(analysisData: AnalysisDemoResponse | null) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [state, setState] = useState<TrackerState>({
    currentChord: null,
    nextChord: null,
    progressToNext: 0,
  });

  function getChordIndexAtTime(time: number) {
    if (!analysisData?.chords) return -1;

    return analysisData.chords.findIndex(
      (c) => time >= c.start && time < c.end,
    );
  }

  useEffect(() => {
    if (!videoRef.current || !analysisData?.chords) return;

    const video = videoRef.current;

    const interval = setInterval(() => {
      const time = video.currentTime;
      const chords = analysisData.chords;

      const idx = getChordIndexAtTime(time);

      if (idx === -1) {
        setState({
          currentChord: null,
          nextChord: null,
          progressToNext: 0,
        });
        return;
      }

      const current = chords[idx];
      const next = chords[idx + 1];

      // progress inside current chord window
      const duration = current.end - current.start;
      const progress = duration > 0 ? (time - current.start) / duration : 0;

      setState({
        currentChord: current.chord,
        nextChord: next?.chord ?? null,
        progressToNext: Math.min(Math.max(progress, 0), 1),
      });
    }, 50);

    return () => clearInterval(interval);
  }, [analysisData]);

  return {
    videoRef,
    currentChord: state.currentChord,
    nextChord: state.nextChord,
    progressToNext: state.progressToNext,
  };
}
