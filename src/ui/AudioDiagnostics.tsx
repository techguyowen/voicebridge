import { useEffect, useRef, useState } from "react";
import { setDeviceId, setStereoMode, useStore } from "./store";

export function AudioDiagnostics(): React.JSX.Element {
  const { settings } = useStore();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [active, setActive] = useState(false);
  const [levelL, setLevelL] = useState(0);
  const [levelR, setLevelR] = useState(0);
  const [peakL, setPeakL] = useState(0);
  const [peakR, setPeakR] = useState(0);
  const [channelCount, setChannelCount] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    async function loadDevices() {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        const all = await navigator.mediaDevices.enumerateDevices();
        const inputs = all.filter((d) => d.kind === "audioinput");
        setDevices(inputs);
      } catch {}
    }
    void loadDevices();
  }, []);

  const startTest = async () => {
    stopTest();
    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtxClass();
      audioCtxRef.current = ctx;

      const constraints: MediaStreamConstraints = {
        audio: {
          channelCount: { ideal: 2, min: 1 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          ...(settings.deviceId ? { deviceId: { exact: settings.deviceId } } : {}),
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const track = stream.getAudioTracks()[0];
      const settingsTrack = track?.getSettings();
      setChannelCount(settingsTrack?.channelCount ?? 1);

      const source = ctx.createMediaStreamSource(stream);
      const splitter = ctx.createChannelSplitter(2);
      const analyserL = ctx.createAnalyser();
      const analyserR = ctx.createAnalyser();
      const waveAnalyser = ctx.createAnalyser();

      analyserL.fftSize = 256;
      analyserR.fftSize = 256;
      waveAnalyser.fftSize = 512;

      source.connect(splitter);
      splitter.connect(analyserL, 0);
      splitter.connect(analyserR, 1);
      source.connect(waveAnalyser);

      const bufL = new Uint8Array(analyserL.frequencyBinCount);
      const bufR = new Uint8Array(analyserR.frequencyBinCount);
      const waveBuf = new Uint8Array(waveAnalyser.frequencyBinCount);

      setActive(true);

      const updateMeters = () => {
        analyserL.getByteTimeDomainData(bufL);
        analyserR.getByteTimeDomainData(bufR);
        waveAnalyser.getByteTimeDomainData(waveBuf);

        let sumL = 0;
        let sumR = 0;
        for (let i = 0; i < bufL.length; i++) {
          const vL = (bufL[i] - 128) / 128;
          const vR = (bufR[i] - 128) / 128;
          sumL += vL * vL;
          sumR += vR * vR;
        }

        const rmsL = Math.min(100, Math.round(Math.sqrt(sumL / bufL.length) * 280));
        const rmsR = Math.min(100, Math.round(Math.sqrt(sumR / bufR.length) * 280));

        setLevelL(rmsL);
        setLevelR(rmsR);
        setPeakL((prev) => Math.max(prev * 0.94, rmsL));
        setPeakR((prev) => Math.max(prev * 0.94, rmsR));

        // Draw waveform
        const canvas = canvasRef.current;
        if (canvas) {
          const cCtx = canvas.getContext("2d");
          if (cCtx) {
            cCtx.fillStyle = "rgba(0, 0, 0, 0.4)";
            cCtx.fillRect(0, 0, canvas.width, canvas.height);
            cCtx.lineWidth = 3;
            cCtx.strokeStyle = "#ffd400";
            cCtx.beginPath();

            const sliceWidth = canvas.width / waveBuf.length;
            let x = 0;
            for (let i = 0; i < waveBuf.length; i++) {
              const v = waveBuf[i] / 128.0;
              const y = (v * canvas.height) / 2;
              if (i === 0) cCtx.moveTo(x, y);
              else cCtx.lineTo(x, y);
              x += sliceWidth;
            }
            cCtx.stroke();
          }
        }

        animFrameRef.current = requestAnimationFrame(updateMeters);
      };

      updateMeters();
    } catch (err) {
      alert("Microphone error: " + (err instanceof Error ? err.message : String(err)));
      stopTest();
    }
  };

  const stopTest = () => {
    setActive(false);
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    setLevelL(0);
    setLevelR(0);
    setPeakL(0);
    setPeakR(0);
  };

  useEffect(() => {
    return () => stopTest();
  }, []);

  return (
    <div className="diagnostics-panel" role="region" aria-label="Audio and Hardware Diagnostics">
      <h2>Audio & Hardware Diagnostics</h2>
      <p className="diag-intro">
        Use this tool to visually verify your microphone before dinner. Test your DJI dual mics, Roger mic, or USB-C mic by speaking or tapping them.
      </p>

      <div className="diag-device-select">
        <label htmlFor="audio-device-select">Select Microphone Device:</label>
        <select
          id="audio-device-select"
          value={settings.deviceId}
          onChange={(e) => {
            setDeviceId(e.target.value);
            if (active) void startTest();
          }}
        >
          <option value="">Default Microphone (iPad / System)</option>
          {devices.map((d, idx) => (
            <option key={d.deviceId || idx} value={d.deviceId}>
              {d.label || `Microphone ${idx + 1}`}
            </option>
          ))}
        </select>
      </div>

      <div className="diag-options">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={settings.stereoMode}
            onChange={(e) => setStereoMode(e.target.checked)}
          />
          <strong>Enable DJI Mic 2-Channel Split (Stereo Left/Right)</strong>
        </label>
        <p className="diag-hint">
          Splits Channel 0 (Left = Mic 1) and Channel 1 (Right = Mic 2) so speakers are identified deterministically.
        </p>
      </div>

      <div className="diag-actions">
        {!active ? (
          <button type="button" className="diag-start-btn" onClick={() => void startTest()}>
            Start Audio Level Test
          </button>
        ) : (
          <button type="button" className="diag-stop-btn" onClick={stopTest}>
            Stop Audio Test
          </button>
        )}
      </div>

      {active && (
        <div className="diag-meters-box">
          <div className="diag-info-tag">
            Hardware Channels Detected: <strong>{channelCount === 2 ? "Stereo (2 Channels)" : "Mono (1 Channel)"}</strong>
          </div>

          <div className="diag-meter-row">
            <span className="meter-label">Left / Mic 1:</span>
            <div className="meter-track" role="progressbar" aria-valuenow={levelL} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="meter-bar"
                style={{
                  width: `${levelL}%`,
                  backgroundColor: levelL > 80 ? "#ff5252" : levelL > 10 ? "#ffd400" : "#555",
                }}
              />
              <div className="meter-peak" style={{ left: `${peakL}%` }} />
            </div>
            <span className="meter-val">{levelL}%</span>
          </div>

          <div className="diag-meter-row">
            <span className="meter-label">Right / Mic 2:</span>
            <div className="meter-track" role="progressbar" aria-valuenow={levelR} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="meter-bar"
                style={{
                  width: `${levelR}%`,
                  backgroundColor: levelR > 80 ? "#ff5252" : levelR > 10 ? "#4fc3f7" : "#555",
                }}
              />
              <div className="meter-peak" style={{ left: `${peakR}%` }} />
            </div>
            <span className="meter-val">{levelR}%</span>
          </div>

          <div className="waveform-box">
            <canvas ref={canvasRef} width={400} height={80} className="waveform-canvas" />
          </div>
        </div>
      )}
    </div>
  );
}
