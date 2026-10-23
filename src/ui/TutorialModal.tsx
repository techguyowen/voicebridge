import { useEffect, useState } from "react";

interface TutorialModalProps {
  onClose: () => void;
  onOpenTodGuide?: () => void;
}

interface TutorialStep {
  title: string;
  icon: string;
  subtitle: string;
  description: string;
  tip?: string;
  preview?: React.JSX.Element;
}

export function TutorialModal({ onClose, onOpenTodGuide }: TutorialModalProps): React.JSX.Element {
  const [currentStep, setCurrentStep] = useState(0);

  const steps: TutorialStep[] = [
    {
      title: "Classroom Teleprompter",
      icon: "🏫",
      subtitle: "Effortless, continuous lecture captions",
      description:
        "Speech from your teacher flows smoothly upward line-by-line like an accessible teleprompter. Interim words finalize automatically without fluttering or jumping, letting you follow class discussions naturally.",
      tip: "Classroom mode automatically hides speaker avatars to maximize reading area and eliminate visual clutter.",
      preview: (
        <div className="tutorial-preview-screen">
          <div className="tutorial-fake-caption">The Pythagorean theorem states that a² + b² = c² for any right triangle.</div>
          <div className="tutorial-fake-caption active">Next, let&apos;s calculate the hypotenuse when a=3 and b=4... <span className="tutorial-cursor">▍</span></div>
        </div>
      ),
    },
    {
      title: "Touch-to-Hold Scrolling",
      icon: "👆",
      subtitle: "Pause scrolling anytime to review at your pace",
      description:
        "Touch the screen or scroll up at any moment to freeze auto-scrolling. You can comfortably re-read definitions, equations, or teacher instructions without losing new text. When you are ready, tap 'Jump to Live (▼)' to resume.",
      tip: "The Jump to Live button shows an unread counter indicating how many new sentences arrived while you were reading.",
      preview: (
        <div className="tutorial-preview-screen centered">
          <div className="tutorial-jump-demo">
            <span>Jump to Live (▼) (3)</span>
          </div>
        </div>
      ),
    },
    {
      title: "Contrast & Font Scaling",
      icon: "🎨",
      subtitle: "Crisp 21:1 contrast and text up to 120px",
      description:
        "Switch between 5 high-contrast WCAG AAA palettes (Yellow on Black, White on Black, Paper, Cyan, Amber) or customize your own colors. Use the A- / A+ buttons to scale text size from 20px all the way up to 120px.",
      tip: "Atkinson Hyperlegible and Dyslexie fonts are built-in to enhance letter distinction and reading comfort.",
      preview: (
        <div className="tutorial-preview-screen row">
          <span className="tutorial-swatch yob">Yellow</span>
          <span className="tutorial-swatch wob">White</span>
          <span className="tutorial-swatch bow">Paper</span>
          <span className="tutorial-swatch cyan">Cyan</span>
          <span className="tutorial-swatch amber">Amber</span>
        </div>
      ),
    },
    {
      title: "Bookmarking Key Notes",
      icon: "⭐",
      subtitle: "Save key points for homework and study",
      description:
        "Tap the ★ icon next to any sentence on screen, or tap '⭐ Star Last' on the floating toolbar to instantly bookmark important formulas, exam hints, and assignments.",
      tip: "Starred sentences are highlighted with a golden outline and can be exported separately.",
      preview: (
        <div className="tutorial-preview-screen">
          <div className="tutorial-fake-caption starred">
            <span className="tutorial-star">★</span>
            <span>Homework: Complete problems 1 through 15 on page 142 by Friday.</span>
          </div>
        </div>
      ),
    },
    {
      title: "1-Tap Copy Notes",
      icon: "📋",
      subtitle: "Instant clipboard copy for Google Docs & Notes",
      description:
        "At the end of class, tap '📋 Copy Notes' in the top bar or floating toolbar. Your notes are immediately copied to your clipboard with 1 tap—no AirDrop or complicated sharing menus required. Paste directly into Google Docs or Apple Notes!",
      tip: "If you have starred sentences, VoiceBridge also lets you copy just your starred highlights in 1 tap.",
      preview: (
        <div className="tutorial-preview-screen centered">
          <div className="tutorial-copy-badge">✓ Copied notes to clipboard!</div>
        </div>
      ),
    },
    {
      title: "Classroom Quick Replies",
      icon: "💬",
      subtitle: "Raise your hand or ask questions without speaking",
      description:
        "Tap '💬 Reply' in the dock to open large 72px question cards. Show your screen to your teacher or aide: 'Can you repeat that?', 'Please write on the board', or 'I have a question'.",
      tip: "Great for fast communication during quiet study time or lectures.",
      preview: (
        <div className="tutorial-preview-screen centered">
          <div className="tutorial-reply-card">🙋 &quot;Could you please repeat that?&quot;</div>
        </div>
      ),
    },
    {
      title: "Phonak Roger Loop Audio",
      icon: "🎙",
      subtitle: "Direct wireless transmitter feed with zero room noise",
      description:
        "Connect the Phonak Roger Neckloop receiver to your iPad via a 3.5mm adapter to stream pristine teacher speech. VoiceBridge monitors silence: if the teacher's mic is muted or powered off for 45 seconds, an alert appears automatically.",
      tip: "Check that the Roger Neckloop power LED is green before class begins.",
      preview: (
        <div className="tutorial-preview-screen centered column">
          <div className="tutorial-roger-badge">🎙 Roger Loop • Listening</div>
          {onOpenTodGuide && (
            <button
              type="button"
              className="tutorial-link-btn"
              onClick={() => {
                onClose();
                onOpenTodGuide();
              }}
            >
              👩‍🏫 Open TOD &amp; Paraprofessional Checklist →
            </button>
          )}
        </div>
      ),
    },
  ];

  const totalSteps = steps.length;
  const step = steps[currentStep];

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentStep((prev) => Math.max(prev - 1, 0));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, totalSteps]);

  const handleNext = (): void => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = (): void => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer tutorial-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(640px, 95vw)" }}
      >
        <div className="drawer-head">
          <div>
            <h2 id="tutorial-modal-title">📖 VoiceBridge Student Walkthrough</h2>
            <div style={{ fontSize: "16px", color: "var(--muted)" }}>
              Step {currentStep + 1} of {totalSteps}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close tutorial">
            ✕ Done
          </button>
        </div>

        {/* Step Progress Dots */}
        <div className="tutorial-step-dots" role="tablist" aria-label="Tutorial steps">
          {steps.map((s, idx) => (
            <button
              key={s.title}
              type="button"
              role="tab"
              aria-selected={idx === currentStep}
              className={`step-dot ${idx === currentStep ? "active" : ""} ${idx < currentStep ? "visited" : ""}`}
              onClick={() => setCurrentStep(idx)}
              title={`Step ${idx + 1}: ${s.title}`}
              aria-label={`Step ${idx + 1}: ${s.title}`}
            >
              <span className="dot-num">{idx + 1}</span>
            </button>
          ))}
        </div>

        {/* Current Step Card */}
        <div className="tutorial-step-card">
          <div className="tutorial-step-header">
            <span className="tutorial-step-icon" aria-hidden="true">
              {step.icon}
            </span>
            <div>
              <h3 className="tutorial-step-title">{step.title}</h3>
              <div className="tutorial-step-sub">{step.subtitle}</div>
            </div>
          </div>

          <p className="tutorial-step-desc">{step.description}</p>

          {step.preview && <div className="tutorial-preview-wrapper">{step.preview}</div>}

          {step.tip && (
            <div className="tutorial-step-tip">
              💡 <strong>Pro Tip:</strong> {step.tip}
            </div>
          )}
        </div>

        {/* Footer Navigation Controls */}
        <div className="tutorial-footer-actions">
          <button
            type="button"
            className="tutorial-nav-btn secondary"
            onClick={handlePrev}
            disabled={currentStep === 0}
            aria-label="Previous step"
          >
            ← Back
          </button>

          <span className="tutorial-step-counter">
            {currentStep + 1} / {totalSteps}
          </span>

          <button
            type="button"
            className="tutorial-nav-btn primary"
            onClick={handleNext}
            aria-label={currentStep === totalSteps - 1 ? "Finish walkthrough" : "Next step"}
          >
            {currentStep === totalSteps - 1 ? "✓ Done" : "Next →"}
          </button>
        </div>
      </aside>
    </div>
  );
}
export default TutorialModal;
