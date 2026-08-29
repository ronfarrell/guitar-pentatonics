import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import type { YouTubeSearchResult } from "../services/api";

type Props = {
  youtubeUrl: string;
  setYoutubeUrl: (v: string) => void;
  onAnalyze: (url: string) => void;
  loading: boolean;
};

const SEARCH_DEBOUNCE_MS = 350;
const SEARCH_LIMIT = 10;

// Anything that parses as a link goes straight to the analyzer; everything
// else is treated as a search query.
function isUrlLike(value: string): boolean {
  const v = value.trim();
  return (
    /^(https?:\/\/|www\.)/i.test(v) ||
    /^(m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(v)
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

function formatViews(views: number | null): string {
  if (views == null) return "";
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M views`;
  if (views >= 1_000) return `${Math.round(views / 1_000)}K views`;
  return `${views} views`;
}

export default function Controls({
  youtubeUrl,
  setYoutubeUrl,
  onAnalyze,
  loading,
}: Props) {
  const [results, setResults] = useState<YouTubeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  // Set when a result is picked or a saved song is loaded, so the resulting
  // text change (now a URL) doesn't immediately re-open the dropdown.
  const suppressSearchRef = useRef(false);

  useEffect(() => {
    const query = youtubeUrl.trim();

    if (suppressSearchRef.current) {
      suppressSearchRef.current = false;
      return;
    }

    if (query.length < 2 || isUrlLike(query)) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const res = await api.search.youtube(query, SEARCH_LIMIT, controller.signal);
        setResults(res.results);
        setHighlighted(-1);
        setOpen(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResults([]);
        setSearchError("Search failed — paste a YouTube link instead");
        setOpen(true);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [youtubeUrl]);

  // Click outside closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const pickResult = (result: YouTubeSearchResult) => {
    suppressSearchRef.current = true;
    setYoutubeUrl(result.url);
    setOpen(false);
    setResults([]);
    onAnalyze(result.url);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (open && results.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((i) => (i + 1) % results.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((i) => (i <= 0 ? results.length - 1 : i - 1));
        return;
      }
      if (e.key === "Enter" && highlighted >= 0) {
        e.preventDefault();
        pickResult(results[highlighted]);
        return;
      }
    }
    if (e.key === "Enter" && isUrlLike(youtubeUrl) && !loading) {
      onAnalyze(youtubeUrl);
    }
  };

  const showDropdown = open && (results.length > 0 || searchError !== null);

  return (
    <div className="controls-panel controls-panel--url">
      <div className="control-group">
        <label>YouTube URL</label>
        <div className="control-row search-anchor" ref={containerRef}>
          <input
            className="youtube-input"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (results.length > 0) setOpen(true);
            }}
            placeholder="Search YouTube or paste a link"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls="youtube-search-results"
            aria-autocomplete="list"
          />
          {searching && <span className="search-spinner" aria-label="Searching" />}
          <button
            className="primary-button"
            onClick={() => onAnalyze(youtubeUrl)}
            disabled={loading || !youtubeUrl.trim()}
          >
            {loading ? "Analyzing..." : "Analyze"}
          </button>

          {showDropdown && (
            <ul
              className="search-results"
              id="youtube-search-results"
              role="listbox"
            >
              {searchError && (
                <li className="search-results__error">{searchError}</li>
              )}
              {results.map((result, i) => (
                <li key={result.video_id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === highlighted}
                    className={`search-result${i === highlighted ? " is-highlighted" : ""}`}
                    onMouseEnter={() => setHighlighted(i)}
                    onClick={() => pickResult(result)}
                  >
                    <span className="search-result__thumb">
                      <img src={result.thumbnail} alt="" loading="lazy" />
                      {result.duration != null && (
                        <span className="search-result__duration">
                          {formatDuration(result.duration)}
                        </span>
                      )}
                    </span>
                    <span className="search-result__meta">
                      <span className="search-result__title">{result.title}</span>
                      <span className="search-result__sub">
                        {[result.channel, formatViews(result.view_count)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
