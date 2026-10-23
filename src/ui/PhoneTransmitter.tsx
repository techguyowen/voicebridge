import { useEffect, useRef, useState } from "react";
import { MultiDeviceSync } from "../engines/multiDeviceSync";

export function PhoneTransmitter(): React.JSX.Element {
  const urlParams = new URLSearchParams(window.location.search);
  const room = urlParams.get("room") || "TABLE-101";

  const [name, setName] = useState(localStorage.getItem("alt.phone.name") || "Family Member");
  const [color, setColor] = useState(localStorage.getItem("alt.phone.color") || "#4fc3f7");
  const [isTalking, setIsTalking] = useState(false);
  const [lastSpoken, setLastSpoken] = useState("");
  const [statusMessage, setStatusMessage] = useState("Connected to Room " + room);

  const syncRef = useRef<MultiDeviceSync | null>(null);
  const recRef = useRef<any>(null);

  useEffect(() => {
    const sync = new MultiDeviceSync(room);
    syncRef.current = sync;
    sync.send({
      type: "join",
      senderName: name,
      senderColor: color,
    });

    return () => {
      sync.send({
        type: "leave",
        senderName: name,
      });
      sync.destroy();
    };
  }, [room, name, color]);

  const toggleMic = () => {
    if (isTalking) {
      stopMic();
    } else {
      startMic();
    }
  };

  const startMic = () => {
    const SpeechRecClass = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecClass) {
      alert("Speech recognition is not supported in this mobile browser. Try Chrome or Safari.");
      return;
    }

    try {
      const rec = new SpeechRecClass();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onstart = () => {
        setIsTalking(true);
        setStatusMessage("Listening... Speak clearly into your phone");
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

        const now = Date.now();
        const text = (finalSegment || interim).trim();
        if (text) {
          setLastSpoken(text);
          syncRef.current?.send({
            type: "utterance",
            senderName: name,
            senderColor: color,
            utterance: {
              id: `phone-${Date.now()}`,
              text,
              startMs: now - 1000,
              endMs: now,
              speakerId: name.toLowerCase().replace(/\s+/g, "_"),
              final: Boolean(finalSegment),
            },
          });
        }
      };

      rec.onerror = (e: any) => {
        if (e.error !== "no-speech") {
          setStatusMessage("Notice: " + e.error);
        }
      };

      rec.onend = () => {
        if (isTalking) {
          try {
            rec.start();
          } catch {}
        } else {
          setIsTalking(false);
          setStatusMessage("Microphone stopped");
        }
      };

      rec.start();
      recRef.current = rec;
      setIsTalking(true);
    } catch (err) {
      alert("Microphone error: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const stopMic = () => {
    setIsTalking(false);
    if (recRef.current) {
      try {
        recRef.current.stop();
      } catch {}
      recRef.current = null;
    }
  };

  const handleNameChange = (newName: string) => {
    setName(newName);
    localStorage.setItem("alt.phone.name", newName);
  };

  const handleColorChange = (newColor: string) => {
    setColor(newColor);
    localStorage.setItem("alt.phone.color", newColor);
  };

  return (
    <div className="phone-transmitter" style={{ padding: "24px", maxWidth: "600px", margin: "0 auto" }}>
      <header className="phone-head">
        <h1 style={{ fontSize: "28px", margin: "0 0 8px 0" }}>Table Microphone</h1>
        <div className="phone-room-badge" style={{ fontSize: "18px", color: "var(--muted)" }}>
          Room: <strong>{room}</strong>
        </div>
      </header>

      <div className="phone-form" style={{ margin: "20px 0", display: "flex", flexDirection: "column", gap: "16px" }}>
        <label style={{ fontSize: "20px", fontWeight: "bold" }}>
          Your Name:
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            style={{ fontSize: "22px", padding: "10px", marginTop: "6px" }}
          />
        </label>

        <label style={{ fontSize: "20px", fontWeight: "bold", display: "flex", alignItems: "center", gap: "12px" }}>
          Your Color Tag:
          <input
            type="color"
            value={color}
            onChange={(e) => handleColorChange(e.target.value)}
            style={{ width: "60px", height: "50px", cursor: "pointer" }}
          />
        </label>
      </div>

      <div style={{ textAlign: "center", margin: "30px 0" }}>
        <button
          type="button"
          onClick={toggleMic}
          style={{
            width: "100%",
            minHeight: "90px",
            fontSize: "28px",
            fontWeight: "bold",
            borderRadius: "16px",
            backgroundColor: isTalking ? "#ff5252" : color,
            color: "#000",
            border: "4px solid #fff",
            cursor: "pointer",
            boxShadow: isTalking ? "0 0 24px #ff5252" : "none",
          }}
        >
          {isTalking ? "MUTE MICROPHONE" : "START SPEAKING"}
        </button>
        <p style={{ marginTop: "12px", fontSize: "18px", color: "var(--fg)" }}>{statusMessage}</p>
      </div>

      {lastSpoken && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "16px",
            background: "var(--panel)",
            marginTop: "20px",
          }}
        >
          <div style={{ fontSize: "16px", color: "var(--muted)", marginBottom: "4px" }}>Last transmitted:</div>
          <div style={{ fontSize: "22px", fontWeight: "bold" }}>"{lastSpoken}"</div>
        </div>
      )}

      <footer style={{ marginTop: "40px", textAlign: "center", fontSize: "16px", color: "var(--muted)" }}>
        <a href="/" style={{ color: "var(--fg)", textDecoration: "underline" }}>
          Back to Host Screen
        </a>
      </footer>
    </div>
  );
}
