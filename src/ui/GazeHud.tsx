import { useEffect, useState } from "react";
import { useStore } from "./store";

const ARROWS = {
  left: "◀",
  across: "▲",
  right: "▶",
  near: "▼",
} as const;

export function GazeHud(): React.JSX.Element | null {
  const {
    settings,
    speakers,
    utterances,
    listening,
    currentSpeakerId,
    lastSpeechTimestamp,
  } = useStore();

  const [, setTick] = useState(0);

  // Re-render when speech reaches the 6000ms stale threshold
  useEffect(() => {
    if (!lastSpeechTimestamp || !listening || !settings.showGazeHud) return;
    const elapsed = Date.now() - lastSpeechTimestamp;
    if (elapsed >= 6000) return;
    const remaining = 6000 - elapsed;
    const timer = setTimeout(() => {
      setTick((t) => t + 1);
    }, remaining + 50);
    return () => clearTimeout(timer);
  }, [lastSpeechTimestamp, listening, settings.showGazeHud]);

  // Hidden when disabled, not listening, diagnostics mode, or stale (>6000ms)
  if (!settings.showGazeHud || !listening) {
    return null;
  }
  if (settings.mode === "diagnostics") {
    return null;
  }
  if (!lastSpeechTimestamp || Date.now() - lastSpeechTimestamp > 6000) {
    return null;
  }

  // Active speaker resolution: latest utterance speaker, or currently active speaker turn
  const latestUtterance = utterances[utterances.length - 1];
  const activeSpeakerId = latestUtterance?.speakerId || currentSpeakerId;
  const activeSpeaker =
    speakers.find((s) => s.id === activeSpeakerId) ||
    speakers.find((s) => s.id === currentSpeakerId) ||
    (latestUtterance?.speakerId ? speakers.find((s) => s.id === latestUtterance.speakerId) : undefined);

  if (!activeSpeaker || !activeSpeaker.position || activeSpeaker.position === "none") {
    return null;
  }

  const position = activeSpeaker.position;
  const arrow = ARROWS[position];
  if (!arrow) {
    return null;
  }

  const accentColor = activeSpeaker.color || "var(--accent, #ffd400)";

  return (
    <aside
      className={`gaze-hud gaze-hud-${position}`}
      role="status"
      aria-label={`Active speaker: ${activeSpeaker.name} seated ${position}`}
      data-testid="gaze-hud"
      data-position={position}
      style={{
        ["--speaker-accent" as any]: accentColor,
      }}
    >
      <div className="gaze-hud-beacon" />
      <div className="gaze-hud-badge">
        <span className="gaze-hud-arrow" aria-hidden="true">{arrow}</span>
        <span className="gaze-hud-name">{activeSpeaker.name}</span>
      </div>
    </aside>
  );
}

export default GazeHud;
