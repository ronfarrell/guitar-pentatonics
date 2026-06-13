import { useEffect, useState } from 'react';
import { api, APIError, type AnalysisDemoResponse } from '../services/api';

interface UseAnalysisState {
  data: AnalysisDemoResponse | null;
  loading: boolean;
  error: string | null;
}

export function useAnalysis(): UseAnalysisState {
  const [state, setState] = useState<UseAnalysisState>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        const result = await api.analysis.demo();
        setState({ data: result, loading: false, error: null });
      } catch (err) {
        const message = err instanceof APIError ? err.message : 'Unknown error occurred';
        setState({ data: null, loading: false, error: message });
      }
    };

    fetchAnalysis();
  }, []);

  return state;
}
