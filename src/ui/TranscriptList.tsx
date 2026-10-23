import { useEffect, useRef, useState } from "react";
import type { Speaker, SpeakerId, Utterance } from "../types";
import { editText, relabel, toggleStarUtterance, useStore } from "./store";

export function renderBionic(text: string): React.JSX.Element {
  const words = text.split(" ");
  return (
    <>
      {words.map((word, i) => {
        if (!word) return null;
        const mid = Math.max(1, Math.ceil(word.length / 2));
        const boldPart = word.slice(0, mid);
        const rest = word.slice(mid);
        return (
          <span key={i} className="bionic-word">
            <strong style={{ fontWeight: 900 }}>{boldPart}</strong>
            {rest}{" "}
          </span>
        );
      })}
    </>
  );
}

function renderBionicWord(word: string): React.JSX.Element {
  const mid = Math.max(1, Math.ceil(word.length / 2));
  return (
    <span className="bionic-word">
      <strong style={{ fontWeight: 900 }}>{word.slice(0, mid)}</strong>
      {word.slice(mid)}
    </span>
  );
}

export function highlightAlertWords(text: string, alertWordsCsv: string, bionic: boolean): React.JSX.Element {
  const alerts = alertWordsCsv
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0);

  if (alerts.length === 0) {
    return bionic ? renderBionic(text) : <>{text}</>;
  }

  const parts = text.match(/[A-Za-z0-9']+|\s+|[^A-Za-z0-9'\s]+/g) ?? [text];

  return (
    <>
      {parts.map((part, i) => {
        const isWord = /^[A-Za-z0-9']+$/.test(part);
        if (!isWord) return <span key={i}>{part}</span>;
        const lower = part.toLowerCase();
        const matched = alerts.some((a) => lower === a || lower.startsWith(a));
        if (matched) {
          return (
            <mark key={i} className="alert-word-mark">
              {bionic ? renderBionicWord(part) : part}
            </mark>
          );
        }
        return bionic ? <span key={i}>{renderBionicWord(part)}</span> : <span key={i}>{part}</span>;
      })}
    </>
  );
}

export interface TurnBlock {
  speakerId: SpeakerId | null;
  utterances: Utterance[];
}

/**
 * Group consecutive utterances from the same speaker into one turn block.
 * Empty rows (cleared interim placeholders) are hidden.
 */
export function groupUtterancesByTurn(utterances: Utterance[]): TurnBlock[] {
  const blocks: TurnBlock[] = [];
  for (const u of utterances) {
    if (!u.text.trim()) continue;
    const last = blocks[blocks.length - 1];
    if (last && last.speakerId === u.speakerId) {
      last.utterances.push(u);
    } else {
      blocks.push({ speakerId: u.speakerId, utterances: [u] });
    }
  }
  return blocks;
}

const TURN_ARROWS: Record<string, { arrow: string; label: string }> = {
  left: { arrow: "←", label: "Left" },
  across: { arrow: "↑", label: "Across" },
  right: { arrow: "→", label: "Right" },
  near: { arrow: "↓", label: "Near" },
  none: { arrow: "", label: "" },
};

export function directionForSpeaker(speaker: Speaker | undefined): { arrow: string; label: string } {
  if (!speaker) return { arrow: "", label: "" };
  return TURN_ARROWS[speaker.position ?? "none"] ?? { arrow: "", label: "" };
}

