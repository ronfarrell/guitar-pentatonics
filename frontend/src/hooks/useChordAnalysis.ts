import { useRef, useState } from "react";
import { api, APIError, type AnalysisDemoResponse } from "../services/api";

export function useChordAnalysis(onComplete?: () => void) {
  const [analysisData, setAnalysisData] = useState<AnalysisDemoResponse | null>(null);
  // URL whose analysis is currently loaded (as opposed to whatever is typed in the input)
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = analysisData?.key ?? null;
  const eventSourceRef = useRef<EventSource | null>(null);
  // Tracks the active job ID — callbacks from older jobs check this and bail if stale
  const activeJobIdRef = useRef<string | null>(null);

  function _closeExisting() {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    activeJobIdRef.current = null;
  }

  function _trackJob(job_id: string, youtubeUrl: string, afterComplete?: () => void, retries = 5) {
    // Bail immediately if this job was superseded before we even started
    if (activeJobIdRef.current !== job_id) return;

    const es = api.analysis.streamProgress(job_id);
    eventSourceRef.current = es;

    es.onmessage = async (event) => {
      // Discard if a newer job has taken over
      if (activeJobIdRef.current !== job_id) { es.close(); return; }

      const data = JSON.parse(event.data);

      if (data.status === "completed") {
        try {
          const result = await api.analysis.analyze(youtubeUrl);
          if (activeJobIdRef.current !== job_id) return; // superseded during fetch
          setAnalysisData(result);
          setLoadedUrl(youtubeUrl);
        } catch (err) {
          if (activeJobIdRef.current !== job_id) return;
          setError(err instanceof APIError ? err.message : "Failed");
        }

        es.close();
        activeJobIdRef.current = null;
        setLoading(false);
        afterComplete?.();
        onComplete?.();
      }
    };

    es.onerror = () => {
      es.close();
      if (activeJobIdRef.current !== job_id) return; // superseded, drop it

      if (retries > 0) {
        setTimeout(() => {
          if (activeJobIdRef.current === job_id) {
            _trackJob(job_id, youtubeUrl, afterComplete, retries - 1);
          }
        }, 3000);
      } else {
        setError("Connection lost");
        setLoading(false);
        afterComplete?.();
      }
    };
  }

  async function analyze(url: string) {
    _closeExisting();
    setLoading(true);
    setError(null);

    try {
      const { job_id } = await api.analysis.startAnalysis(url);
      activeJobIdRef.current = job_id;
      _trackJob(job_id, url);
    } catch (err) {
      setError(err instanceof APIError ? err.message : "Failed");
      setLoading(false);
    }
  }

  // For saved songs that are already cached — skip SSE, just fetch the result directly
  async function loadCached(url: string) {
    _closeExisting();
    setLoading(true);
    setError(null);

    try {
      const result = await api.analysis.analyze(url);
      setAnalysisData(result);
      setLoadedUrl(url);
    } catch (err) {
      setError(err instanceof APIError ? err.message : "Failed");
    } finally {
      setLoading(false);
      onComplete?.();
    }
  }

  async function analyzeWithJobId(job_id: string, youtubeUrl: string, afterComplete?: () => void) {
    _closeExisting();
    setLoading(true);
    setError(null);
    activeJobIdRef.current = job_id;
    _trackJob(job_id, youtubeUrl, afterComplete);
  }

  return { analysisData, loadedUrl, loading, error, analyze, loadCached, analyzeWithJobId, key };
}
