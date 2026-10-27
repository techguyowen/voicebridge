import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  disconnectAllDevices,
  regenerateRoomSecurity,
  removeDevice,
  toggleMuteSpeaker,
  useStore,
} from "./store";

export function QrModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { settings, speakers, mutedSpeakerIds } = useStore();
  const [qrUrl, setQrUrl] = useState<string>("");

  const joinUrl = `${window.location.origin}${window.location.pathname}?role=mic&room=${settings.roomCode}&pin=${settings.roomPin}`;

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
        aria-label="Phone Microphones & Connected Devices"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(500px, 95vw)" }}
      >
        <div className="drawer-head">
          <h2>Phone Microphones &amp; Connected Devices</h2>
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

        <div style={{ fontSize: "20px", fontWeight: "bold", textAlign: "center", display: "flex", justifyContent: "center", gap: "20px", flexWrap: "wrap" }}>
          <div>
            Room Code: <span style={{ color: "var(--fg)", textDecoration: "underline" }}>{settings.roomCode}</span>
          </div>
          <div>
            PIN: <span style={{ color: "var(--fg)", fontFamily: "monospace", letterSpacing: "2px" }}>{settings.roomPin}</span>
          </div>
        </div>

        <div style={{ textAlign: "center", margin: "14px 0" }}>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => regenerateRoomSecurity()}
            style={{ fontSize: "16px", padding: "8px 16px" }}
          >
            🔄 Regenerate Room &amp; PIN
          </button>
        </div>

        <div style={{ wordBreak: "break-all", fontSize: "16px", color: "var(--muted)", margin: "12px 0" }}>
          Link: <a href={joinUrl} target="_blank" rel="noreferrer" style={{ color: "var(--fg)" }}>{joinUrl}</a>
        </div>

        {/* Connected Devices Section */}
        <div className="connected-devices-section" style={{ marginTop: "20px", borderTop: "1px solid var(--hairline)", paddingTop: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
            <h3 style={{ margin: 0, fontSize: "20px" }}>Connected Devices ({speakers.length})</h3>
            {speakers.length > 0 && (
              <button
                type="button"
                className="key-action-btn"
                onClick={() => disconnectAllDevices()}
                style={{ fontSize: "14px", padding: "6px 12px", color: "var(--danger, #ff5252)" }}
                title="Disconnect all phones from table"
              >
                Disconnect All Devices
              </button>
            )}
          </div>

          {speakers.length === 0 ? (
            <p style={{ fontSize: "15px", color: "var(--muted)", margin: "8px 0" }}>
              No phones connected yet. Family members can scan the QR code to join.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {speakers.map((sp) => {
                const isMuted = mutedSpeakerIds.includes(sp.id);
                return (
                  <div
                    key={sp.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "10px",
                      padding: "8px 12px",
                      background: "var(--panel)",
                      borderRadius: "8px",
                      border: "1px solid var(--hairline)",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span
                        style={{
                          width: "12px",
                          height: "12px",
                          borderRadius: "50%",
                          backgroundColor: sp.color,
                          display: "inline-block",
                          flexShrink: 0,
                        }}
                        aria-hidden="true"
                      />
                      <span style={{ fontWeight: "bold", fontSize: "16px" }}>{sp.name}</span>
                      <span
                        style={{
                          fontSize: "12px",
                          padding: "2px 8px",
                          borderRadius: "4px",
                          background: isMuted ? "rgba(255, 82, 82, 0.2)" : "rgba(61, 220, 132, 0.2)",
                          color: isMuted ? "#ff7a7a" : "#3ddc84",
                          fontWeight: "bold",
                        }}
                      >
                        {isMuted ? "Muted" : "Live"}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        className="key-action-btn"
                        onClick={() => toggleMuteSpeaker(sp.id)}
                        style={{ fontSize: "14px", padding: "6px 12px" }}
                        title={isMuted ? `Turn on ${sp.name}` : `Turn off / mute ${sp.name}`}
                        aria-label={isMuted ? `Unmute ${sp.name}` : `Mute ${sp.name}`}
                      >
                        {isMuted ? "🎙️ Turn On" : "🔇 Turn Off / Mute"}
                      </button>
                      <button
                        type="button"
                        className="key-action-btn"
                        onClick={() => removeDevice(sp.id)}
                        style={{ fontSize: "14px", padding: "6px 12px", color: "var(--danger, #ff5252)" }}
                        title={`Remove ${sp.name}`}
                        aria-label={`Remove device ${sp.name}`}
                      >
                        ✕ Remove Device
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button type="button" onClick={onClose} style={{ marginTop: "16px" }}>
          Done
        </button>
      </aside>
    </div>
  );
}
