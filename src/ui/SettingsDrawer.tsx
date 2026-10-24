import { useEffect, useState } from "react";
import {
  addSpeaker,
  applyProfile,
  clear,
  regenerateRoomSecurity,
  removeSpeaker,
  renameSpeaker,
  setApiKey,
  setBionicReading,
  setCustomColors,
  setCustomVocabulary,
  setDeepgramKey,
  setDeviceId,
  setEngineChoice,
  setFinalOnlyMode,
  setFlashIntensity,
  setFlashMode,
  setFontFamily,
  setFontPx,
  setFontWeight,
  setHapticFeedback,
  setLetterSpacing,
  setLineSpacing,
  setNoiseGateThreshold,
  setReadingRuler,
  setSpeakerColor,
  setSpeakerFlash,
  setSpeakerPosition,
  setAlertWords,
  setShowTableRadar,
  setShowSpeakerLabels,
  setSpeechLanguage,
  setStereoMode,
  setTheme,
  setWordSpacing,
  setAlertChime,
  setShowQuickReply,
  setShowSignalMeter,
  setShowStarButtons,
  setShowOnGlassControls,
  setShowKeywordAlerts,
  setShowJumpToLive,
  useStore,
  type EngineChoice,
  type FlashIntensity,
  type FlashMode,
  type FontFamily,
  type FontWeight,
  type LetterSpacing,
  type SeatingPosition,
  type Theme,
  type WordSpacing,
} from "./store";

const THEMES: Array<{ id: Theme; label: string; desc: string }> = [
  { id: "yellow-on-black", label: "Yellow on Black", desc: "Highest contrast for macular/retinal low vision" },
  { id: "white-on-black", label: "White on Black", desc: "Crisp maximum contrast" },
  { id: "black-on-white", label: "Black on White", desc: "Classic daytime paper contrast" },
  { id: "cyan-on-black", label: "Cyan on Black", desc: "Cool high-contrast night theme" },
  { id: "amber-on-dark", label: "Amber on Dark Brown", desc: "Warm relaxing evening contrast" },
  { id: "custom", label: "Custom Palette", desc: "Define your own exact foreground & background" },
];

const FONTS: Array<{ id: FontFamily; label: string }> = [
  { id: "atkinson", label: "Atkinson Hyperlegible (Braille Institute)" },
  { id: "dyslexic", label: "Dyslexia Friendly" },
  { id: "lexend", label: "Lexend (Reading Fluency)" },
  { id: "system", label: "Clean Sans-Serif" },
];

const SEATING_OPTIONS: Array<{ id: SeatingPosition; label: string }> = [
  { id: "left", label: "← Left" },
  { id: "across", label: "↑ Across" },
  { id: "right", label: "→ Right" },
  { id: "near", label: "↓ Near" },
  { id: "none", label: "• None" },
];

const CUSTOM_PALETTE_PRESETS = [
  { name: "🌿 OLED Matrix Green", bg: "#000000", fg: "#00ff66", border: "#00ff66" },
  { name: "🍦 Soft Charcoal & Cream", bg: "#1a1a1a", fg: "#fffdd0", border: "#e5e0c8" },
  { name: "🍋 Navy & Lemon", bg: "#0a1128", fg: "#fff01f", border: "#fff01f" },
  { name: "⚡ Electric Magenta", bg: "#000000", fg: "#ff007f", border: "#ff007f" },
];

export type SettingsTab = "presets" | "themes" | "features" | "cloud" | "seating" | "visual" | "alerts" | "audio";

type KeyTestResult = { ok: boolean; message: string } | null;

