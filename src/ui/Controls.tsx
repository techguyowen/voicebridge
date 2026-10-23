import type { EngineStatus } from "../types";

export function statusText(status: EngineStatus, listening: boolean): string {
  if (!listening) return "Stopped";
  switch (status.state) {
    case "idle":
      return "Stopped";
    case "connecting":
      return "Connecting…";
    case "listening":
      return "Listening";
    case "reconnecting":
      return "Reconnecting…";
    case "error":
      return `Error: ${status.message}`;
  }
}

export function Controls({
  listening,
  status,
  onStart,
  onStop,
}: {
  listening: boolean;
  status: EngineStatus;
  onStart: () => void;
  onStop: () => void;
}): React.JSX.Element {
  return (
    <div className="controls">
      {listening ? (
        <button type="button" className="mic-btn is-live" onClick={onStop} aria-label="Pause listening">
          <span className="mic-glyph" aria-hidden="true">
            <span className="eq"><i /><i /><i /></span>
          </span>
          Pause
        </button>
      ) : (
        <button type="button" className="mic-btn is-idle" onClick={onStart} aria-label="Start listening">
          <span className="mic-glyph mic-glyph-idle" aria-hidden="true">●</span>
          Start
        </button>
      )}
      <span className="status" role="status">
        {statusText(status, listening)}
      </span>
    </div>
  );
}
