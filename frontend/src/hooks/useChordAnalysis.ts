import { useEffect, useRef, useState } from "react";
import { api, APIError, type AnalysisDemoResponse } from "../services/api";

export interface ProgressState {
  status: string;
  percentage: number;
  message: string;
  started_at: string;
  completed_at: string | null;
}

export function useChordAnalysis(onComplete?: () => void) {
  const [analysisData, setAnalysisData] = useState<AnalysisDemoResponse | null>(
    null,
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);

  const [currentChord, setCurrentChord] = useState<string | null>(null);
  const [chordProgress, setChordProgress] = useState<any>(null);
  const key = analysisData?.key ?? null;
  const eventSourceRef = useRef<EventSource | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  function getChordAtTime(time: number) {
    if (!analysisData?.chords) return null;

    return (
      analysisData.chords.find((c) => time >= c.start && time < c.end)?.chord ??
      null
    );
  }

  function getActiveChordIndex(time: number) {
    if (!analysisData?.chords) return -1;

    return analysisData.chords.findIndex(
      (c) => time >= c.start && time < c.end,
    );
  }

  function getChordProgress(time: number) {
    if (!analysisData?.chords) return null;

    const idx = getActiveChordIndex(time);
    if (idx === -1) return null;

    const chord = analysisData.chords[idx];
    const next = analysisData.chords[idx + 1] ?? null;

    const duration = chord.end - chord.start;
    const elapsed = time - chord.start;
    const percent = Math.max(0, 100 - (elapsed / duration) * 100);

    return {
      chord,
      next,
      percent,
      remaining: chord.end - time,
    };
  }

  function attachVideo(video: HTMLVideoElement | null) {
    videoRef.current = video;
  }

  useEffect(() => {
    if (!videoRef.current || !analysisData) return;

    const video = videoRef.current;

    const interval = setInterval(() => {
      const time = video.currentTime;

      setCurrentChord(getChordAtTime(time));
      setChordProgress(getChordProgress(time));
    }, 100);

    return () => clearInterval(interval);
  }, [analysisData]);

  async function analyze(url: string) {
    setLoading(true);
    setError(null);
    setAnalysisData(null);

    try {
      const { job_id } = await api.analysis.startAnalysis(url);

      const es = api.analysis.streamProgress(job_id);
      eventSourceRef.current = es;

      es.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        setProgress(data);

        if (data.status === "completed") {
          try {
            const result = await api.analysis.analyze(url);
            setAnalysisData(result);
          } catch (err) {
            const message = err instanceof APIError ? err.message : "Failed";
            setError(message);
          }

          es.close();
          setLoading(false);
          if (onComplete) onComplete();
        }
      };

      es.onerror = () => {
        setError("Connection lost");
        es.close();
        setLoading(false);
      };
    } catch (err) {
      setError(err instanceof APIError ? err.message : "Failed");
      setLoading(false);
    }
  }

  return {
    analysisData,
    loading,
    error,
    progress,
    currentChord,
    chordProgress,
    analyze,
    attachVideo,
    key,
  };
}