function ApiKeyField({
  title,
  value,
  onChange,
  placeholder,
  testLabel,
  successMessage,
  helpHref,
  helpText,
  testRequest,
}: {
  title: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  testLabel: string;
  successMessage: string;
  helpHref: string;
  helpText: string;
  testRequest: (key: string) => Promise<Response>;
}): React.JSX.Element {
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<KeyTestResult>(null);

  const trimmed = value.trim();
  const configured = trimmed.length > 0;
  const snippet = configured ? `...${trimmed.slice(-4)}` : "";

  const handlePaste = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        onChange(text.trim());
        setResult(null);
      }
    } catch (err) {
      setResult({ ok: false, message: `Paste failed: ${err instanceof Error ? err.message : "clipboard unavailable"}` });
    }
  };

  const handleTest = async (): Promise<void> => {
    if (!configured) {
      setResult({ ok: false, message: "Enter a key first, then test the connection." });
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      const res = await testRequest(trimmed);
      if (res.ok) {
        setResult({ ok: true, message: successMessage });
      } else {
        const body = (await res.text()).slice(0, 200);
        setResult({ ok: false, message: `Error ${res.status}: ${body || res.statusText}` });
      }
    } catch (err) {
      setResult({ ok: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="key-field-box">
      <div className="key-field-head">
        <strong>{title}</strong>
        <span className={`key-status-badge ${configured ? "configured" : "empty"}`}>
          {configured ? `🟢 Saved Locally ${snippet}` : "⚪ No Key Entered"}
        </span>
      </div>
      <div className="key-input-row">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setResult(null);
          }}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck="false"
          aria-label={title}
        />
        <button type="button" className="key-action-btn" onClick={() => setShow((s) => !s)}>
          {show ? "🔒 Hide" : "👁 Show"}
        </button>
        <button type="button" className="key-action-btn" onClick={() => void handlePaste()}>
          📋 Paste
        </button>
        {configured && (
          <button
            type="button"
            className="key-action-btn"
            onClick={() => {
              onChange("");
              setResult(null);
            }}
          >
            ✕ Clear
          </button>
        )}
      </div>
      <button type="button" className="key-test-btn" onClick={() => void handleTest()} disabled={testing}>
        {testing ? "Testing…" : testLabel}
      </button>
      {result && (
        <div className={`key-test-result ${result.ok ? "success" : "failure"}`} role="status">
          {result.message}
        </div>
      )}
      <a href={helpHref} target="_blank" rel="noreferrer" className="key-help-link">
        {helpText}
      </a>
    </div>
  );
}

function testGemini(key: string): Promise<Response> {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
}

function testDeepgram(key: string): Promise<Response> {
  return fetch("https://api.deepgram.com/v1/projects", {
    headers: { Authorization: `Token ${key}` },
  });
}

const ENGINE_OPTIONS: Array<{ id: EngineChoice; title: string; desc: string }> = [
  { id: "auto", title: "🤖 Smart Auto Selection", desc: "Uses cloud AI (Gemini/Deepgram) when keys are entered, falls back to Web Speech" },
  { id: "web-speech", title: "🌐 Free Native Browser Speech", desc: "No key required • works offline • default" },
  { id: "gemini", title: "✨ Google Gemini Live Streaming", desc: "Requires a Gemini API key below" },
  { id: "deepgram", title: "⚡ Deepgram Nova-3 Diarization", desc: "Requires a Deepgram API key below" },
];

function EngineSelector({ current }: { current: EngineChoice }): React.JSX.Element {
  return (
    <div className="profile-grid">
      {ENGINE_OPTIONS.map((opt) => {
        const active = current === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            className={`profile-card-btn ${active ? "active" : ""}`}
            onClick={() => setEngineChoice(opt.id)}
            aria-pressed={active}
          >
            <div className="profile-title">
              {opt.title} {active && "✓"}
            </div>
            <div className="profile-desc">{opt.desc}</div>
          </button>
        );
      })}
    </div>
  );
}

