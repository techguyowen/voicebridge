import { useEffect, useRef, useState } from "react";
import { MultiDeviceSync } from "../engines/multiDeviceSync";

export type MicMode = "latch" | "ptt" | "temp-mute";

export function PhoneTransmitter(): React.JSX.Element {
  const urlParams = new URLSearchParams(window.location.search);
  const room = urlParams.get("room") || localStorage.getItem("alt.phone.room") || "TABLE-101";
  const [pin, setPin] = useState(() => urlParams.get("pin") || localStorage.getItem("alt.phone.pin") || "");
  const [name, setName] = useState(() => localStorage.getItem("alt.phone.name") || "Family Member");
  const [color, setColor] = useState(() => localStorage.getItem("alt.phone.color") || "#4fc3f7");
  const [micMode, setMicMode] = useState<MicMode>(() => {
    const saved = localStorage.getItem("alt.phone.micMode");
    return saved === "ptt" || saved === "temp-mute" || saved === "latch" ? saved : "latch";
  });

  const [micActive, setMicActive] = useState(false);
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [lastSpoken, setLastSpoken] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("Connecting to tablet...");
  const [errorMessage, setErrorMessage] = useState("");

  const syncRef = useRef<MultiDeviceSync | null>(null);
  const recRef = useRef<any>(null);
  const isTransmittingRef = useRef(isTransmitting);
  const pinRef = useRef(pin);
  const micModeRef = useRef(micMode);

  // Turn management: Maintain a single stable ID for active speaking turn
  const currentTurnIdRef = useRef<string | null>(null);
  const turnStartMsRef = useRef<number>(Date.now());
  const lastSpokenTextRef = useRef<string>("");

  useEffect(() => {
    isTransmittingRef.current = isTransmitting;
  }, [isTransmitting]);

  useEffect(() => {
    pinRef.current = pin;
    if (pin) localStorage.setItem("alt.phone.pin", pin);
  }, [pin]);

  const finalizeActiveTurn = () => {
    if (currentTurnIdRef.current && lastSpokenTextRef.current) {
      const turnId = currentTurnIdRef.current;
      const text = lastSpokenTextRef.current;
      const senderId = name.toLowerCase().replace(/\s+/g, "_") || "family_member";
      const now = Date.now();

      syncRef.current?.send({
        type: "utterance",
        senderName: name,
        senderColor: color,
        pin: pinRef.current,
        utterance: {
          id: turnId,
          text,
          startMs: turnStartMsRef.current,
          endMs: now,
          speakerId: senderId,
          final: true,
        },
      });
    }
    currentTurnIdRef.current = null;
    lastSpokenTextRef.current = "";
  };

  useEffect(() => {
    micModeRef.current = micMode;
    localStorage.setItem("alt.phone.micMode", micMode);
    // Adjust transmission default when mode changes
    if (micActive) {
      if (micMode === "ptt") {
        finalizeActiveTurn();
        setIsTransmitting(false);
      } else {
        setIsTransmitting(true);
      }
    }
  }, [micMode, micActive]);

  // Multi-device sync over WebSocket relay via ntfy.sh (and BroadcastChannel fallback)
  useEffect(() => {
    const activePin = pinRef.current.trim();
    const sync = new MultiDeviceSync(room, { isHost: false, pin: activePin });
    syncRef.current = sync;

    sync.onStatus((status) => {
      setConnectionStatus(status);
    });

    sync.send({
      type: "join",
      senderName: name,
      senderColor: color,
      pin: activePin,
    });

    return () => {
      finalizeActiveTurn();
      sync.send({
        type: "leave",
        senderName: name,
        pin: activePin,
      });
      sync.destroy();
    };
  }, [room, name, color, pin]);

  const vibrate = (pattern: number | number[]) => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  };

  const ensurePin = (): string | null => {
    let currentPin = pin.trim();
    if (!currentPin) {
      const entered = window.prompt("Enter the 4-digit Room PIN shown on the main display:");
      if (!entered || !entered.trim()) {
        setErrorMessage("Room PIN is required to connect to the table display.");
        return null;
      }
      currentPin = entered.trim();
      setPin(currentPin);
      pinRef.current = currentPin;
      localStorage.setItem("alt.phone.pin", currentPin);
    }
    setErrorMessage("");
    return currentPin;
  };

  const startMic = () => {
    const activePin = ensurePin();
    if (!activePin) return;

    const SpeechRecClass = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecClass) {
      alert("Speech recognition is not supported in this mobile browser. Please use Chrome or Safari.");
      return;
    }

    try {
      const rec = new SpeechRecClass();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onstart = () => {
        setMicActive(true);
        if (micModeRef.current === "ptt") {
          setIsTransmitting(false);
        } else {
          setIsTransmitting(true);
        }
        vibrate(60);
      };

      rec.onresult = (e: any) => {
        let interim = "";
        let finalSegment = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0]?.transcript || "";
          if (e.results[i].isFinal) {
            finalSegment += t;
          } else {
            interim += t;
          }
        }

        const text = (finalSegment || interim).trim();
        if (text) {
          setLastSpoken(text);
          lastSpokenTextRef.current = text;

          // Only transmit to host if mic is unmuted!
          if (isTransmittingRef.current) {
            const senderId = name.toLowerCase().replace(/\s+/g, "_") || "family_member";
            if (!currentTurnIdRef.current) {
              turnStartMsRef.current = Date.now();
              currentTurnIdRef.current = `phone-${senderId}-${turnStartMsRef.current}`;
            }
            const turnId = currentTurnIdRef.current;
            const now = Date.now();
            const isFinal = Boolean(finalSegment);

            syncRef.current?.send({
              type: "utterance",
              senderName: name,
              senderColor: color,
              pin: pinRef.current,
              utterance: {
                id: turnId,
                text,
                startMs: turnStartMsRef.current,
                endMs: now,
                speakerId: senderId,
                final: isFinal,
              },
            });

            if (isFinal) {
              currentTurnIdRef.current = null;
              lastSpokenTextRef.current = "";
            }
          }
        }
      };

      rec.onerror = (e: any) => {
        if (e.error !== "no-speech") {
          setErrorMessage("Mic status: " + e.error);
        }
      };

      rec.onend = () => {
        if (recRef.current) {
          try {
            rec.start();
          } catch {}
        } else {
          finalizeActiveTurn();
          setMicActive(false);
          setIsTransmitting(false);
        }
      };

      rec.start();
      recRef.current = rec;
      setMicActive(true);
    } catch (err) {
      alert("Microphone error: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const stopMic = () => {
    finalizeActiveTurn();
    setMicActive(false);
    setIsTransmitting(false);
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {}
      recRef.current = null;
    }
    vibrate(40);
  };

  // Dedicated button interactions depending on MicMode
  const handleLatchToggle = () => {
    if (isTransmitting) {
      finalizeActiveTurn();
      setIsTransmitting(false);
      vibrate(40);
    } else {
      setIsTransmitting(true);
      vibrate(40);
    }
  };

  const handlePttDown = (e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    setIsTransmitting(true);
    vibrate(40);
  };

  const handlePttUp = (e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    finalizeActiveTurn();
    setIsTransmitting(false);
    vibrate(20);
  };

  const handleTempMuteDown = (e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    finalizeActiveTurn();
    setIsTransmitting(false);
    vibrate(40);
  };

  const handleTempMuteUp = (e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    setIsTransmitting(true);
    vibrate(20);
  };

  const handleNameChange = (newName: string) => {
    setName(newName);
    localStorage.setItem("alt.phone.name", newName);
  };

  const handleColorChange = (newColor: string) => {
    setColor(newColor);
    localStorage.setItem("alt.phone.color", newColor);
  };

  const handlePinChange = (newPin: string) => {
    setPin(newPin);
    pinRef.current = newPin;
    localStorage.setItem("alt.phone.pin", newPin);
  };

  return (
    <div className="phone-transmitter" style={{ padding: "20px", maxWidth: "600px", margin: "0 auto", color: "var(--fg, #ffffff)" }}>
      <header className="phone-head" style={{ borderBottom: "1px solid var(--border, #333)", paddingBottom: "12px", marginBottom: "16px" }}>
        <h1 style={{ fontSize: "26px", margin: "0 0 6px 0" }}>Table Microphone</h1>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px", fontSize: "16px", color: "var(--muted, #aaa)" }}>
          <div>Room: <strong style={{ color: "var(--fg, #fff)" }}>{room}</strong></div>
          <div>PIN: <strong style={{ color: "var(--fg, #fff)", fontFamily: "monospace" }}>{pin || "(none)"}</strong></div>
        </div>
        <div style={{ marginTop: "6px", fontSize: "14px", color: connectionStatus.includes("Connected") ? "#4caf50" : "#ff9800" }}>
          ● {connectionStatus}
        </div>
      </header>

      {/* Mic Mode Selector */}
      <div style={{ margin: "16px 0" }}>
        <div style={{ fontSize: "16px", fontWeight: "bold", marginBottom: "8px" }}>Microphone Control Mode:</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
          <button
            type="button"
            className={`radar-pill ${micMode === "latch" ? "active" : ""}`}
            onClick={() => setMicMode("latch")}
            style={{
              padding: "10px 4px",
              fontSize: "14px",
              fontWeight: "bold",
              borderRadius: "10px",
              border: micMode === "latch" ? "2px solid #fff" : "1px solid #444",
              background: micMode === "latch" ? "#333" : "#111",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            🔒 Mute Latch<br /><span style={{ fontSize: "11px", opacity: 0.8 }}>(Tap toggle)</span>
          </button>
          <button
            type="button"
            className={`radar-pill ${micMode === "ptt" ? "active" : ""}`}
            onClick={() => setMicMode("ptt")}
            style={{
              padding: "10px 4px",
              fontSize: "14px",
              fontWeight: "bold",
              borderRadius: "10px",
              border: micMode === "ptt" ? "2px solid #fff" : "1px solid #444",
              background: micMode === "ptt" ? "#333" : "#111",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            🎙️ Push-to-Talk<br /><span style={{ fontSize: "11px", opacity: 0.8 }}>(Hold to talk)</span>
          </button>
          <button
            type="button"
            className={`radar-pill ${micMode === "temp-mute" ? "active" : ""}`}
            onClick={() => setMicMode("temp-mute")}
            style={{
              padding: "10px 4px",
              fontSize: "14px",
              fontWeight: "bold",
              borderRadius: "10px",
              border: micMode === "temp-mute" ? "2px solid #fff" : "1px solid #444",
              background: micMode === "temp-mute" ? "#333" : "#111",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            😷 Temp Mute<br /><span style={{ fontSize: "11px", opacity: 0.8 }}>(Cough button)</span>
          </button>
        </div>
      </div>

      {/* Main Big Mic Control Button */}
      <div style={{ textAlign: "center", margin: "24px 0" }}>
        {!micActive ? (
          <button
            type="button"
            onClick={startMic}
            style={{
              width: "100%",
              minHeight: "120px",
              fontSize: "24px",
              fontWeight: "bold",
              borderRadius: "20px",
              backgroundColor: "#222",
              color: "#fff",
              border: "3px solid #555",
              cursor: "pointer",
              userSelect: "none",
              touchAction: "manipulation",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <span>🎙️ START MICROPHONE</span>
            <span style={{ fontSize: "14px", fontWeight: "normal", opacity: 0.8 }}>
              Tap to enable mic access
            </span>
          </button>
        ) : micMode === "latch" ? (
          <button
            type="button"
            onClick={handleLatchToggle}
            style={{
              width: "100%",
              minHeight: "130px",
              fontSize: "24px",
              fontWeight: "bold",
              borderRadius: "20px",
              backgroundColor: isTransmitting ? "#ff3b30" : "#2c2c2e",
              color: isTransmitting ? "#ffffff" : "#8e8e93",
              border: isTransmitting ? "4px solid #ffffff" : "3px solid #555",
              cursor: "pointer",
              boxShadow: isTransmitting ? "0 0 30px rgba(255, 59, 48, 0.8)" : "none",
              userSelect: "none",
              touchAction: "manipulation",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.1s ease-in-out",
            }}
          >
            <span>{isTransmitting ? "🔴 LIVE — TAP TO MUTE" : "⚪ MUTED — TAP TO SPEAK"}</span>
            <span style={{ fontSize: "14px", fontWeight: "normal" }}>
              {isTransmitting ? "Your speech is live on the table screen" : "Mic is muted. Tap to go live"}
            </span>
          </button>
        ) : micMode === "ptt" ? (
          <button
            type="button"
            onPointerDown={handlePttDown}
            onPointerUp={handlePttUp}
            onPointerCancel={handlePttUp}
            style={{
              width: "100%",
              minHeight: "130px",
              fontSize: "24px",
              fontWeight: "bold",
              borderRadius: "20px",
              backgroundColor: isTransmitting ? "#ff3b30" : "#2c2c2e",
              color: isTransmitting ? "#ffffff" : "#8e8e93",
              border: isTransmitting ? "4px solid #ffffff" : "3px solid #555",
              cursor: "pointer",
              boxShadow: isTransmitting ? "0 0 30px rgba(255, 59, 48, 0.8)" : "none",
              userSelect: "none",
              touchAction: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.1s ease-in-out",
            }}
          >
            <span>{isTransmitting ? "🔴 TRANSMITTING..." : "🎙️ HOLD TO TALK"}</span>
            <span style={{ fontSize: "14px", fontWeight: "normal" }}>
              {isTransmitting ? "Release to mute" : "Press and hold button while speaking"}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onPointerDown={handleTempMuteDown}
            onPointerUp={handleTempMuteUp}
            onPointerCancel={handleTempMuteUp}
            style={{
              width: "100%",
              minHeight: "130px",
              fontSize: "24px",
              fontWeight: "bold",
              borderRadius: "20px",
              backgroundColor: isTransmitting ? "#ff3b30" : "#2c2c2e",
              color: isTransmitting ? "#ffffff" : "#8e8e93",
              border: isTransmitting ? "4px solid #ffffff" : "3px solid #555",
              cursor: "pointer",
              boxShadow: isTransmitting ? "0 0 30px rgba(255, 59, 48, 0.8)" : "none",
              userSelect: "none",
              touchAction: "none",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.1s ease-in-out",
            }}
          >
            <span>{isTransmitting ? "🔴 LIVE TRANSMITTING" : "🔇 MUTED (COUGHING)"}</span>
            <span style={{ fontSize: "14px", fontWeight: "normal" }}>
              {isTransmitting ? "Press and hold to temporarily mute (cough button)" : "Release to resume transmitting"}
            </span>
          </button>
        )}

        {micActive && (
          <button
            type="button"
            onClick={stopMic}
            style={{
              marginTop: "12px",
              padding: "8px 16px",
              fontSize: "14px",
              borderRadius: "8px",
              backgroundColor: "transparent",
              color: "var(--muted, #aaa)",
              border: "1px solid #444",
              cursor: "pointer",
            }}
          >
            ⏹ Turn Off Microphone
          </button>
        )}

        {errorMessage && (
          <p style={{ marginTop: "12px", fontSize: "16px", color: "#ff5252" }}>⚠️ {errorMessage}</p>
        )}
      </div>

      {lastSpoken && (
        <div
          style={{
            border: "1px solid var(--border, #333)",
            borderRadius: "12px",
            padding: "14px",
            background: "var(--panel, #181818)",
            margin: "18px 0",
          }}
        >
          <div style={{ fontSize: "14px", color: "var(--muted, #aaa)", marginBottom: "4px" }}>
            {isTransmitting ? "Transmitted to table:" : "Heard locally (MUTED):"}
          </div>
          <div style={{ fontSize: "20px", fontWeight: "bold", color: isTransmitting ? color : "#888" }}>
            "{lastSpoken}"
          </div>
        </div>
      )}

      {/* Speaker Identity Form */}
      <div className="phone-form" style={{ margin: "24px 0", display: "flex", flexDirection: "column", gap: "16px", background: "#111", padding: "16px", borderRadius: "12px", border: "1px solid #333" }}>
        <h2 style={{ fontSize: "18px", margin: "0 0 4px 0" }}>Speaker Details</h2>

        <label style={{ fontSize: "16px", fontWeight: "bold", display: "flex", flexDirection: "column", gap: "6px" }}>
          Your Name:
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            style={{ fontSize: "18px", padding: "8px", borderRadius: "6px", border: "1px solid #555", background: "#222", color: "#fff" }}
          />
        </label>

        <label style={{ fontSize: "16px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "12px" }}>
          Avatar Color Tag:
          <input
            type="color"
            value={color}
            onChange={(e) => handleColorChange(e.target.value)}
            style={{ width: "50px", height: "40px", cursor: "pointer", border: "none", background: "none" }}
          />
        </label>

        <label style={{ fontSize: "16px", fontWeight: "bold", display: "flex", flexDirection: "column", gap: "6px" }}>
          Room PIN (Passcode):
          <input
            type="text"
            value={pin}
            maxLength={6}
            placeholder="e.g. 1234"
            onChange={(e) => handlePinChange(e.target.value)}
            style={{ fontSize: "18px", padding: "8px", borderRadius: "6px", border: "1px solid #555", background: "#222", color: "#fff", fontFamily: "monospace" }}
          />
        </label>
      </div>

      <footer style={{ marginTop: "32px", textAlign: "center", fontSize: "15px", color: "var(--muted, #aaa)" }}>
        <a href="/" style={{ color: "var(--fg, #fff)", textDecoration: "underline" }}>
          Open Host Screen (iPad / Desktop)
        </a>
      </footer>
    </div>
  );
}
