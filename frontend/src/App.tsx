import { useEffect, useState, useRef } from 'react'
import './App.css'
import Fretboard from './components/Fretboard'
import { ROOT_NOTES } from './theory/notes'
import type { NoteName } from './theory/notes'
import { SCALE_TYPES, getScaleNotes } from './theory/scales'
import type { ScaleType } from './theory/scales'
import { api, type AnalysisDemoResponse, APIError } from './services/api'

interface ProgressState {
  status: string
  percentage: number
  message: string
  started_at: string
  completed_at: string | null
}

function App() {
  const [root, setRoot] = useState<NoteName>(ROOT_NOTES[0])
  const [scaleType, setScaleType] = useState<ScaleType>('Major Pentatonic')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [submittedVideoId, setSubmittedVideoId] = useState<string | null>(null)
  const [submittedUrl, setSubmittedUrl] = useState<string | null>(null)
  const [analysisData, setAnalysisData] = useState<AnalysisDemoResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [iframeError, setIframeError] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const scaleNotes = getScaleNotes(root, scaleType)

  // Extract YouTube video ID from various URL formats
  const extractVideoId = (url: string): string | null => {
    // Remove query parameters and fragments to clean the URL
    const cleanUrl = url.split(/[?#]/)[0]
    
    const patterns = [
      // Standard youtube.com/watch?v= format
      /youtube\.com\/watch\?v=([^&]+)/,
      // Short youtu.be format
      /youtu\.be\/([^?&/]+)/,
      // Embed format
      /youtube\.com\/embed\/([^?&/]+)/,
      // Just the video ID itself
      /^([a-zA-Z0-9_-]{11})$/,
    ]
    
    for (const pattern of patterns) {
      const match = url.match(pattern) || cleanUrl.match(pattern)
      if (match && match[1]) {
        return match[1]
      }
    }
    return null
  }

  // Handle YouTube link submission with streaming progress
  const handleYoutubeSubmit = async () => {
    setError(null)
    setProgress(null)
    setAnalysisData(null)
    setIframeError(false)
    
    if (!youtubeUrl.trim()) {
      setError('Please enter a YouTube URL')
      return
    }

    const videoId = extractVideoId(youtubeUrl)
    if (!videoId) {
      setError('Invalid YouTube URL. Please use a valid YouTube link.')
      return
    }

    setSubmittedVideoId(videoId)
    setSubmittedUrl(youtubeUrl)
    setLoading(true)

    try {
      // Start analysis and get job ID
      const { job_id } = await api.analysis.startAnalysis(youtubeUrl)
      setJobId(job_id)

      // Stream progress updates
      const eventSource = api.analysis.streamProgress(job_id)
      eventSourceRef.current = eventSource

      eventSource.onmessage = (event) => {
        const progressData = JSON.parse(event.data) as ProgressState
        setProgress(progressData)

        // When complete, fetch final results
        if (progressData.status === 'completed') {
          // Fetch actual analysis results (will be cached, so instant)
          api.analysis.analyze(youtubeUrl)
            .then((result) => {
              setAnalysisData(result)
              eventSource.close()
              setLoading(false)
            })
            .catch((err) => {
              console.error('Failed to fetch analysis results:', err)
              // Fallback to dummy data
              setAnalysisData({
                key: 'A Minor',
                chords: [
                  { start: 1, end: 4, chord: 'Am' },
                  { start: 4, end: 8, chord: 'F' },
                  { start: 8, end: 12, chord: 'C' },
                ],
              })
              eventSource.close()
              setLoading(false)
            })
        }
      }

      eventSource.onerror = () => {
        setError('Connection lost during analysis')
        eventSource.close()
        setLoading(false)
      }
    } catch (err) {
      const message = err instanceof APIError ? err.message : 'Failed to start analysis'
      setError(message)
      setLoading(false)
    }
  }

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Guitar improv assistant</p>
          <h1>Pentatonic tab visualizer</h1>
          <p className="subtitle">
            Select a key and pentatonic scale, then study the pattern across a standard 6-string guitar fretboard.
          </p>
        </div>

        <div className="hero-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
          >
            {theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          </button>
        </div>

        <div className="controls-panel">
          <label>
            Key
            <select value={root} onChange={(event) => setRoot(event.target.value as NoteName)}>
              {ROOT_NOTES.map((note) => (
                <option key={note} value={note}>
                  {note}
                </option>
              ))}
            </select>
          </label>

          <label>
            Scale
            <select value={scaleType} onChange={(event) => setScaleType(event.target.value as ScaleType)}>
              {SCALE_TYPES.map((scale) => (
                <option key={scale} value={scale}>
                  {scale}
                </option>
              ))}
            </select>
          </label>

          <label>
            YouTube link
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="youtube-input"
                placeholder="Paste video URL here"
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
              />
              <button
                type="button"
                onClick={handleYoutubeSubmit}
                disabled={loading}
                style={{
                  padding: '8px 16px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? 'Analyzing...' : 'Play & Analyze'}
              </button>
            </div>
            {error && <p style={{ color: '#e74c3c', marginTop: '4px', fontSize: '0.9em' }}>{error}</p>}
            {progress && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '0.85em', color: '#4b5563', marginBottom: '6px' }}>
                  <strong>{progress.message}</strong> ({progress.percentage}%)
                </div>
                <div
                  style={{
                    width: '100%',
                    height: '6px',
                    backgroundColor: 'var(--border)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      backgroundColor: 'var(--accent)',
                      width: `${progress.percentage}%`,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            )}
          </label>
        </div>
      </section>

      <section className="summary-card">
        <div>
          <h2>Why this helps</h2>
          <p>
            Visualize the pentatonic shape in a familiar tab layout. This helps you find scale tones faster while improvising on guitar.
          </p>
        </div>
        <div className="scale-badges">
          {scaleNotes.map((note) => (
            <span key={note} className="note-chip">
              {note}
            </span>
          ))}
        </div>
      </section>

      {submittedVideoId && (
        <section className="video-section">
          {submittedVideoId && analysisData?.video_path ? (
            <div className="video-player">
              <video
                width="100%"
                height="400"
                controls
                style={{ borderRadius: '8px', backgroundColor: '#000' }}
              >
                <source
                  src={`${import.meta.env.VITE_API_BASE_URL}/analysis/video/${analysisData.video_path}`}
                  type="video/mp4"
                />
                Your browser does not support the video tag.
              </video>
            </div>
          ) : !iframeError ? (
            <div className="video-player">
              <iframe
                key={submittedVideoId}
                width="100%"
                height="400"
                src={`https://www.youtube.com/embed/${submittedVideoId}?modestbranding=1&rel=0`}
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                onError={() => setIframeError(true)}
              />
            </div>
          ) : (
            <div
              style={{
                backgroundColor: 'var(--surface)',
                border: '2px solid var(--border)',
                borderRadius: '8px',
                padding: '24px',
                textAlign: 'center',
                minHeight: '400px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <p style={{ marginBottom: '16px', color: '#666' }}>
                This video cannot be embedded directly. It may be:
              </p>
              <ul
                style={{
                  textAlign: 'left',
                  marginBottom: '16px',
                  display: 'inline-block',
                  color: '#666',
                  fontSize: '0.9em',
                }}
              >
                <li>Age-restricted</li>
                <li>Embedding disabled by the uploader</li>
                <li>Private or deleted</li>
                <li>Geoblocked in your region</li>
              </ul>
              <a
                href={submittedUrl || `https://www.youtube.com/watch?v=${submittedVideoId}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  backgroundColor: 'var(--accent)',
                  color: 'white',
                  padding: '10px 20px',
                  borderRadius: '4px',
                  textDecoration: 'none',
                  cursor: 'pointer',
                  fontSize: '0.95em',
                }}
              >
                Open Video on YouTube →
              </a>
            </div>
          )}

          {analysisData && (
            <div className="analysis-results">
              <h2>Analysis</h2>
              <div className="analysis-key">
                <strong>Key:</strong> {analysisData.key}
              </div>
              <div className="analysis-chords">
                <strong>Detected Chords:</strong>
                <ul>
                  {analysisData.chords.map((chord, idx) => (
                    <li key={idx}>
                      {chord.chord} ({chord.start}s - {chord.end}s)
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>
      )}

      <Fretboard root={root} scaleType={scaleType} />
    </main>
  )
}

export default App
