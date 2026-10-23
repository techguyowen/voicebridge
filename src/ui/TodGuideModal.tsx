import { useEffect } from "react";
import { applyProfile, useStore } from "./store";

interface TodGuideModalProps {
  onClose: () => void;
}

export function TodGuideModal({ onClose }: TodGuideModalProps): React.JSX.Element {
  const { settings } = useStore();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleApplyClassroom = (): void => {
    applyProfile("classroom");
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer tod-guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tod-guide-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(640px, 95vw)" }}
      >
        <div className="drawer-head">
          <div>
            <h2 id="tod-guide-title">👩‍🏫 TOD &amp; Paraprofessional Quick Guide</h2>
            <div style={{ fontSize: "16px", color: "var(--muted)" }}>
              Teacher of the Deaf, Educational Audiologist &amp; Aide Reference Card
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close guide">
            ✕ Done
          </button>
        </div>

        <div className="tod-guide-content">
          <p className="tod-guide-intro">
            VoiceBridge provides instant, high-contrast captions streamed directly from the teacher&apos;s
            Phonak Roger microphone with zero room noise. Follow this 6-step checklist for seamless class sessions:
          </p>

          <ol className="tod-checklist">
            <li className="tod-checklist-item">
              <div className="tod-item-badge">1</div>
              <div className="tod-item-body">
                <strong>Phonak Roger Neckloop Receiver Setup</strong>
                <p>
                  Connect the 3.5mm audio cable from the Phonak Roger Neckloop (or Roger Touchscreen / Roger Select dock)
                  into the student&apos;s iPad USB-C or Lightning headphone adapter.
                </p>
              </div>
            </li>

            <li className="tod-checklist-item">
              <div className="tod-item-badge">2</div>
              <div className="tod-item-body">
                <strong>Receiver Power &amp; Link Status</strong>
                <p>
                  Power on the Roger Neckloop receiver and ensure the green status LED is illuminated, indicating an
                  active 2.4GHz link to the teacher&apos;s transmitter.
                </p>
              </div>
            </li>

            <li className="tod-checklist-item">
              <div className="tod-item-badge">3</div>
              <div className="tod-item-body">
                <strong>Select Classroom Mode</strong>
                <p>
                  Classroom mode uses 52px high-contrast Atkinson Hyperlegible text, uncluttered teleprompter flow, and
                  hides speaker tags to maximize readability.
                </p>
                {settings.mode !== "classroom" && (
                  <button
                    type="button"
                    className="tod-action-btn"
                    onClick={handleApplyClassroom}
                  >
                    ⚡ Switch to Classroom Mode Now
                  </button>
                )}
                {settings.mode === "classroom" && (
                  <span className="tod-active-pill">✓ Classroom Mode Active</span>
                )}
              </div>
            </li>

            <li className="tod-checklist-item">
              <div className="tod-item-badge">4</div>
              <div className="tod-item-body">
                <strong>Check Teacher Transmitter &amp; Mute Alert</strong>
                <p>
                  Ensure the teacher wears the Roger Touchscreen mic 6–8 inches below the chin and un-mutes.
                  VoiceBridge automatically detects silence: if no audio is received for 45s, a silence banner alerts
                  the student or aide to check the teacher&apos;s microphone.
                </p>
              </div>
            </li>

            <li className="tod-checklist-item">
              <div className="tod-item-badge">5</div>
              <div className="tod-item-body">
                <strong>Student Note Taking &amp; Bookmarking</strong>
                <p>
                  The student can tap the <strong>★</strong> icon beside any sentence or press <strong>⭐ Star Last</strong>
                  on the floating toolbar to bookmark key formulas, definitions, or homework assignments.
                </p>
              </div>
            </li>

            <li className="tod-checklist-item">
              <div className="tod-item-badge">6</div>
              <div className="tod-item-body">
                <strong>1-Tap Copy Notes at End of Class</strong>
                <p>
                  When class finishes, tap <strong>📋 Copy Notes</strong> in the top bar or floating toolbar to copy the
                  entire lesson (or starred highlights) directly into the student&apos;s Google Docs or Apple Notes with 1 tap.
                </p>
              </div>
            </li>
          </ol>

          <div className="tod-tip-box">
            💡 <strong>iPad Full-Screen Tip:</strong> Add VoiceBridge to the iPad Home Screen via Safari Share → Add to
            Home Screen to eliminate browser address bars for a distraction-free experience.
          </div>
        </div>

        <button type="button" className="primary-btn" onClick={onClose} style={{ marginTop: "16px", width: "100%" }}>
          Close Guide
        </button>
      </aside>
    </div>
  );
}
export default TodGuideModal;