/** Format an engine epoch timestamp as a short clock time; "" for relative/test stamps. */
export function formatTurnTime(ms: number | undefined): string {
  if (!ms || ms < 1_000_000_000_000) return "";
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

type SpeakerFilter = "all" | "starred" | SpeakerId;

export interface TranscriptListProps {
  showSpeakerLabels?: boolean;
}

export function TranscriptList({ showSpeakerLabels: propShowSpeakerLabels }: TranscriptListProps = {}): React.JSX.Element {
  const { utterances, speakers, settings } = useStore();
  const showSpeakerLabels = propShowSpeakerLabels !== undefined ? propShowSpeakerLabels : settings.showSpeakerLabels;
  const hideSpeaker = showSpeakerLabels === false || settings.mode === "classroom";
  const boxRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftSpeaker, setDraftSpeaker] = useState<SpeakerId>("");
  const [speakerFilter, setSpeakerFilter] = useState<SpeakerFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const onScroll = (): void => {
    const el = boxRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const last = utterances[utterances.length - 1];
  const lastKey = last ? `${last.id}:${last.text}:${last.final}` : "empty";

  useEffect(() => {
    const el = boxRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [utterances.length, lastKey]);

  const openEditor = (id: string, text: string, speakerId: SpeakerId | null): void => {
    setEditingId(id);
    setDraft(text);
    setDraftSpeaker(speakerId ?? "");
  };

  const saveEditor = (id: string, prevSpeaker: SpeakerId | null): void => {
    editText(id, draft);
    if (draftSpeaker && draftSpeaker !== prevSpeaker) relabel([id], draftSpeaker);
    setEditingId(null);
  };

  if (utterances.length === 0) {
    return (
      <div className="empty" style={{ fontSize: `${Math.min(32, settings.fontPx * 0.7)}px` }}>
        <div className="empty-glyph" aria-hidden="true">💬</div>
        <div>Tap Start and the conversation will flow here.</div>
      </div>
    );
  }

  const q = searchQuery.trim().toLowerCase();
  const filtered = utterances.filter((u) => {
    if (speakerFilter === "starred" && !u.starred) return false;
    if (speakerFilter !== "all" && speakerFilter !== "starred" && u.speakerId !== speakerFilter) return false;
    if (q && !u.text.toLowerCase().includes(q)) return false;
    return true;
  });
  const blocks = groupUtterancesByTurn(filtered);
  const filterActive = speakerFilter !== "all" || q.length > 0;

  return (
    <div className="transcript-wrap">
      {!settings.zenMode && (
        <div className="transcript-filter-strip">
          <button
            type="button"
            className={`filter-toggle ${filterActive ? "has-active" : ""}`}
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
          >
            <span aria-hidden="true">⌕</span> Find & filter
            {filterActive && <span className="filter-dot" aria-label="Filters active" />}
          </button>
          {filtersOpen && (
            <div className="transcript-filter-bar">
              <div className="filter-pills" role="group" aria-label="Filter by speaker">
                <button
                  type="button"
                  className={`filter-pill ${speakerFilter === "all" ? "active" : ""}`}
                  onClick={() => setSpeakerFilter("all")}
                  aria-pressed={speakerFilter === "all"}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`filter-pill ${speakerFilter === "starred" ? "active" : ""}`}
                  onClick={() => setSpeakerFilter("starred")}
                  aria-pressed={speakerFilter === "starred"}
                >
                  ★ Starred
                </button>
                {speakers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`filter-pill ${speakerFilter === s.id ? "active" : ""}`}
                    onClick={() => setSpeakerFilter(s.id)}
                    aria-pressed={speakerFilter === s.id}
                    style={{ ["--pill-color" as string]: s.color }}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
              <label className="visually-hidden" htmlFor="transcript-search">
                Search transcript
              </label>
              <input
                id="transcript-search"
                type="text"
                className="transcript-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transcript…"
                aria-label="Search transcript"
              />
            </div>
          )}
        </div>
      )}

      <div
        className="transcript"
        ref={boxRef}
        onScroll={onScroll}
        tabIndex={0}
        aria-label="Dinner Table Transcript"
        style={{ lineHeight: settings.lineSpacing }}
      >
        {filtered.length === 0 || blocks.length === 0 ? (
          <div className="empty">No lines match your search.</div>
        ) : (
          blocks.map((block) => {
            const speaker = block.speakerId ? speakers.find((s) => s.id === block.speakerId) : undefined;
            const dir = directionForSpeaker(speaker);
            const first = block.utterances[0]!;
            const timeLabel = formatTurnTime(first.startMs || first.endMs);
            const hasLive = block.utterances.some((u) => !u.final);
            const initial = (speaker?.name ?? "?").trim().charAt(0).toUpperCase() || "?";
            return (
              <article
                key={first.id}
                className={`turn-block ${hasLive ? "is-live" : ""}`}
                style={{ ["--turn-color" as string]: hideSpeaker ? "var(--border)" : (speaker?.color ?? "var(--border)") }}
              >
                {!hideSpeaker ? (
                  <header className="turn-header">
                    <span
                      className="turn-avatar"
                      style={speaker ? { backgroundColor: speaker.color } : undefined}
                      aria-hidden="true"
                    >
                      {initial}
                    </span>
                    <span className="turn-name">{speaker?.name ?? "Unknown Speaker"}</span>
                    {dir.arrow && (
                      <span className="turn-direction" title={dir.label ? `Seated ${dir.label}` : undefined}>
                        {dir.arrow} {dir.label}
                      </span>
                    )}
                    {timeLabel && <time className="turn-time">{timeLabel}</time>}
                    {hasLive && (
                      <span className="turn-live" role="status" aria-label="Speaking now">
                        <span className="live-dot" aria-hidden="true" />
                        live
                      </span>
                    )}
                  </header>
                ) : (timeLabel || hasLive) ? (
                  <header className="turn-header">
                    {timeLabel && <time className="turn-time">{timeLabel}</time>}
                    {hasLive && (
                      <span className="turn-live" role="status" aria-label="Speaking now">
                        <span className="live-dot" aria-hidden="true" />
                        live
                      </span>
                    )}
                  </header>
                ) : null}
                <div className="turn-body" style={{ fontSize: `${settings.fontPx}px` }}>
                  {block.utterances.map((u) => {
                    const isEditing = editingId === u.id;
                    return (
                      <span key={u.id} className={`turn-sentence ${u.final ? "" : "is-interim"}`}>
                        <button
                          type="button"
                          className="turn-text-btn"
                          onClick={() => (isEditing ? setEditingId(null) : openEditor(u.id, u.text, u.speakerId))}
                          aria-expanded={isEditing}
                          aria-label={u.final ? `Edit: ${u.text}` : `Interim text: ${u.text}`}
                        >
                          {highlightAlertWords(u.text, settings.alertWords, settings.bionicReading)}
                        </button>
                        <button
                          type="button"
                          className={`star-btn ${u.starred ? "starred" : ""}`}
                          onClick={() => toggleStarUtterance(u.id)}
                          aria-pressed={Boolean(u.starred)}
                          aria-label={u.starred ? `Unstar utterance: ${u.text}` : `Star utterance: ${u.text}`}
                          title={u.starred ? "Unstar" : "Star"}
                        >
                          {u.starred ? "★" : "☆"}
                        </button>
                        {isEditing && (
                          <span className="editor">
                            <label>
                              Edit Spoken Text:
                              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} />
                            </label>
                            <label>
                              Assign to Speaker:
                              <select value={draftSpeaker} onChange={(e) => setDraftSpeaker(e.target.value)}>
                                <option value="">Unknown</option>
                                {speakers.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <span className="editor-row">
                              <button type="button" onClick={() => saveEditor(u.id, u.speakerId)}>
                                Save Changes
                              </button>
                              <button type="button" onClick={() => setEditingId(null)}>
                                Cancel
                              </button>
                            </span>
                          </span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
