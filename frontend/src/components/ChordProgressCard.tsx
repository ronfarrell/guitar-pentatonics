export default function ChordProgressCard({ data }: { data: any }) {
  if (!data) return null;

  return (
    <div className="chord-progress-card">
      <div className="chord-progress-header">
        <span>
          Current: <strong>{data.chord.chord}</strong>
        </span>

        {data.next && (
          <span>
            Next: <strong>{data.next.chord}</strong>
          </span>
        )}
      </div>

      <div className="chord-progress-bar">
        <div
          className="chord-progress-fill"
          style={{ width: `${data.percent}%` }}
        />
      </div>

      <div className="chord-progress-meta">
        {data.next ? `→ ${data.next.chord}` : "End"}
      </div>
    </div>
  );
}
