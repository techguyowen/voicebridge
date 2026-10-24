import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioSource, TranscriptionEngine } from "./types";
import { AudioDiagnostics } from "./ui/AudioDiagnostics";
import { Controls } from "./ui/Controls";
import { ExportButtons } from "./ui/ExportButtons";
import { PhoneTransmitter } from "./ui/PhoneTransmitter";
import { QrModal } from "./ui/QrModal";
import { SettingsDrawer, type SettingsTab } from "./ui/SettingsDrawer";
import { QuickReplyBar } from "./ui/QuickReplyBar";
import { SpotlightBanner } from "./ui/SpotlightBanner";
import { TableRadar, arrowForSpeaker } from "./ui/TableRadar";
import { TranscriptList } from "./ui/TranscriptList";
import { VoxStreamDisplay } from "./ui/VoxStreamDisplay";
import { TutorialModal } from "./ui/TutorialModal";
import { TodGuideModal } from "./ui/TodGuideModal";
import { copyNotesToClipboard, downloadTranscript } from "./ui/export";
import { createEngine } from "./ui/engineFactory";
import { MultiDeviceSync } from "./engines/multiDeviceSync";
import {
  addOrUpdateUtterance,
  clearInterimUtterances,
  getState,
  relabel,
  setActiveManualSpeaker,
  setActiveSpeaker,
  setFontPx,
  setListening,
  setMode,
  setRogerDisconnected,
  setShowSpeakerLabels,
  setStatus,
  setTheme,
  setZenMode,
  updateAudioLevel,
  upsertSpeaker,
  useStore,
  type Theme,
} from "./ui/store";
import { useWakeLock } from "./ui/wakeLock";

const THEME_CYCLE: Theme[] = [
  "yellow-on-black",
  "white-on-black",
  "amber-on-dark",
  "cyan-on-black",
  "black-on-white",
];

const THEME_SHORT: Record<Theme, string> = {
  "yellow-on-black": "Yellow",
  "white-on-black": "White",
  "amber-on-dark": "Amber",
  "cyan-on-black": "Cyan",
  "black-on-white": "Paper",
  custom: "Custom",
};

