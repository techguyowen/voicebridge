import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useStore } from "./store";

export function QrModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { settings } = useStore();
  const [qrUrl, setQrUrl] = useState<string>("");

  const joinUrl = `${window.location.origin}${window.location.pathname}?role=mic&room=${settings.roomCode}`;

  useEffect(() => {
    async function makeQr() {
      try {
        const url = await QRCode.toDataURL(joinUrl, {
          width: 320,
          margin: 2,
          color: {
            dark: "#000000",
            light: "#ffffff",
          },
        });
        setQrUrl(url);
      } catch {}
    }
    void makeQr();
  }, [joinUrl]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer qr-modal"
        role="dialog"
        aria-label="Connect Family Phones"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(500px, 95vw)" }}
      >
        <div className="drawer-head">
          <h2>Connect Phone Mics</h2>
          <button type="button" onClick={onClose} aria-label="Close QR modal">
            Close
          </button>
        </div>

        <p style={{ fontSize: "20px", margin: "12px 0" }}>
          Family members can scan this QR code with their phone camera to join as personal microphones around the table!
        </p>

        <div style={{ textAlign: "center", margin: "16px 0", background: "#fff", padding: "16px", borderRadius: "16px" }}>
          {qrUrl ? (
            <img src={qrUrl} alt={`QR Code for room ${settings.roomCode}`} style={{ maxWidth: "100%", height: "auto" }} />
          ) : (
            <div style={{ padding: "60px 0", color: "#000" }}>Generating QR Code...</div>
          )}
        </div>

        <div style={{ fontSize: "20px", fontWeight: "bold", textAlign: "center" }}>
          Room Code: <span style={{ color: "var(--fg)", textDecoration: "underline" }}>{settings.roomCode}</span>
        </div>

        <div style={{ wordBreak: "break-all", fontSize: "16px", color: "var(--muted)", margin: "12px 0" }}>
          Link: <a href={joinUrl} target="_blank" rel="noreferrer" style={{ color: "var(--fg)" }}>{joinUrl}</a>
        </div>

        <button type="button" onClick={onClose} style={{ marginTop: "12px" }}>
          Done
        </button>
      </aside>
    </div>
  );
}
