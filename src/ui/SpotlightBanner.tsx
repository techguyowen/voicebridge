import { dismissAlert, useStore } from "./store";

/**
 * Slim floating alert pill. The active-speaker display now lives in the
 * header island, so this only surfaces fresh own-name / keyword alerts.
 */
export function SpotlightBanner(): React.JSX.Element | null {
  const { lastAlertMatch } = useStore();

  const alertFresh = lastAlertMatch !== null && Date.now() - lastAlertMatch.timestamp < 12_000;
  if (!alertFresh || !lastAlertMatch) return null;

  return (
    <div className="alert-banner" role="alert">
      <span className="alert-bell" aria-hidden="true">🔔</span>
      <span className="alert-text">
        Mentioned: &quot;{lastAlertMatch.word}&quot;
        {lastAlertMatch.speakerName ? ` — ${lastAlertMatch.speakerName}` : ""}
      </span>
      <button type="button" className="alert-dismiss" onClick={() => dismissAlert()}>
        Dismiss
      </button>
    </div>
  );
}
