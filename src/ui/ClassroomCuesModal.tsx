import { useMemo, useState } from "react";
import { extractClassroomCues, type ClassroomCue } from "../engines/cueDetector";
import { useStore } from "./store";

export interface CueEntry extends ClassroomCue {
  utteranceId: string;
  speakerName?: string;
  timeLabel?: string;
  sourceText: string;
}

function formatTimeLabel(ms: number): string | undefined {
  if (!ms || ms < 1_000_000_000) return undefined;
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return undefined;
  }
}

export function ClassroomCuesModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { utterances, speakers, settings } = useStore();
  const [summary, setSummary] = useState<string[]>([]);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const finalized = useMemo(() => utterances.filter((u) => u.final), [utterances]);

  const cueEntries: CueEntry[] = useMemo(
    () =>
      finalized.flatMap((u) => {
        const speakerName = u.speakerId
          ? speakers.find((s) => s.id === u.speakerId)?.name
          : undefined;
        const timeLabel = formatTimeLabel(u.endMs || u.startMs);
        return extractClassroomCues(u.text).map((cue) => ({
          ...cue,
          utteranceId: u.id,
          speakerName,
          timeLabel,
          sourceText: u.text,
        }));
      }),
    [finalized, speakers]
  );

  const catchUp = useMemo(() => {
    const cutoff = Date.now() - 60_000;
    const recent = finalized.filter((u) => (u.endMs || u.startMs) > cutoff);
    return recent.length > 0 ? recent : finalized.slice(-5);
  }, [finalized]);

  const apiConfigured = settings.apiKey.trim().length > 0;

  const handleCopyCues = async (): Promise<void> => {
    const lines = cueEntries.map((c) => {
      const meta = [c.speakerName, c.timeLabel].filter(Boolean).join(" • ");
      return `${c.icon} ${c.label}${meta ? ` — ${meta}` : ""}`;
    });
    const text = lines.length > 0 ? `Classroom Cues:\n${lines.join("\n")}` : "No classroom cues yet.";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const handleSummarize = async (): Promise<void> => {
    const key = settings.apiKey.trim();
    if (!key || summarizing) return;
    setSummarizing(true);
    setSummaryError(null);
    setSummary([]);
    try {
      const cutoff = Date.now() - 120_000;
      const recent = finalized.filter((u) => (u.endMs || u.startMs) > cutoff);
      const windowUtterances = recent.length > 0 ? recent : finalized.slice(-10);
      const transcript = windowUtterances
        .map((u) => {
          const name = u.speakerId
            ? (speakers.find((s) => s.id === u.speakerId)?.name ?? "Speaker")
            : "Speaker";
          return `${name}: ${u.text}`;
        })
        .join("\n");
      if (!transcript.trim()) {
        setSummaryError("No recent speech to summarize yet.");
        return;
      }
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Summarize this classroom transcript excerpt for a student who zoned out. Reply with exactly 3 short bullet lines, no preamble:\n${transcript}`,
                  },
                ],
              },
            ],
          }),
        }
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(body ? `Summary failed (${res.status}): ${body.slice(0, 160)}` : `Summary failed (${res.status})`);
      }
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const rawText =
        data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const bullets = rawText
        .split(/\n+/)
        .map((line) => line.replace(/^[\s*•\-–—\d.)\]]+/, "").trim())
        .filter((line) => line.length > 0)
        .slice(0, 3);
      if (bullets.length === 0) {
        setSummaryError("No summary returned. Please try again.");
        return;
      }
      setSummary(bullets);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Summary failed. Please try again.");
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="cues-modal-backdrop" onClick={onClose}>
      <div
        className="cues-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Classroom cues and catch-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cues-modal-head">
          <h2>📌 Classroom Cues</h2>
          <button type="button" className="cues-modal-close" onClick={onClose} aria-label="Close cues" autoFocus>
            ✕
          </button>
        </div>

        <div className="cues-modal-body">
          <section aria-label="Extracted cues">
            <div className="cues-section-head">
              <h3>📌 Key Cues</h3>
              <button
                type="button"
                className="cues-copy-btn"
                onClick={() => void handleCopyCues()}
                disabled={cueEntries.length === 0}
              >
                📋 Copy Cues
              </button>
            </div>
            {copied && (
              <div className="cues-toast" role="status">
                ✓ Copied cues to clipboard!
              </div>
            )}
            {cueEntries.length === 0 ? (
              <p className="cues-empty">No cues yet — page numbers, due dates, and questions will appear here.</p>
            ) : (
              <ul className="cues-list">
                {cueEntries.map((cue, i) => (
                  <li key={`${cue.utteranceId}-${cue.label}-${i}`} className="cues-list-item">
                    <span className={`cue-badge cue-${cue.kind}`}>
                      {cue.icon} {cue.label}
                    </span>
                    {(cue.speakerName || cue.timeLabel) && (
                      <span className="cues-meta">
                        {[cue.speakerName, cue.timeLabel].filter(Boolean).join(" • ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Last 60 seconds catch-up">
            <h3>⏱ Last 60s Catch-Up</h3>
            {catchUp.length === 0 ? (
              <p className="cues-empty">No speech captured yet.</p>
            ) : (
              <ul className="cues-catchup-list">
                {catchUp.map((u) => {
                  const name = u.speakerId
                    ? (speakers.find((s) => s.id === u.speakerId)?.name ?? "Speaker")
                    : undefined;
                  return (
                    <li key={u.id} className="cues-catchup-item">
                      {name && <strong className="cues-catchup-speaker">{name}: </strong>}
                      <span>{u.text}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {apiConfigured && (
            <section aria-label="AI summary">
              <h3>✨ AI Summary</h3>
              <button
                type="button"
                className="cues-summarize-btn"
                onClick={() => void handleSummarize()}
                disabled={summarizing}
              >
                {summarizing ? "Summarizing…" : "✨ AI Summarize Last 2 Min"}
              </button>
              {summaryError && (
                <div className="cues-error" role="alert">
                  {summaryError}
                </div>
              )}
              {summary.length > 0 && (
                <ul className="cues-summary-list">
                  {summary.map((bullet, i) => (
                    <li key={i}>• {bullet}</li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default ClassroomCuesModal;
