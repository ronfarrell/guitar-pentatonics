import { useRef, useState } from "react";
import { api, APIError, type AnalysisDemoResponse } from "../services/api";

export function useChordAnalysis(onComplete?: () => void) {
  const [analysisData, setAnalysisData] = useState<AnalysisDemoResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = analysisData?.key ?? null;
  const eventSourceRef = useRef<EventSource | null>(null);

  function _trackJob(job_id: string, youtubeUrl: string, afterComplete?: () => void) {
    const es = api.analysis.streamProgress(job_id);
    eventSourceRef.current = es;

    es.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.status === "completed") {
        try {
          const result = await api.analysis.analyze(youtubeUrl);
          setAnalysisData(result);
        } catch (err) {
          const message = err instanceof APIError ? err.message : "Failed";
          setError(message);
        }

        es.close();
        setLoading(false);
        afterComplete?.();
        onComplete?.();
      }
    };

    es.onerror = () => {
      setError("Connection lost");
      es.close();
      setLoading(false);
      afterComplete?.();
    };
  }

  async function analyze(url: string) {
    setLoading(true);
    setError(null);

    try {
      const { job_id } = await api.analysis.startAnalysis(url);
      _trackJob(job_id, url);
    } catch (err) {
      setError(err instanceof APIError ? err.message : "Failed");
      setLoading(false);
    }
  }

  async function analyzeWithJobId(job_id: string, youtubeUrl: string, afterComplete?: () => void) {
    setLoading(true);
    setError(null);
    _trackJob(job_id, youtubeUrl, afterComplete);
  }

  return { analysisData, loading, error, analyze, analyzeWithJobId, key };
}
