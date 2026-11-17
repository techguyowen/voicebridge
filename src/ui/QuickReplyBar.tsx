import { useState } from "react";
import { getHostSync } from "../engines/multiDeviceSync";

export type PingSignalKind = "repeat" | "slow-down" | "hold-on" | "chime-in";

export const PING_SIGNALS: Array<{ kind: PingSignalKind; label: string; text: string }> = [
  { kind: "repeat", label: "🔁 Please repeat that", text: "Please repeat that" },
  { kind: "slow-down", label: "🐢 Slower please", text: "Slower please" },
  { kind: "hold-on", label: "✋ Hold on, I'm reading", text: "Hold on, I'm reading" },
  { kind: "chime-in", label: "🙋 I want to chime in", text: "I want to chime in" },
];

export const QUICK_REPLY_PRESETS: string[] = [
  "🙋 What page or problem are we on?",
  "📝 Could you please write that on the board?",
  "🔁 Could you please repeat that?",
  "🐢 Could you please speak a little slower?",
  "👀 Please face me when speaking",
  "👍 I understand, thank you!",
];

export function speakText(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
      const utter =
        typeof SpeechSynthesisUtterance !== "undefined"
          ? new SpeechSynthesisUtterance(trimmed)
          : ({ text: trimmed } as SpeechSynthesisUtterance);
      window.speechSynthesis.speak(utter);
    }
  } catch {}
}

export function QuickReplyBar({
  inSheet = false,
  onClose,
}: {
  inSheet?: boolean;
  onClose?: () => void;
} = {}): React.JSX.Element {
  const [customText, setCustomText] = useState("");
  const [selected, setSelected] = useState("");
  const [bannerText, setBannerText] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [signalStatus, setSignalStatus] = useState<string | null>(null);

  const activeText = customText.trim() ? customText : selected;

  const handlePreset = (preset: string): void => {
    setSelected(preset);
    setCustomText(preset);
  };

  const handleSpeak = (): void => {
    speakText(activeText);
  };

  const handleShowBanner = (): void => {
    if (!activeText.trim()) return;
    setBannerText(activeText);
  };

  const handlePing = (kind: PingSignalKind, text: string): void => {
    getHostSync()?.sendSignal(kind, text);
    setSignalStatus("✓ Sent signal to phones");
    window.setTimeout(() => setSignalStatus(null), 2500);
  };

  const showBody = inSheet || !collapsed;

  return (
    <div className={`quick-reply-bar ${inSheet ? "in-sheet" : ""}`}>
      <div className="quick-reply-head">
        <span className="quick-reply-title">{inSheet ? "Say something" : "Quick Reply"}</span>
        {inSheet && onClose ? (
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close quick reply">
            ✕
          </button>
        ) : (
          !inSheet && (
            <button
              type="button"
              className="quick-reply-toggle"
              onClick={() => setCollapsed((c) => !c)}
              aria-expanded={!collapsed}
            >
              {collapsed ? "Show Quick Reply" : "Hide"}
            </button>
          )
        )}
      </div>

      {showBody && (
        <>
          <div className="quick-reply-presets" role="group" aria-label="Quick reply presets">
            {QUICK_REPLY_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`quick-reply-pill ${selected === preset ? "active" : ""}`}
                onClick={() => handlePreset(preset)}
                aria-pressed={selected === preset}
              >
                {preset}
              </button>
            ))}
          </div>

          <div className="quick-reply-custom">
            <label className="visually-hidden" htmlFor="quick-reply-input">
              Custom message
            </label>
            <input
              id="quick-reply-input"
              type="text"
              value={customText}
              onChange={(e) => {
                setCustomText(e.target.value);
                setSelected("");
              }}
              placeholder="Type a message…"
              aria-label="Custom message"
            />
            <button type="button" className="reply-action" onClick={handleSpeak} disabled={!activeText.trim()}>
              📢 Speak Aloud
            </button>
            <button type="button" className="reply-action" onClick={handleShowBanner} disabled={!activeText.trim()}>
              🖥 Show Big Banner
            </button>
          </div>

          <div className="ping-phones-section">
            <div className="ping-phones-title" id="ping-phones-label">
              📡 Ping Connected Phones
            </div>
            <div className="ping-phones-grid" role="group" aria-labelledby="ping-phones-label">
              {PING_SIGNALS.map((s) => (
                <button
                  key={s.kind}
                  type="button"
                  className="ping-phone-btn"
                  onClick={() => handlePing(s.kind, s.text)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {signalStatus && (
              <div className="ping-phones-status" role="status">
                {signalStatus}
              </div>
            )}
          </div>
        </>
      )}

      {bannerText && (
        <div className="big-banner-modal" role="dialog" aria-modal="true" aria-label="Big message card">
          <div className="big-banner-text" style={{ fontSize: "72px" }}>
            {bannerText}
          </div>
          <button
            type="button"
            className="big-banner-close"
            onClick={() => setBannerText(null)}
            autoFocus
          >
            Close Card
          </button>
        </div>
      )}
    </div>
  );
}
