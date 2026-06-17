import { useRef, useEffect } from "react";
import type { AnalysisDemoResponse } from "../services/api";

type Props = {
  chords: AnalysisDemoResponse["chords"];
  currentTime: number;
  seek: (t: number) => void;
};

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function ChordSidebar({ chords, currentTime, seek }: Props) {
  const activeIndex = chords.findIndex(
    (c) => currentTime >= c.start && currentTime < c.end,
  );

  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const el = rowRefs.current[activeIndex];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIndex]);

  return (
    <aside className="chord-sidebar">
      <div className="chords-title">Chords</div>

      <div className="chords-scroll">
        {chords.map((c, i) => (
          <div
            key={i}
            ref={(el) => { rowRefs.current[i] = el; }}
            className={`chord-row${i === activeIndex ? " chord-row--active" : ""}`}
            onClick={() => seek(c.start)}
          >
            <div className="chord-name">{c.chord}</div>
            <div className="chord-time">{fmtTime(c.start)}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}
