import type { AnalysisDemoResponse } from "../services/api";

type Props = {
  chords: AnalysisDemoResponse["chords"];
};

export default function ChordSidebar({ chords }: Props) {
  return (
    <aside className="chord-sidebar">
      <div className="chords-title">Chords</div>

      <div className="chords-scroll">
        {chords.map((c, i) => (
          <div key={i} className="chord-row">
            <div className="chord-name">{c.chord}</div>
            <div className="chord-time">
              {c.start}s → {c.end}s
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
