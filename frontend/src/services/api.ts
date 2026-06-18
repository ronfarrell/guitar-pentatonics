// Environment configuration
// Empty string = relative URLs, used in Docker where nginx proxies API routes to the backend.
// Falls back to localhost:8000 for local dev without a .env.local file.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

// Response types (shared with backend responses)
export type HealthResponse = {
  status: string;
};

export type AnalysisDemoResponse = {
  key: string;
  chords: Array<{ start: number; end: number; chord: string }>;
  audio_path?: string;
  video_path?: string;
  video_title?: string;
};

// API error handling
export class APIError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'APIError';
    this.status = status;
  }
}

// Generic fetch wrapper
async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new APIError(response.status, error || `HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    if (err instanceof APIError) throw err;
    throw new APIError(0, `Failed to reach API: ${err}`);
  }
}

// API methods
export const api = {
  health: {
    check: () => fetchAPI<HealthResponse>('/health/'),
  },
  analysis: {
    demo: () => fetchAPI<AnalysisDemoResponse>('/analysis/demo'),
    analyze: (youtubeUrl: string) =>
      fetchAPI<AnalysisDemoResponse>('/analysis', {
        method: 'POST',
        body: JSON.stringify({ youtube_url: youtubeUrl }),
      }),
    startAnalysis: (youtubeUrl: string) =>
      fetchAPI<{ job_id: string }>('/analysis/start', {
        method: 'POST',
        body: JSON.stringify({ youtube_url: youtubeUrl }),
      }),
    getProgress: (jobId: string) =>
      fetchAPI<{
        status: string;
        percentage: number;
        message: string;
        started_at: string;
        completed_at: string | null;
      }>(`/analysis/progress/${jobId}`),
    streamProgress: (jobId: string) => {
      const baseUrl = API_BASE_URL.replace(/\/$/, '');
      return new EventSource(`${baseUrl}/analysis/stream/${jobId}`);
    },
  },
};
