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
          onComplete?.();
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

  return { analysisData, loading, error, analyze, key };
}
