import { useEffect, useRef, useState } from "react";
import { setFontPx, useStore } from "./store";
import { highlightAlertWords } from "./TranscriptList";

export function Teleprompter(): React.JSX.Element {
  const { utterances, settings } = useStore();
  const boxRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  const last = utterances[utterances.length - 1];
  const lastKey = last ? `${last.id}:${last.text}` : "empty";

  useEffect(() => {
    const el = boxRef.current;
    if (el && !paused) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [utterances.length, lastKey, paused]);

  return (
    <div className="teleprompter-wrap">
      <div className="tele-controls" style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          className="pause-btn"
          aria-pressed={paused}
          onClick={() => setPaused((p) => !p)}
        >
          {paused ? "▶ Resume Auto-Scroll" : "⏸ Pause Scrolling"}
        </button>

        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginLeft: "auto" }}>
          <button
            type="button"
            onClick={() => setFontPx(settings.fontPx - 4)}
            aria-label="Decrease text size"
            style={{ minHeight: "48px", padding: "6px 14px", fontSize: "20px" }}
          >
            A-
          </button>
          <span style={{ fontWeight: "bold" }}>{settings.fontPx}px</span>
          <button
            type="button"
            onClick={() => setFontPx(settings.fontPx + 4)}
            aria-label="Increase text size"
            style={{ minHeight: "48px", padding: "6px 14px", fontSize: "20px" }}
          >
            A+
          </button>
        </div>
      </div>

      <div
        className="teleprompter"
        ref={boxRef}
        tabIndex={0}
        aria-label="Single-Speaker Large Teleprompter"
        style={{
          fontSize: `${Math.min(76, settings.fontPx + 8)}px`,
          lineHeight: settings.lineSpacing + 0.2,
        }}
      >
        {utterances.length === 0 ? (
          <p className="empty">Press Start below. Spoken words will flow continuously here.</p>
        ) : (
          <div className="tele-flow">
            {utterances.map((u, i) => {
              const isLatest = i === utterances.length - 1;
              return (
                <span
                  key={u.id}
                  className={isLatest ? "tele-span tele-latest" : "tele-span"}
                  style={{
                    padding: "2px 6px",
                    borderRadius: "6px",
                    display: "inline",
                  }}
                >
                  {highlightAlertWords(u.text, settings.alertWords, settings.bionicReading)}{" "}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