export function SettingsDrawer({
  initialTab,
  onClose,
  onOpenQr,
  onOpenTutorial,
  onOpenTodGuide,
}: {
  initialTab?: SettingsTab;
  onClose: () => void;
  onOpenQr: () => void;
  onOpenTutorial?: () => void;
  onOpenTodGuide?: () => void;
}): React.JSX.Element {
  const { settings, speakers } = useStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab ?? "presets");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  // Custom theme colors state
  const [customBg, setCustomBg] = useState(settings.customColors?.bg ?? "#000000");
  const [customFg, setCustomFg] = useState(settings.customColors?.fg ?? "#ffd400");
  const [customBorder, setCustomBorder] = useState(settings.customColors?.border ?? "#ffd400");

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (settings.customColors) {
      setCustomBg(settings.customColors.bg);
      setCustomFg(settings.customColors.fg);
      setCustomBorder(settings.customColors.border);
    }
  }, [settings.customColors]);

  const updateCustomColor = (bg: string, fg: string, border: string) => {
    setCustomBg(bg);
    setCustomFg(fg);
    setCustomBorder(border);
    setCustomColors({
      bg,
      fg,
      border,
      panel: bg === "#000000" ? "#111111" : bg,
    });
  };

  useEffect(() => {
    async function getDevices() {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices(list.filter((d) => d.kind === "audioinput"));
      } catch {}
    }
    void getDevices();
  }, []);

  const onClear = (): void => {
    if (window.confirm("Clear all recorded transcript text for this session?")) clear();
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-label="Application Settings and Power Controls"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <h2>Controls & Settings</h2>
            <div style={{ fontSize: "16px", color: "var(--muted)" }}>Customize display, seating & audio</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close settings">
            ✕ Done
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="settings-nav-tabs">
          <button
            type="button"
            className={`settings-nav-tab ${activeTab === "presets" ? "active" : ""}`}
            onClick={() => setActiveTab("presets")}
          >
            ⚡ Presets
          </button>
          <button
            type="button"
            className={`settings-nav-tab ${activeTab === "themes" ? "active" : ""}`}
            onClick={() => setActiveTab("themes")}
          >
            🎨 Themes
          </button>
          <button
            type="button"
            className={`settings-nav-tab ${activeTab === "features" ? "active" : ""}`}
            onClick={() => setActiveTab("features")}
          >
            🎛 Features
          </button>
          <button
            type="button"
            className={`settings-nav-tab ${activeTab === "cloud" ? "active" : ""}`}
            onClick={() => setActiveTab("cloud")}
          >
            ☁ Cloud AI
          </button>
          <button
            type="button"
            className={`settings-nav-tab ${activeTab === "seating" ? "active" : ""}`}
            onClick={() => setActiveTab("seating")}
          >
            🍽 Seating
          </button>
          <button
            type="button"
            className={`settings-nav-tab ${activeTab === "visual" ? "active" : ""}`}
            onClick={() => setActiveTab("visual")}
          >
            👁 Visual
          </button>
          <button
            type="button"
            className={`settings-nav-tab ${activeTab === "alerts" ? "active" : ""}`}
            onClick={() => setActiveTab("alerts")}
          >
            🔔 Alerts
          </button>
          <button
            type="button"
            className={`settings-nav-tab ${activeTab === "audio" ? "active" : ""}`}
            onClick={() => setActiveTab("audio")}
          >
            🎙 Audio
          </button>
        </div>

        {/* TAB 1: 1-TAP PRESETS */}
        {activeTab === "presets" && (
          <div className="settings-section">
            <fieldset>
              <legend>1-Tap Quick Profiles</legend>
              <div className="profile-grid">
                <button
                  type="button"
                  className="profile-card-btn"
                  onClick={() => applyProfile("dinner")}
                >
                  <div className="profile-title">🍽 Dinner Table Setup</div>
                  <div className="profile-desc">Table Mode • 44px • Direction Cues • Medium Flash (Keeps your theme)</div>
                </button>

                <button
                  type="button"
                  className="profile-card-btn"
                  onClick={() => applyProfile("classroom")}
                >
                  <div className="profile-title">🏫 Classroom & Roger Loop</div>
                  <div className="profile-desc">Classroom Mode • 52px • Flowing Captions • No Speaker Labels • Clutter Free</div>
                </button>

                <button
                  type="button"
                  className="profile-card-btn"
                  onClick={() => applyProfile("evening")}
                >
                  <div className="profile-title">🌙 Evening & Dim Room</div>
                  <div className="profile-desc">40px • Subtle Glow • Low Eye Strain (Keeps your theme)</div>
                </button>

                <button
                  type="button"
                  className="profile-card-btn"
                  onClick={() => applyProfile("high-visibility")}
                >
                  <div className="profile-title">🔍 Maximum Visibility</div>
                  <div className="profile-desc">64px Giant Font • Bionic Reading • Heavy Black Weight • 2.0x Spacing</div>
                </button>
              </div>
            </fieldset>

            <div className="settings-card">
              <h3>📖 VoiceBridge Interactive Walkthrough</h3>
              <p style={{ margin: "4px 0 12px 0", color: "var(--muted)", fontSize: "16px" }}>
                Interactive student tutorial covering teleprompter scrolling, touch-to-hold, font scaling, bookmarking, and 1-tap copy.
              </p>
              <button
                type="button"
                className="tutorial-open-btn"
                onClick={() => {
                  onClose();
                  onOpenTutorial?.();
                }}
                style={{ width: "100%" }}
              >
                📖 Open Interactive Tutorial
              </button>
            </div>

            <div className="settings-card">
              <h3>👩‍🏫 TOD &amp; Paraprofessional Checklist</h3>
              <p style={{ margin: "4px 0 12px 0", color: "var(--muted)", fontSize: "16px" }}>
                Quick reference card for Teachers of the Deaf, educational audiologists, and classroom aides.
              </p>
              <button
                type="button"
                className="tod-open-btn"
                onClick={() => {
                  onClose();
                  onOpenTodGuide?.();
                }}
                style={{ width: "100%" }}
              >
                👩‍🏫 Open TOD Quick Reference Card
              </button>
            </div>

            <div className="settings-card ipad-setup-card">
              <h3>📱 Full-Screen iPad Setup (Add to Home Screen)</h3>
              <p style={{ margin: "4px 0 12px 0", color: "var(--muted)", fontSize: "16px" }}>
                Run VoiceBridge edge-to-edge as a distraction-free iPad app without Safari URL or tab bars:
              </p>
              <ol className="ipad-pwa-steps">
                <li>
                  Tap the Safari <strong>Share</strong> icon (square with arrow pointing up ⎋).
                </li>
                <li>
                  Scroll and tap <strong>Add to Home Screen</strong> (➕).
                </li>
                <li>
                  Tap <strong>Add</strong> in the top right.
                </li>
                <li>
                  Launch from home screen to hide Safari navigation bars and run distraction-free edge-to-edge!
                </li>
              </ol>
            </div>

            <div className="settings-card">
              <h3>📱 Connect Family Phone Microphones</h3>
              <p style={{ margin: "4px 0 12px 0", color: "var(--muted)", fontSize: "17px" }}>
                Generate a table QR code so family members can speak directly from their phones.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenQr();
                }}
                style={{ width: "100%" }}
              >
                Show Family Phone QR Code
              </button>
            </div>
          </div>
        )}

        {/* TAB: HIGH-CONTRAST THEMES & COLOR PALETTES */}
        {activeTab === "themes" && (
          <div className="settings-section">
            <div>
              <h3 style={{ margin: "0 0 4px" }}>🎨 High-Contrast Themes &amp; Color Palettes</h3>
              <p style={{ margin: "4px 0 14px", color: "var(--muted)", fontSize: "16px" }}>
                Engineered for low vision, macular degeneration, and photophobia. All themes update live across the entire display in real time.
              </p>
            </div>

            <div className="theme-grid">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`theme-card ${settings.theme === t.id ? "active" : ""}`}
                  onClick={() => setTheme(t.id)}
                  aria-pressed={settings.theme === t.id}
                >
                  <div className="theme-card-top">
                    <span className="theme-card-title">{t.label}</span>
                    {settings.theme === t.id && <span className="theme-active-pill">✓ Active</span>}
                  </div>
                  <div
                    className={`theme-swatch theme-swatch-${t.id}`}
                    style={t.id === "custom" ? { background: customBg, color: customFg, borderColor: customBorder } : undefined}
                  >
                    <span className="theme-swatch-sample">Aa Live Speech</span>
                  </div>
                  <div className="theme-card-desc">{t.desc}</div>
                  <div className="theme-contrast-tag">
                    {t.id === "black-on-white" || t.id === "white-on-black" || t.id === "yellow-on-black"
                      ? "21:1 Contrast • WCAG AAA"
                      : t.id === "cyan-on-black" || t.id === "amber-on-dark"
                      ? "18:1 Contrast • WCAG AAA"
                      : "Custom Contrast"}
                  </div>
                </button>
              ))}
            </div>

            {/* Real-Time Live Custom Palette Editor */}
            <div className="settings-card" style={{ marginTop: "8px" }}>
              <h4 style={{ margin: "0 0 6px", fontSize: "18px" }}>🛠 Live Custom Palette Editor</h4>
              <p style={{ margin: "0 0 10px", color: "var(--muted)", fontSize: "15px" }}>
                Select a 1-tap preset or fine-tune color pickers. Changes apply to the display instantly in real time.
              </p>
              <div className="custom-palette-presets">
                {CUSTOM_PALETTE_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    className="custom-preset-btn"
                    onClick={() => updateCustomColor(preset.bg, preset.fg, preset.border)}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap", marginTop: "12px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold" }}>
                  Background:
                  <input
                    type="color"
                    value={customBg}
                    onChange={(e) => updateCustomColor(e.target.value, customFg, customBorder)}
                    aria-label="Custom background color"
                  />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold" }}>
                  Text Color:
                  <input
                    type="color"
                    value={customFg}
                    onChange={(e) => updateCustomColor(customBg, e.target.value, customBorder)}
                    aria-label="Custom text color"
                  />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold" }}>
                  Border / Accent:
                  <input
                    type="color"
                    value={customBorder}
                    onChange={(e) => updateCustomColor(customBg, customFg, e.target.value)}
                    aria-label="Custom border color"
                  />
                </label>
              </div>
            </div>

            {/* Live Caption Reading Preview */}
            <div className="theme-preview-box">
              <div className="theme-preview-label">Live Display Preview</div>
              <div className="theme-preview-text" style={{ fontFamily: "var(--font-family)", fontSize: "28px" }}>
                Photosynthesis converts water and carbon dioxide into glucose and oxygen.
              </div>
            </div>
          </div>
        )}

        {/* TAB: FEATURE TOGGLES & DISTRACTION-FREE */}
        {activeTab === "features" && (
          <div className="settings-section">
            <fieldset>
              <legend>Feature Toggles &amp; Distraction-Free Mode</legend>
              <p style={{ margin: "0 0 12px", fontSize: "15px", color: "var(--muted)" }}>
                Turn off auxiliary controls and buttons to give the student a clean, minimal reading view.
              </p>
              <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0" }}>
                <input
                  type="checkbox"
                  checked={settings.showQuickReply}
                  onChange={(e) => setShowQuickReply(e.target.checked)}
                />
                <span><strong>Classroom Quick-Reply Cards:</strong> Show &quot;💬 Reply&quot; button and teacher question cards</span>
              </label>
              <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0" }}>
                <input
                  type="checkbox"
                  checked={settings.showOnGlassControls}
                  onChange={(e) => setShowOnGlassControls(e.target.checked)}
                />
                <span><strong>On-Glass Floating Controls:</strong> Show floating toolbar (A-, A+, mode buttons) in reading view</span>
              </label>
              <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0" }}>
                <input
                  type="checkbox"
                  checked={settings.showSignalMeter}
                  onChange={(e) => setShowSignalMeter(e.target.checked)}
                />
                <span><strong>Live Audio Signal Meter:</strong> Show Roger loop audio activity &amp; speaking status</span>
              </label>
              <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0" }}>
                <input
                  type="checkbox"
                  checked={settings.showStarButtons}
                  onChange={(e) => setShowStarButtons(e.target.checked)}
                />
                <span><strong>Sentence Bookmarks (★):</strong> Show star buttons on sentences and &quot;Star Last&quot; button</span>
              </label>
              <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0" }}>
                <input
                  type="checkbox"
                  checked={settings.showKeywordAlerts}
                  onChange={(e) => setShowKeywordAlerts(e.target.checked)}
                />
                <span><strong>Keyword Alert Popups:</strong> Show floating toast banner when name or keywords are detected</span>
              </label>
              <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0" }}>
                <input
                  type="checkbox"
                  checked={settings.showJumpToLive}
                  onChange={(e) => setShowJumpToLive(e.target.checked)}
                />
                <span><strong>Jump to Live Button:</strong> Show floating return button when scrolled away from live speech</span>
              </label>
              <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0" }}>
                <input
                  type="checkbox"
                  checked={settings.showSpeakerLabels}
                  onChange={(e) => setShowSpeakerLabels(e.target.checked)}
                />
                <span><strong>Show Speaker Labels &amp; Avatars:</strong> Turn off for Roger Loop or classroom lectures</span>
              </label>
              <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0" }}>
                <input
                  type="checkbox"
                  checked={settings.showTableRadar}
                  onChange={(e) => setShowTableRadar(e.target.checked)}
                />
                <span><strong>Show Dinner Table Radar:</strong> Speaker direction bar in Dinner Table mode</span>
              </label>
            </fieldset>
          </div>
        )}

        {/* TAB: CLOUD AI SETUP */}
        {activeTab === "cloud" && (
          <div className="settings-section">
            <fieldset>
              <legend>Speech Recognition Engine — tap to switch</legend>
              <EngineSelector current={settings.engineChoice} />
            </fieldset>

            <fieldset>
              <legend>API Keys</legend>
              <ApiKeyField
                title="Google Gemini API Key"
                value={settings.apiKey}
                onChange={setApiKey}
                placeholder="AIzaSy... — paste your Gemini key"
                testLabel="🧪 Test Gemini Connection"
                successMessage="✓ Connected to Google Gemini!"
                helpHref="https://aistudio.google.com/app/apikey"
                helpText="Get a free key at Google AI Studio →"
                testRequest={testGemini}
              />
              <ApiKeyField
                title="Deepgram API Key"
                value={settings.deepgramKey}
                onChange={setDeepgramKey}
                placeholder="Paste your Deepgram key"
                testLabel="🧪 Test Deepgram Connection"
                successMessage="✓ Connected to Deepgram!"
                helpHref="https://console.deepgram.com/"
                helpText="Get a key at the Deepgram console →"
                testRequest={testDeepgram}
              />
              <p className="key-privacy-note">
                🔒 Private by design: keys are stored 100% locally in this device&apos;s
                browser (localStorage) and are only ever sent directly to Google or
                Deepgram when you use that cloud engine. They never leave this device
                any other way.
              </p>
            </fieldset>
          </div>
        )}

        {/* TAB 2: SPATIAL SEATING & SPEAKERS */}
        {activeTab === "seating" && (
          <div className="settings-section">
            <fieldset>
              <legend>Table Seating & Direction Cues</legend>
              <p style={{ margin: "0 0 12px 0", fontSize: "16px", color: "var(--muted)" }}>
                Assign where each family member sits so she gets an instant visual gaze cue (←, ↑, →) on who spoke and where to look.
              </p>

              {speakers.length === 0 ? (
                <div style={{ padding: "16px", background: "var(--panel)", borderRadius: "8px", border: "1px dashed var(--border)", marginBottom: "16px" }}>
                  <p style={{ margin: 0, fontSize: "16px", color: "var(--muted)" }}>
                    No table speakers registered yet. When family members scan the QR code to connect their phones, they will appear here automatically. You can also add speakers manually below.
                  </p>
                </div>
              ) : (
                speakers.map((s) => (
                  <div key={s.id} className="seating-speaker-card">
                    <div className="speaker-header-row" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="color"
                        value={s.color}
                        onChange={(e) => setSpeakerColor(s.id, e.target.value)}
                        aria-label={`Color for ${s.name}`}
                      />
                      <input
                        type="text"
                        value={s.name}
                        onChange={(e) => renameSpeaker(s.id, e.target.value)}
                        aria-label={`Name for speaker ${s.id}`}
                        style={{ fontWeight: "bold", flex: 1 }}
                      />
                      <button
                        type="button"
                        className="key-action-btn"
                        onClick={() => removeSpeaker(s.id)}
                        title={`Remove ${s.name}`}
                        aria-label={`Remove speaker ${s.name}`}
                        style={{ color: "#ff5252" }}
                      >
                        × Remove
                      </button>
                    </div>

                    <div className="seating-buttons-row">
                      <span style={{ fontSize: "16px", fontWeight: "bold" }}>Seating:</span>
                      {SEATING_OPTIONS.map((pos) => (
                        <button
                          key={pos.id}
                          type="button"
                          className={`seating-btn ${s.position === pos.id ? "active" : ""}`}
                          onClick={() => setSpeakerPosition(s.id, pos.id)}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}

              <div style={{ marginTop: "16px" }}>
                <button
                  type="button"
                  className="key-action-btn"
                  onClick={() => addSpeaker(`Speaker ${speakers.length + 1}`)}
                  style={{ fontSize: "16px", padding: "10px 16px", fontWeight: "bold" }}
                >
                  + Add Speaker
                </button>
              </div>
            </fieldset>

            <fieldset style={{ marginTop: "24px" }}>
              <legend>Room Security &amp; Phone Microphones</legend>
              <p style={{ margin: "0 0 12px 0", fontSize: "16px", color: "var(--muted)" }}>
                Phones require this Room Code and PIN to connect and stream speech to this table display.
              </p>
              <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", alignItems: "center", marginBottom: "16px" }}>
                <div>
                  <span style={{ fontSize: "14px", color: "var(--muted)", display: "block" }}>Room Code:</span>
                  <strong style={{ fontSize: "20px", color: "var(--fg)" }}>{settings.roomCode}</strong>
                </div>
                <div>
                  <span style={{ fontSize: "14px", color: "var(--muted)", display: "block" }}>Passcode PIN:</span>
                  <strong style={{ fontSize: "20px", color: "var(--fg)", fontFamily: "monospace", letterSpacing: "2px" }}>
                    {settings.roomPin}
                  </strong>
                </div>
                <button
                  type="button"
                  className="key-action-btn"
                  onClick={() => regenerateRoomSecurity()}
                  style={{ fontSize: "15px", padding: "8px 14px" }}
                >
                  🔄 Regenerate Code &amp; PIN
                </button>
              </div>
            </fieldset>
          </div>
        )}

        {/* TAB 3: VISUAL & CONTRAST */}
        {activeTab === "visual" && (
          <div className="settings-section">
            <fieldset>
              <legend>Visual & Reading Aid</legend>
              <label className="slider-label">
                Text Size: <strong>{settings.fontPx}px</strong> (20px to 120px)
                <input
                  type="range"
                  min={20}
                  max={120}
                  step={2}
                  value={settings.fontPx}
                  onChange={(e) => setFontPx(Number(e.target.value))}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontWeight: "bold" }}>
                Font Family:
                <select
                  value={settings.fontFamily}
                  onChange={(e) => setFontFamily(e.target.value as FontFamily)}
                >
                  {FONTS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-row">
                <span>Word Spacing</span>
                <select
                  value={settings.wordSpacing}
                  onChange={(e) => setWordSpacing(e.target.value as WordSpacing)}
                >
                  <option value="normal">Normal</option>
                  <option value="wide">Wide (+0.25em)</option>
                  <option value="extra-wide">Extra Wide (+0.5em)</option>
                </select>
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontWeight: "bold" }}>
                  Weight:
                  <select
                    value={settings.fontWeight}
                    onChange={(e) => setFontWeight(e.target.value as FontWeight)}
                  >
                    <option value="normal">Normal</option>
                    <option value="bold">Bold (Recommended)</option>
                    <option value="extra-bold">Extra Bold</option>
                    <option value="black">Black / Heavy (900)</option>
                  </select>
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontWeight: "bold" }}>
                  Letter Spacing:
                  <select
                    value={settings.letterSpacing}
                    onChange={(e) => setLetterSpacing(e.target.value as LetterSpacing)}
                  >
                    <option value="normal">Normal</option>
                    <option value="wide">Spacious (+0.05em)</option>
                    <option value="extra-wide">Wide (+0.12em)</option>
                  </select>
                </label>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontWeight: "bold" }}>
                Line Spacing:
                <select
                  value={settings.lineSpacing}
                  onChange={(e) => setLineSpacing(Number(e.target.value))}
                >
                  <option value={1.3}>Compact (1.3x)</option>
                  <option value={1.6}>Standard (1.6x)</option>
                  <option value={2.0}>Spacious (2.0x)</option>
                  <option value={2.4}>Ultra Wide (2.4x)</option>
                </select>
              </label>

              <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
                <input
                  type="checkbox"
                  checked={settings.finalOnlyMode}
                  onChange={(e) => setFinalOnlyMode(e.target.checked)}
                />
                <span><strong>Final Sentences Only:</strong> Hide interim text to prevent fluttering</span>
              </label>

              <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
                <input
                  type="checkbox"
                  checked={settings.readingRuler}
                  onChange={(e) => setReadingRuler(e.target.checked)}
                />
                <span><strong>Reading Ruler:</strong> Spotlight bar on active line for visual tracking</span>
              </label>

              <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px" }}>
                <input
                  type="checkbox"
                  checked={settings.bionicReading}
                  onChange={(e) => setBionicReading(e.target.checked)}
                />
                <span><strong>Bionic Reading:</strong> Bold first letters of words</span>
              </label>
            </fieldset>

            <div className="settings-card" style={{ marginTop: "12px" }}>
              <h3>🎨 Contrast Themes &amp; Custom Colors</h3>
              <p style={{ margin: "4px 0 10px", color: "var(--muted)", fontSize: "16px" }}>
                Switch between Yellow on Black, White on Black, Cyan, Amber, or customize your own palette.
              </p>
              <button type="button" onClick={() => setActiveTab("themes")} style={{ width: "100%" }}>
                Open Themes &amp; Color Palettes Tab →
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: SENSORY ALERTS */}
        {activeTab === "alerts" && (
          <div className="settings-section">
            <fieldset>
              <legend>Speaker Turn Cues (DHH Alerts)</legend>
              <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input
                  type="checkbox"
                  checked={settings.speakerFlash}
                  onChange={(e) => setSpeakerFlash(e.target.checked)}
                />
                <span><strong>Visual Alert on Speaker Change</strong></span>
              </label>

              {settings.speakerFlash && (
                <>
                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontWeight: "bold" }}>
                    Alert Animation Style:
                    <select
                      value={settings.flashMode}
                      onChange={(e) => setFlashMode(e.target.value as FlashMode)}
                    >
                      <option value="border">Glow Border Pulse (Recommended)</option>
                      <option value="screen">Full Screen Subtle Flash</option>
                      <option value="banner">Banner Highlight Only</option>
                      <option value="off">Off</option>
                    </select>
                  </label>

                  <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontWeight: "bold" }}>
                    Alert Glow Intensity:
                    <select
                      value={settings.flashIntensity}
                      onChange={(e) => setFlashIntensity(e.target.value as FlashIntensity)}
                    >
                      <option value="subtle">Subtle (Soft glow for dim dinners)</option>
                      <option value="medium">Medium (Standard dining room)</option>
                      <option value="vivid">Vivid (High visibility peripheral alert)</option>
                    </select>
                  </label>
                </>
              )}

              <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" }}>
                <input
                  type="checkbox"
                  checked={settings.hapticFeedback}
                  onChange={(e) => setHapticFeedback(e.target.checked)}
                />
                <span><strong>Haptic Vibration Alert:</strong> Buzz tablet on speaker turn</span>
              </label>
            </fieldset>

            <fieldset>
              <legend>Own-Name &amp; Keyword Alert Radar</legend>
              <p style={{ margin: "0", fontSize: "16px", color: "var(--muted)" }}>
                Enter your name or important words (comma-separated) so the screen flashes and highlights whenever your name is spoken.
              </p>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontWeight: "bold" }}>
                Own-Name &amp; Keyword Alert Radar
                <input
                  type="text"
                  value={settings.alertWords}
                  onChange={(e) => setAlertWords(e.target.value)}
                  placeholder="e.g. Alex, dinner, help"
                  aria-label="Own-Name & Keyword Alert Radar"
                />
              </label>
              <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input
                  type="checkbox"
                  checked={settings.showTableRadar}
                  onChange={(e) => setShowTableRadar(e.target.checked)}
                />
                <span>
                  <strong>Show Dinner Table Radar:</strong> Speaker direction bar in Dinner Table mode
                </span>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={settings.alertChime}
                  onChange={(e) => setAlertChime(e.target.checked)}
                />
                <span><strong>Notification Chime:</strong> Play gentle audio chime when keywords are spoken</span>
              </label>
            </fieldset>
          </div>
        )}

        {/* TAB 5: AUDIO & ENGINES */}
        {activeTab === "audio" && (
          <div className="settings-section">
            <fieldset>
              <legend>Audio Routing & Hardware</legend>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontWeight: "bold" }}>
                Microphone Source:
                <select
                  value={settings.deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                >
                  <option value="">Default System / iPad Microphone</option>
                  {devices.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Microphone ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>

              <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" }}>
                <input
                  type="checkbox"
                  checked={settings.stereoMode}
                  onChange={(e) => setStereoMode(e.target.checked)}
                />
                <span>
                  <strong>DJI Mic 2-Channel Split:</strong> Separate Channel 0 (Left = Mic 1) & Channel 1 (Right = Mic 2)
                </span>
              </label>

              <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" }}>
                <input type="checkbox" checked={settings.showSpeakerLabels} onChange={(e) => setShowSpeakerLabels(e.target.checked)} />
                <span><strong>Show Speaker Labels & Avatars:</strong> Turn off for Roger Loop or classroom lectures</span>
              </label>

              <label className="slider-label" style={{ marginTop: "10px" }}>
                Dinner Table Noise Gate Threshold: <strong>{settings.noiseGateThreshold}%</strong>
                <input
                  type="range"
                  min={2}
                  max={35}
                  value={settings.noiseGateThreshold}
                  onChange={(e) => setNoiseGateThreshold(Number(e.target.value))}
                />
                <span style={{ fontSize: "14px", color: "var(--muted)" }}>
                  Higher values ignore silverware clinking on plates and background kitchen noise.
                </span>
              </label>
            </fieldset>

            <fieldset>
              <legend>Speech Recognition Engine</legend>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontWeight: "bold" }}>
                Recognition Engine:
                <select
                  value={settings.engineChoice}
                  onChange={(e) => setEngineChoice(e.target.value as EngineChoice)}
                >
                  <option value="auto">Automatic (Web Speech Free default)</option>
                  <option value="web-speech">Browser Native Speech (100% Free)</option>
                  <option value="gemini">Google Gemini Live WebSocket Streaming</option>
                  <option value="deepgram">Deepgram Nova-3 Diarization (Single Mic)</option>
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontWeight: "bold" }}>
                Spoken Language:
                <select
                  value={settings.speechLanguage}
                  onChange={(e) => setSpeechLanguage(e.target.value)}
                >
                  <option value="en-US">English (United States)</option>
                  <option value="en-GB">English (United Kingdom)</option>
                  <option value="en-CA">English (Canada)</option>
                  <option value="es-ES">Spanish</option>
                  <option value="fr-FR">French</option>
                </select>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontWeight: "bold" }}>
                Custom Family Names & Hotwords:
                <input
                  type="text"
                  value={settings.customVocabulary}
                  onChange={(e) => setCustomVocabulary(e.target.value)}
                  placeholder="e.g. Grandma, Sparky, Pythagoras, Mr. Smith"
                />
              </label>

              <div className="key-field-box">
                <div className="key-field-head">
                  <strong>☁ Cloud API Keys</strong>
                  <span
                    className={`key-status-badge ${settings.apiKey.trim() || settings.deepgramKey.trim() ? "configured" : "empty"}`}
                  >
                    {settings.apiKey.trim() || settings.deepgramKey.trim()
                      ? "🟢 Key Saved Locally"
                      : "⚪ No Key Entered"}
                  </span>
                </div>
                <p style={{ margin: "0", fontSize: "16px", color: "var(--muted)" }}>
                  Gemini and Deepgram keys are managed in the Cloud AI tab, with
                  show/hide, paste, and connection testing.
                </p>
                <button
                  type="button"
                  className="key-test-btn"
                  onClick={() => setActiveTab("cloud")}
                >
                  ☁ Enter API Keys in Cloud AI Tab →
                </button>
              </div>
            </fieldset>
          </div>
        )}

        <button type="button" className="danger" onClick={onClear} style={{ marginTop: "auto" }}>
          🗑 Clear Transcript History
        </button>
      </aside>
    </div>
  );
}
