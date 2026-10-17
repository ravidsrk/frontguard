import { s } from "../../lib/style";

export function SignalTelemetryBand() {
  return (
    <section className="fg-section">
      <div className="fg-shell">
        <div style={s("max-width: 780px;")}>
          <h2
            className="fg-h2"
            style={s("max-width: 24ch; margin-bottom: 18px;")}
          >
            Sub-pixel font drift, hydration jitter, and global whitespace
            dilution turn visual suites into alert fatigue.
          </h2>
          <p className="fg-lead" style={s("max-width: 64ch;")}>
            Full-page pixel thresholds divide changed pixels by the entire
            canvas—drowning a broken button inside 1.3 million unchanged pixels
            while failing builds over 1px font hinting shifts.
          </p>
        </div>
      </div>
    </section>
  );
}
