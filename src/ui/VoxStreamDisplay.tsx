import { useEffect, useRef, useState } from "react";
import type { Utterance } from "../types";
import { highlightAlertWords } from "./TranscriptList";
import { copyNotesToClipboard, downloadTranscript } from "./export";
import {
  clampFont,
  setBionicReading,
  setFinalOnlyMode,
  setFontPx,
  setReadingRuler,
  starLatestUtterance,
  toggleStarUtterance,
  useStore,
} from "./store";

export function VoxStreamDisplay(): React.JSX.Element {
  const { utterances, settings, speakers, audioLevel, listening, rogerDisconnected } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const autoScrollRef = useRef(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const prevCountRef = useRef(utterances.length);
  const [copyToast, setCopyToast] = useState(false);

  useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  // Touch-to-hold scroll engine
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = (): void => {
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (dist > 45) {
        if (autoScrollRef.current) {
          autoScrollRef.current = false;
          setAutoScroll(false);
        }
      } else if (dist <= 15) {
        if (!autoScrollRef.current) {
          autoScrollRef.current = true;
          setAutoScroll(true);
          setUnreadCount(0);
        }
      }
    };

    const onWheel = (e: WheelEvent): void => {
      if (e.deltaY < 0) {
        if (autoScrollRef.current) {
          autoScrollRef.current = false;
          setAutoScroll(false);
        }
      }
    };

    const onTouchMove = (): void => {
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (dist > 30) {
        if (autoScrollRef.current) {
          autoScrollRef.current = false;
          setAutoScroll(false);
        }
      }
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    container.addEventListener("wheel", onWheel, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: true });

    return () => {
      container.removeEventListener("scroll", onScroll);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  // Smooth scroll using requestAnimationFrame when autoScroll is active and speech arrives
  useEffect(() => {
    if (autoScrollRef.current) {
      if (containerRef.current) {
        requestAnimationFrame(() => {
          if (containerRef.current && autoScrollRef.current) {
            containerRef.current.scrollTo({
              top: containerRef.current.scrollHeight,
              behavior: "smooth",
            });
          }
        });
      }
      prevCountRef.current = utterances.length;
    } else {
      if (utterances.length > prevCountRef.current) {
        const delta = utterances.length - prevCountRef.current;
        setUnreadCount((prev) => prev + delta);
        prevCountRef.current = utterances.length;
      }
    }
  }, [utterances]);

  const handleJumpToLive = (): void => {
    autoScrollRef.current = true;
    setAutoScroll(true);
    setUnreadCount(0);
    prevCountRef.current = utterances.length;
    if (containerRef.current) {
      requestAnimationFrame(() => {
        containerRef.current?.scrollTo({
          top: containerRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  };

  const finalUtterances = utterances.filter((u) => u.final);
  const interimUtterance = (!settings.finalOnlyMode && listening)
    ? utterances.find((u) => !u.final && u.text.trim().length > 0)
    : undefined;
  const hasInterim = Boolean(interimUtterance && interimUtterance.text.trim().length > 0);
  const isEmpty = finalUtterances.length === 0 && !hasInterim;

  let signalStatusText: string;
  let isSpeaking = false;
  if (rogerDisconnected) {
    signalStatusText = "⚠️ Disconnected";
  } else if (!listening) {
    signalStatusText = "⏸️ Ready";
  } else if (Math.max(audioLevel.left, audioLevel.right) > settings.noiseGateThreshold) {
    signalStatusText = "🎙️ Speaking";
    isSpeaking = true;
  } else {
    signalStatusText = "🎙️ Silent / Paused";
  }

  return (
    <div
      className="voxstream-display"
      ref={containerRef}
      style={{
        fontSize: `${settings.fontPx}px`,
        lineHeight: settings.lineSpacing,
      }}
    >
      {/* Floating On-Glass Controls */}
      {settings.showOnGlassControls !== false && (
        <div className="vox-floating-controls" role="toolbar" aria-label="Reading Controls">
          {settings.showSignalMeter !== false && (
            <div className="vox-signal-meter" role="status" aria-label="Audio Signal Status">
              <span className="signal-status-label">{signalStatusText}</span>
              {isSpeaking && (
                <span className="signal-bars" aria-hidden="true">
                  <span className="signal-bar bar-1" />
                  <span className="signal-bar bar-2" />
                  <span className="signal-bar bar-3" />
                  <span className="signal-bar bar-4" />
                </span>
              )}
            </div>
          )}
          {settings.showStarButtons !== false && (
            <button
              type="button"
              className="vox-ctrl-btn"
              onClick={starLatestUtterance}
              title="Bookmark last spoken sentence"
            >
              ⭐ Star Last
            </button>
          )}
          <button
            type="button"
            className="vox-ctrl-btn font-btn"
            onClick={() => setFontPx(clampFont(settings.fontPx - 4))}
            title="Decrease text size (A-)"
            aria-label="Decrease text size"
          >
            A-
          </button>
          <button
            type="button"
            className="vox-ctrl-btn font-btn"
            onClick={() => setFontPx(clampFont(settings.fontPx + 4))}
            title="Increase text size (A+)"
            aria-label="Increase text size"
          >
            A+
          </button>
          <button
            type="button"
            className={`vox-ctrl-btn toggle ${settings.finalOnlyMode ? "active" : ""}`}
            onClick={() => setFinalOnlyMode(!settings.finalOnlyMode)}
            title="Toggle Final Sentences Only (hides flutter)"
            aria-pressed={settings.finalOnlyMode}
          >
            ✨ Final Only
          </button>
          <button
            type="button"
            className={`vox-ctrl-btn toggle ${settings.readingRuler ? "active" : ""}`}
            onClick={() => setReadingRuler(!settings.readingRuler)}
            title="Toggle Reading Ruler Spotlight"
            aria-pressed={settings.readingRuler}
          >
            📏 Ruler
          </button>
          <button
            type="button"
            className={`vox-ctrl-btn toggle ${settings.bionicReading ? "active" : ""}`}
            onClick={() => setBionicReading(!settings.bionicReading)}
            title="Toggle Bionic Reading"
            aria-pressed={settings.bionicReading}
          >
            ⚡ Bionic
          </button>
          <button
            type="button"
            className="vox-ctrl-btn copy-btn"
            onClick={async () => {
              await copyNotesToClipboard(utterances, speakers);
              setCopyToast(true);
              setTimeout(() => setCopyToast(false), 3000);
            }}
            title="1-tap copy notes to clipboard"
            aria-label="Copy Notes to Clipboard"
          >
            📋 Copy
          </button>
          <button
            type="button"
            className="vox-ctrl-btn export-btn"
            onClick={() => downloadTranscript(utterances, speakers)}
            title="1-tap save notes"
            aria-label="Save Notes"
          >
            📥 Save Notes
          </button>
        </div>
      )}

      {copyToast && (
        <div className="clipboard-toast" role="status">
          <span>✓ Copied notes to clipboard!</span>
        </div>
      )}

      <div className="vox-sentences-stream">
        {isEmpty && (
          <div className="empty-indicator" role="status">
            Waiting for live speech...
          </div>
        )}

        {finalUtterances.map((u: Utterance, idx: number) => {
          const isPrevious = hasInterim || idx < finalUtterances.length - 1;
          const isActive = !hasInterim && idx === finalUtterances.length - 1;
          const showRuler = isActive && settings.readingRuler;

          const classNames = [
            "caption-sentence",
            isPrevious ? "previous" : "",
            showRuler ? "reading-ruler-spotlight" : "",
            u.starred ? "starred" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const speaker =
            settings.showSpeakerLabels && u.speakerId
              ? speakers.find((s) => s.id === u.speakerId)
              : undefined;

          return (
            <div key={u.id} className={classNames} data-utterance-id={u.id}>
              {settings.showStarButtons !== false && (
                <button
                  type="button"
                  className={"sentence-star-btn " + (u.starred ? "starred" : "")}
                  onClick={() => toggleStarUtterance(u.id)}
                  title={u.starred ? "Starred note (click to unstar)" : "Star this sentence for class notes"}
                  aria-label={u.starred ? "Unstar sentence" : "Star sentence"}
                >
                  {u.starred ? "★" : "☆"}
                </button>
              )}
              {speaker && (
                <span className="sentence-speaker-label" style={{ color: speaker.color }}>
                  {speaker.name}:{" "}
                </span>
              )}
              {highlightAlertWords(u.text, settings.alertWords, settings.bionicReading)}
            </div>
          );
        })}

        {hasInterim && interimUtterance && (
          <div
            key={interimUtterance.id}
            className={`caption-sentence interim ${settings.readingRuler ? "reading-ruler-spotlight" : ""}`}
            data-utterance-id={interimUtterance.id}
          >
            {settings.showSpeakerLabels && interimUtterance.speakerId && (
              <span
                className="sentence-speaker-label"
                style={{
                  color:
                    speakers.find((s) => s.id === interimUtterance.speakerId)?.color ?? "inherit",
                }}
              >
                {speakers.find((s) => s.id === interimUtterance.speakerId)?.name ?? "Speaker"}:{" "}
              </span>
            )}
            {highlightAlertWords(
              interimUtterance.text,
              settings.alertWords,
              settings.bionicReading
            )}
            <span className="interim-cursor" aria-hidden="true">
              ▍
            </span>
          </div>
        )}
      </div>

      {/* Floating Jump to Live Pill */}
      {settings.showJumpToLive !== false && !autoScroll && (
        <button
          type="button"
          className="jump-to-live-pill"
          onClick={handleJumpToLive}
          title="Jump to latest live speech"
          aria-label="Jump to Live"
        >
          Jump to Live (▼){unreadCount > 0 ? ` (${unreadCount})` : ""}
        </button>
      )}
    </div>
  );
}
export default VoxStreamDisplay;