export default function App(): React.JSX.Element {
  const {
    settings,
    status,
    listening,
    utterances,
    speakers,
    flashActive,
    currentSpeakerId,
    audioLevel,
    rogerDisconnected,
    lastAlertMatch,
  } = useStore();
  const [drawerOpen, setDrawerOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("settings") === "1";
  });
  const [drawerTab, setDrawerTab] = useState<SettingsTab>(() => {
    if (typeof window === "undefined") return "presets";
    const t = new URLSearchParams(window.location.search).get("tab");
    const validTabs: SettingsTab[] = ["presets", "themes", "features", "cloud", "seating", "visual", "alerts", "audio"];
    return validTabs.includes(t as SettingsTab) ? (t as SettingsTab) : "presets";
  });
  const [qrOpen, setQrOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const engineRef = useRef<TranscriptionEngine | null>(null);
  const lastAlertTimestampRef = useRef<number>(0);
  const [alertToastVisible, setAlertToastVisible] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("tutorial") === "1";
  });
  const [todGuideOpen, setTodGuideOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("guide") === "1";
  });
  const [copyToastText, setCopyToastText] = useState<string | null>(null);
  const [rogerSilenceWarning, setRogerSilenceWarning] = useState(false);
  const [rogerSilenceDismissed, setRogerSilenceDismissed] = useState(false);
  const lastSoundTimeRef = useRef<number>(Date.now());
  useWakeLock(listening);

  // Keyword Alert Chime and Toast Banner
  useEffect(() => {
    if (lastAlertMatch && Date.now() - lastAlertMatch.timestamp < 7000) {
      setAlertToastVisible(true);
      if (lastAlertMatch.timestamp !== lastAlertTimestampRef.current) {
        lastAlertTimestampRef.current = lastAlertMatch.timestamp;
        if (settings.alertChime) {
          try {
            const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            if (AudioCtx) {
              const ctx = new AudioCtx();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = "sine";
              osc.frequency.setValueAtTime(587.33, ctx.currentTime);
              osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
              gain.gain.setValueAtTime(0.15, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.start();
              osc.stop(ctx.currentTime + 0.4);
              setTimeout(() => {
                void ctx.close();
              }, 500);
            }
          } catch {}
        }
      }
      const remaining = 7000 - (Date.now() - lastAlertMatch.timestamp);
      const timer = setTimeout(() => {
        setAlertToastVisible(false);
      }, Math.max(100, remaining));
      return () => clearTimeout(timer);
    } else {
      setAlertToastVisible(false);
    }
  }, [lastAlertMatch, settings.alertChime]);

  // Roger loop disconnect detection: monitor device changes and track termination
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;

    const onDeviceChange = async (): Promise<void> => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const selectedId = getState().settings.deviceId;
        const audioInputs = devices.filter((d) => d.kind === "audioinput");
        if (selectedId) {
          if (!audioInputs.some((d) => d.deviceId === selectedId)) {
            setRogerDisconnected(true);
          } else {
            setRogerDisconnected(false);
          }
        } else if (getState().listening && audioInputs.length === 0) {
          setRogerDisconnected(true);
        }
      } catch {
        // safely ignore
      }
    };

    navigator.mediaDevices.addEventListener?.("devicechange", onDeviceChange);
    const prevOnDeviceChange = navigator.mediaDevices.ondevicechange;
    navigator.mediaDevices.ondevicechange = (ev) => {
      void onDeviceChange();
      if (prevOnDeviceChange) prevOnDeviceChange.call(navigator.mediaDevices, ev);
    };

    let restoreGUM: (() => void) | undefined;
    if (navigator.mediaDevices.getUserMedia) {
      const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await origGetUserMedia(constraints);
        stream.getAudioTracks().forEach((track) => {
          track.addEventListener("ended", () => {
            setRogerDisconnected(true);
          });
          const origOnEnded = track.onended;
          track.onended = (ev) => {
            setRogerDisconnected(true);
            if (origOnEnded) origOnEnded.call(track, ev);
          };
        });
        return stream;
      };
      restoreGUM = () => {
        navigator.mediaDevices.getUserMedia = origGetUserMedia;
      };
    }

    return () => {
      navigator.mediaDevices.removeEventListener?.("devicechange", onDeviceChange);
      navigator.mediaDevices.ondevicechange = prevOnDeviceChange;
      if (restoreGUM) restoreGUM();
    };
  }, []);

  // Check if current device is a mobile phone transmitter joined via QR
  const urlParams = new URLSearchParams(window.location.search);
  const isPhoneTransmitter = urlParams.get("role") === "mic" || urlParams.get("mode") === "mic";

  // Immediately purge any legacy stuck interim utterances on mount
  useEffect(() => {
    clearInterimUtterances();
  }, []);

  // URL mode initialization (e.g. ?mode=classroom for direct lecture access)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const m = params.get("mode");
    if (m === "classroom" || m === "solo" || m === "table" || m === "diagnostics") {
      setMode(m);
      if (m === "classroom") {
        setShowSpeakerLabels(false);
      }
    }
  }, []);

  // Multi-device sync: receive speech from family phones joined at table
  useEffect(() => {
    if (isPhoneTransmitter) return;
    const sync = new MultiDeviceSync(settings.roomCode, { isHost: true, pin: settings.roomPin });
    const unbind = sync.onMessage((msg) => {
      // Check: If msg.pin !== settings.roomPin, ignore/drop the packet.
      const hostPin = (settings.roomPin || "").trim().toLowerCase();
      const msgPin = (msg.pin || "").trim().toLowerCase();
      if (hostPin && msgPin !== hostPin) return;

      const speakerId = msg.utterance?.speakerId || (msg.senderName ? msg.senderName.toLowerCase().replace(/\s+/g, "_") : "family_member");
      const speakerName = msg.senderName || (msg.utterance?.speakerId ? msg.utterance.speakerId : "Family Member");

      if (msg.type === "join" || msg.type === "utterance") {
        upsertSpeaker({
          id: speakerId,
          name: speakerName,
          color: msg.senderColor || "#4fc3f7",
          position: "none",
        });
      }

      if (msg.type === "utterance" && msg.utterance) {
        addOrUpdateUtterance({
          ...msg.utterance,
          speakerId: msg.utterance.speakerId || speakerId,
        });
      }
    });
    return () => {
      unbind();
      sync.destroy();
    };
  }, [settings.roomCode, settings.roomPin, isPhoneTransmitter]);

  // Apply theme, font, weight, spacing, and custom colors to root document
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.font = settings.fontFamily;
    root.dataset.weight = settings.fontWeight;
    root.dataset.spacing = settings.letterSpacing;
    root.dataset.wordSpacing = settings.wordSpacing;

    if (settings.theme === "custom" && settings.customColors) {
      root.style.setProperty("--bg", settings.customColors.bg);
      root.style.setProperty("--fg", settings.customColors.fg);
      root.style.setProperty("--border", settings.customColors.border);
      root.style.setProperty("--panel", settings.customColors.panel);
      root.style.setProperty("--btn-bg", settings.customColors.border);
      root.style.setProperty("--btn-fg", settings.customColors.bg);
    } else {
      root.style.removeProperty("--bg");
      root.style.removeProperty("--fg");
      root.style.removeProperty("--border");
      root.style.removeProperty("--panel");
      root.style.removeProperty("--btn-bg");
      root.style.removeProperty("--btn-fg");
    }
  }, [settings.theme, settings.fontFamily, settings.fontWeight, settings.letterSpacing, settings.wordSpacing, settings.customColors]);

  const start = useCallback(async (): Promise<void> => {
    if (getState().listening) return;
    setListening(true);
    setStatus({ state: "connecting" });

    try {
      const currentSettings = getState().settings;
      const engine = await createEngine(currentSettings);
      engineRef.current = engine;

      const sources: AudioSource[] = currentSettings.stereoMode
        ? [
            { kind: "channel", channel: 0, speakerId: "s1", deviceId: currentSettings.deviceId || undefined },
            { kind: "channel", channel: 1, speakerId: "s2", deviceId: currentSettings.deviceId || undefined },
          ]
        : [{ kind: "mix", deviceId: currentSettings.deviceId || undefined }];

      await engine.start(sources, {
        onUtterance: addOrUpdateUtterance,
        onRelabel: relabel,
        onStatus: setStatus,
        onAudioLevel: updateAudioLevel,
      });
    } catch (err) {
      engineRef.current = null;
      setStatus({ state: "error", message: err instanceof Error ? err.message : "Failed to start microphone" });
      setListening(false);
    }
  }, []);

  const stop = useCallback(async (): Promise<void> => {
    try {
      await engineRef.current?.stop();
    } catch {}
    engineRef.current = null;
    clearInterimUtterances();
    setListening(false);
    setStatus({ state: "idle" });
    updateAudioLevel({ left: 0, right: 0, activeSpeakerId: null });
  }, []);

  // iPad Screen Lock / App-Switch Auto-Resume:
  // When an iPad is locked or the user switches tabs, WebKit suspends audio and SpeechRecognition terminates.
  // When visibilityState becomes visible, seamlessly restart/reconnect audio recognition if still listening.
  useEffect(() => {
    const handleVisibilityChange = async (): Promise<void> => {
      if (document.visibilityState === "visible" && getState().listening) {
        const engine = engineRef.current;
        const currentStatus = getState().status;
        if (!engine || currentStatus.state === "error" || currentStatus.state === "idle") {
          try {
            if (engine) await engine.stop();
          } catch {}
          engineRef.current = null;
          await start();
        } else if (typeof engine.resumeIfNeeded === "function") {
          try {
            await engine.resumeIfNeeded();
          } catch {
            try {
              await engine.stop();
            } catch {}
            engineRef.current = null;
            await start();
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, [start]);

  // Roger Loop Mute / Silence Alert (Teacher Mic Helper):
  // Track silence duration when listening is true and in classroom or solo mode.
  // Auto-dismiss immediately as soon as speech/audio energy is detected!
  useEffect(() => {
    if (listening && (settings.mode === "classroom" || settings.mode === "solo")) {
      const soundLevel = Math.max(audioLevel.left, audioLevel.right);
      if (soundLevel > settings.noiseGateThreshold) {
        lastSoundTimeRef.current = Date.now();
        setRogerSilenceWarning(false);
        setRogerSilenceDismissed(false);
      }
    }
  }, [audioLevel.left, audioLevel.right, listening, settings.mode, settings.noiseGateThreshold]);

  useEffect(() => {
    if (!listening || (settings.mode !== "classroom" && settings.mode !== "solo")) {
      setRogerSilenceWarning(false);
      setRogerSilenceDismissed(false);
      return;
    }

    lastSoundTimeRef.current = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - lastSoundTimeRef.current >= 45000) {
        setRogerSilenceWarning(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [listening, settings.mode]);

  const handleCopyNotes = useCallback(async (starredOnly?: boolean): Promise<void> => {
    await copyNotesToClipboard(utterances, speakers, starredOnly);
    setCopyToastText("✓ Copied notes to clipboard!");
    setTimeout(() => {
      setCopyToastText(null);
    }, 3500);
  }, [utterances, speakers]);

  useEffect(
    () => () => {
      void engineRef.current?.stop();
    },
    []
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const handledEvent = e as KeyboardEvent & { __vbHandled?: boolean };
      if (handledEvent.__vbHandled) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        handledEvent.__vbHandled = true;
        if (getState().listening) void stop();
        else void start();
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setFontPx(getState().settings.fontPx + 4);
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setFontPx(getState().settings.fontPx - 4);
        return;
      }
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        setZenMode(!getState().settings.zenMode);
        return;
      }
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        const current = getState().settings.theme;
        const idx = THEME_CYCLE.indexOf(current);
        const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length] ?? "yellow-on-black";
        setTheme(next);
        return;
      }
      if (e.key >= "1" && e.key <= "9") {
        const idx = Number(e.key) - 1;
        const speaker = getState().speakers[idx];
        if (!speaker) return;
        handledEvent.__vbHandled = true;
        e.preventDefault();
        if (getState().activeManualSpeakerId === speaker.id) setActiveManualSpeaker(null);
        else setActiveSpeaker(speaker.id);
        return;
      }
      if (e.key === "0") {
        handledEvent.__vbHandled = true;
        e.preventDefault();
        setActiveManualSpeaker(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [start, stop]);

  if (isPhoneTransmitter) {
    return <PhoneTransmitter />;
  }

  const latest = utterances[utterances.length - 1];
  const activeSpeaker =
    speakers.find((s) => s.id === (latest?.speakerId ?? currentSpeakerId)) ?? speakers[0];
  const latestName = latest?.speakerId
    ? (speakers.find((s) => s.id === latest.speakerId)?.name ?? "Unknown")
    : "";
  const liveMessage = listening && latestName ? `${latestName} is speaking` : "";
  const soundActive = listening && Math.max(audioLevel.left, audioLevel.right) > 8;

  const dotClass =
    !listening ? "dot-idle"
    : status.state === "listening" ? "dot-live"
    : status.state === "error" ? "dot-error"
    : "dot-connecting";

  // Flash style classes
  const flashClass = flashActive
    ? settings.flashMode === "screen"
      ? `speaker-flash-screen ${settings.flashIntensity}`
      : `speaker-flash-glow ${settings.flashIntensity}`
    : "";

  const mainContent =
    settings.mode === "diagnostics" ? (
      <AudioDiagnostics />
    ) : settings.mode === "classroom" || settings.mode === "solo" ? (
      <VoxStreamDisplay />
    ) : (
      <TranscriptList />
    );

  // Zen: conversation only, plus a tiny floating exit.
  if (settings.zenMode) {
    return (
      <div className={`app zen-mode-active ${flashClass}`}>
        <div className="visually-hidden" aria-live="polite" role="status">
          {liveMessage}
        </div>
        {alertToastVisible && lastAlertMatch && (
          <div className="keyword-alert-toast" role="alert">
            <span className="alert-icon">🔔</span>
            <span><strong>Keyword Alert:</strong> Teacher mentioned <em>"{lastAlertMatch.word}"</em></span>
          </div>
        )}
        {copyToastText && (
          <div className="clipboard-toast" role="status">
            <span>{copyToastText}</span>
          </div>
        )}
        {rogerDisconnected && (
          <div className="roger-disconnect-banner" role="alert">
            <span>⚠️ <strong>Roger Neckloop Disconnected:</strong> Check loop connection or power. Room mic is NOT active.</span>
            <button type="button" className="banner-dismiss-btn" onClick={() => setRogerDisconnected(false)}>Dismiss</button>
          </div>
        )}
        {rogerSilenceWarning && !rogerSilenceDismissed && (
          <div className="roger-silence-banner" role="status">
            <span>⚠️ <strong>Microphone Silence:</strong> No sound detected for 45s. Check if your microphone or Roger loop is muted.</span>
            <button type="button" onClick={() => setRogerSilenceDismissed(true)}>Dismiss</button>
          </div>
        )}
        <button
          type="button"
          className="zen-fab"
          onClick={() => setZenMode(false)}
          aria-label="Exit fullscreen"
          title="Exit fullscreen (F)"
        >
          ✕
        </button>
        <main className="main zen-main">{mainContent}</main>
      </div>
    );
  }

  return (
    <div className={`app ${flashClass}`}>
      <div className="visually-hidden" aria-live="polite" role="status">
        {liveMessage}
      </div>

      {settings.showKeywordAlerts !== false && alertToastVisible && lastAlertMatch && (Date.now() - lastAlertMatch.timestamp < 7000) && (
        <div className="keyword-alert-toast" role="alert">
          <span className="alert-icon">🔔</span>
          <span><strong>Keyword Alert:</strong> Teacher mentioned <em>"{lastAlertMatch.word}"</em></span>
        </div>
      )}

      {copyToastText && (
        <div className="clipboard-toast" role="status">
          <span>{copyToastText}</span>
        </div>
      )}

      <header className="topbar island">
        <div className="brand">
          <span className={`status-dot ${dotClass}`} aria-hidden="true" />
          <span className="brand-name">VoiceBridge</span>
        </div>

        {!settings.showSpeakerLabels || settings.mode === "classroom" || settings.mode === "solo" ? (
          <div className={"speaker-pill " + (listening ? "is-listening" : "")} role="status" aria-label="Microphone audio">
            <span className="speaker-pill-dot" style={{ backgroundColor: "var(--accent, #ffd400)" }} aria-hidden="true" />
            <span className="speaker-pill-name">
              🎙 {settings.deviceId && /roger|phonak/i.test(settings.deviceId) ? "Roger Loop" : "Microphone"} • {listening ? "Listening" : "Ready"}
            </span>
            <span className={"wave " + (soundActive ? "playing" : "")} aria-hidden="true">
              <i /><i /><i /><i />
            </span>
          </div>
        ) : (
          <div
            className={`speaker-pill ${listening ? "is-listening" : ""}`}
            role="status"
            aria-label={activeSpeaker ? `Active speaker: ${activeSpeaker.name}` : "No active speaker"}
          >
            {activeSpeaker && (
              <>
                <span
                  className="speaker-pill-dot"
                  style={{ backgroundColor: activeSpeaker.color }}
                  aria-hidden="true"
                />
                <span className="speaker-pill-arrow" aria-hidden="true">
                  {arrowForSpeaker(activeSpeaker)}
                </span>
                <span className="speaker-pill-name">{activeSpeaker.name}</span>
                <span className={`wave ${soundActive ? "playing" : ""}`} aria-hidden="true">
                  <i /><i /><i /><i />
                </span>
              </>
            )}
          </div>
        )}

        <div className="topbar-actions">
          {settings.mode === "classroom" && (
            <>
              <button
                type="button"
                className="icon-btn classroom-copy-btn"
                onClick={() => void handleCopyNotes(false)}
                title="1-tap Copy Notes to Clipboard"
                aria-label="Copy Notes to Clipboard"
              >
                📋 Copy Notes
              </button>
              {utterances.some((u) => u.starred) && (
                <button
                  type="button"
                  className="icon-btn classroom-copy-starred-btn"
                  onClick={() => void handleCopyNotes(true)}
                  title="Copy Starred Highlights Only"
                  aria-label="Copy Starred Highlights"
                >
                  ⭐ Copy Starred
                </button>
              )}
              <button
                type="button"
                className="icon-btn classroom-export-btn"
                onClick={() => downloadTranscript(utterances, speakers)}
                title="Export Notes File (.txt)"
                aria-label="Export Notes"
              >
                📥 Export
              </button>
            </>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              setDrawerTab("themes");
              setDrawerOpen(true);
            }}
            title={`Theme: ${THEME_SHORT[settings.theme]} — tap to open theme settings`}
            aria-label={`Open theme settings, current ${THEME_SHORT[settings.theme]}`}
          >
            🎨
          </button>
          <div className="font-stepper" aria-label="Text size">
            <button
              type="button"
              className="icon-btn"
              onClick={() => setFontPx(settings.fontPx - 4)}
              aria-label="Decrease text size"
            >
              A-
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setFontPx(settings.fontPx + 4)}
              aria-label="Increase text size"
            >
              A+
            </button>
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setZenMode(true)}
            title="Fullscreen reading mode (F)"
            aria-label="Enter fullscreen reading mode"
          >
            ⛶
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setQrOpen(true)}
            title="Connect family phone mics"
            aria-label="Connect family phone mics"
          >
            📱
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              setDrawerTab("cloud");
              setDrawerOpen(true);
            }}
            title="Cloud AI setup"
            aria-label="Open Cloud AI setup"
          >
            ☁
          </button>
          <button
            type="button"
            className="icon-btn tutorial-topbar-btn"
            onClick={() => setTutorialOpen(true)}
            title="Student Tutorial & Guide"
            aria-label="Open student tutorial"
          >
            📖 Tutorial
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              setDrawerTab("presets");
              setDrawerOpen(true);
            }}
            aria-label="Open settings"
          >
            ⚙
          </button>
        </div>
      </header>

      <nav className="mode-tabs segmented" role="tablist" aria-label="View modes">
        <button
          type="button"
          role="tab"
          aria-selected={settings.mode === "table"}
          className={`tab-btn ${settings.mode === "table" ? "active" : ""}`}
          onClick={() => setMode("table")}
        >
          🍽 Table
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={settings.mode === "classroom"}
          className={"tab-btn " + (settings.mode === "classroom" ? "active" : "")}
          onClick={() => setMode("classroom")}
        >
          🏫 Classroom
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={settings.mode === "solo"}
          className={`tab-btn ${settings.mode === "solo" ? "active" : ""}`}
          onClick={() => setMode("solo")}
        >
          📖 Solo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={settings.mode === "diagnostics"}
          className={`tab-btn ${settings.mode === "diagnostics" ? "active" : ""}`}
          onClick={() => setMode("diagnostics")}
        >
          🎙 Mics
        </button>
      </nav>

      {settings.mode !== "diagnostics" && <SpotlightBanner />}

      {rogerDisconnected && (
        <div className="roger-disconnect-banner" role="alert">
          <span>⚠️ <strong>Roger Neckloop Disconnected:</strong> Check loop connection or power. Room mic is NOT active.</span>
          <button type="button" className="banner-dismiss-btn" onClick={() => setRogerDisconnected(false)}>Dismiss</button>
        </div>
      )}

      {rogerSilenceWarning && !rogerSilenceDismissed && (
        <div className="roger-silence-banner" role="status">
          <span>⚠️ <strong>Microphone Silence:</strong> No sound detected for 45s. Check if your microphone or Roger loop is muted.</span>
          <button type="button" onClick={() => setRogerSilenceDismissed(true)}>Dismiss</button>
        </div>
      )}

      <main className="main">{mainContent}</main>

      <footer className="dock">
        <Controls
          listening={listening}
          status={status}
          onStart={() => void start()}
          onStop={() => void stop()}
        />
        <div className="dock-divider" aria-hidden="true" />
        <div className="dock-speakers">
          {settings.showSpeakerLabels && settings.mode !== "classroom" && settings.mode !== "solo" && (
            <TableRadar onOpenQr={() => setQrOpen(true)} />
          )}
        </div>
        {settings.showQuickReply !== false && settings.mode !== "diagnostics" && (
          <button
            type="button"
            className="reply-trigger"
            onClick={() => setReplyOpen(true)}
            aria-haspopup="dialog"
          >
            💬 Reply
          </button>
        )}
      </footer>

      {utterances.length > 0 && settings.mode !== "diagnostics" && (
        <div className="export-shelf">
          <ExportButtons />
        </div>
      )}

      {replyOpen && (
        <div className="sheet-backdrop" onClick={() => setReplyOpen(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Quick reply"
            onClick={(e) => e.stopPropagation()}
          >
            <QuickReplyBar inSheet onClose={() => setReplyOpen(false)} />
          </div>
        </div>
      )}

      {drawerOpen && (
        <SettingsDrawer
          initialTab={drawerTab}
          onClose={() => setDrawerOpen(false)}
          onOpenQr={() => setQrOpen(true)}
          onOpenTutorial={() => setTutorialOpen(true)}
          onOpenTodGuide={() => setTodGuideOpen(true)}
        />
      )}

      {qrOpen && <QrModal onClose={() => setQrOpen(false)} />}

      {tutorialOpen && (
        <TutorialModal
          onClose={() => setTutorialOpen(false)}
          onOpenTodGuide={() => setTodGuideOpen(true)}
        />
      )}

      {todGuideOpen && <TodGuideModal onClose={() => setTodGuideOpen(false)} />}
    </div>
  );
}
