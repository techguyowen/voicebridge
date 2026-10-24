import { useEffect } from "react";
import type { Speaker } from "../types";
import {
  getState,
  renameSpeaker,
  resetToAutoSpeaker,
  setActiveManualSpeaker,
  setActiveSpeaker,
  useStore,
} from "./store";

const POSITION_ARROWS: Record<string, string> = {
  left: "←",
  across: "↑",
  right: "→",
  near: "↓",
  none: "",
};

export function arrowForSpeaker(speaker: Speaker): string {
  if (!speaker.position || speaker.position === "none") return "";
  return POSITION_ARROWS[speaker.position] ?? "";
}

export interface TableRadarProps {
  onOpenQr?: () => void;
}

export function TableRadar({ onOpenQr }: TableRadarProps = {}): React.JSX.Element | null {
  const {
    speakers,
    settings,
    activeManualSpeakerId,
    currentSpeakerId,
    utterances,
    listening,
    audioLevel,
    lastSpeechTimestamp,
  } = useStore();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const handledEvent = e as KeyboardEvent & { __vbHandled?: boolean };
      if (handledEvent.__vbHandled) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const state = getState();
      if (state.settings.mode !== "table" || !state.settings.showTableRadar) return;
      if (e.key >= "1" && e.key <= "9") {
        const idx = Number(e.key) - 1;
        const speaker = state.speakers[idx];
        if (!speaker) return;
        handledEvent.__vbHandled = true;
        if (state.activeManualSpeakerId === speaker.id) {
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            try {
              navigator.vibrate(40);
            } catch {}
          }
          resetToAutoSpeaker();
        } else {
          setActiveSpeaker(speaker.id);
        }
      } else if (e.key === "0") {
        handledEvent.__vbHandled = true;
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate(40);
          } catch {}
        }
        resetToAutoSpeaker();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (settings.mode !== "table" || !settings.showTableRadar) return null;

  if (speakers.length === 0) {
    return (
      <div className="table-radar" role="group" aria-label="Who is speaking">
        <div className="table-radar-row">
          <button
            type="button"
            className="radar-pill radar-auto"
            onClick={onOpenQr}
            aria-label="No speakers connected. Tap to connect family phone mics via QR code"
            title="Scan QR code to connect family phones as table microphones"
          >
            📱 Connect phone mics / + Add speaker
          </button>
        </div>
      </div>
    );
  }

  const latest = utterances[utterances.length - 1];

  const handleAutoClick = (): void => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(40);
      } catch {}
    }
    resetToAutoSpeaker();
  };

  const handleSpeakerClick = (speaker: Speaker): void => {
    if (activeManualSpeakerId === speaker.id) {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          navigator.vibrate(40);
        } catch {}
      }
      resetToAutoSpeaker();
      return;
    }
    if (latest) {
      setActiveSpeaker(speaker.id);
    } else {
      setActiveManualSpeaker(speaker.id);
    }
  };

  return (
    <div className="table-radar" role="group" aria-label="Who is speaking">
      <div className="table-radar-row">
        <button
          type="button"
          className={`radar-pill radar-auto ${activeManualSpeakerId === null ? "active" : ""}`}
          onClick={handleAutoClick}
          aria-pressed={activeManualSpeakerId === null}
          title={
            activeManualSpeakerId !== null
              ? "Manual lock active — tap to return to Auto tracking"
              : "Auto tracking active — automatically following conversation"
          }
        >
          {activeManualSpeakerId !== null ? "🔓 Auto" : "✨ Auto"}
        </button>
        {speakers.map((speaker, i) => {
          const isLocked = activeManualSpeakerId === speaker.id;
          const isSpeaking =
            listening &&
            (Math.max(audioLevel.left, audioLevel.right) > 8 ||
              (lastSpeechTimestamp > 0 && Date.now() - lastSpeechTimestamp < 2500));
          const isCurrent = !isLocked && isSpeaking && currentSpeakerId === speaker.id;
          const arrow = arrowForSpeaker(speaker);
          return (
            <button
              key={speaker.id}
              type="button"
              className={`radar-pill ${isLocked ? "locked active" : ""} ${isCurrent ? "speaking" : ""}`}
              style={{ ["--pill-color" as string]: speaker.color }}
              onClick={() => handleSpeakerClick(speaker)}
              onDoubleClick={() => {
                const next = window.prompt(`Rename "${speaker.name}" to:`, speaker.name);
                if (next && next.trim()) renameSpeaker(speaker.id, next.trim());
              }}
              aria-pressed={isLocked}
              aria-label={`${speaker.name}${isLocked ? " (locked)" : ""}, press ${i + 1} to select, double-click to rename`}
              title={
                isLocked
                  ? `Locked on ${speaker.name} — tap to release • double-click to rename`
                  : `Press ${i + 1} — switch to ${speaker.name} • double-click to rename`
              }
            >
              <span className="radar-dot" style={{ backgroundColor: speaker.color }} aria-hidden="true" />
              {arrow ? <span aria-hidden="true">{arrow} </span> : null}
              {isLocked ? "🔒 " : ""}{speaker.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
