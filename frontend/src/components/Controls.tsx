type Props = {
  youtubeUrl: string;
  setYoutubeUrl: (v: string) => void;
  onAnalyze: () => void;
  loading: boolean;
};

export default function Controls({ youtubeUrl, setYoutubeUrl, onAnalyze, loading }: Props) {
  return (
    <div className="controls-panel controls-panel--url">
      <div className="control-group">
        <label>YouTube URL</label>
        <div className="control-row">
          <input
            className="youtube-input"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="Paste YouTube URL"
          />
          <button className="primary-button" onClick={onAnalyze} disabled={loading}>
            {loading ? "Analyzing..." : "Play & Analyze"}
          </button>
        </div>
      </div>
    </div>
  );
}
