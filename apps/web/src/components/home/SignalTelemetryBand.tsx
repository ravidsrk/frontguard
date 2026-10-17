import { s } from "../../lib/style";
import { MONO, TELEMETRY_STATS } from "./home-data";

export function SignalTelemetryBand() {
  return (
    <section
      style={s(
        "border-bottom: 1px solid #1f1c19; background: #100f0e;",
      )}
    >
      <div
        className="fg-shell"
        style={s("padding-top: 64px; padding-bottom: 64px;")}
      >
        <div
          style={s(
            "display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; flex-wrap: wrap; margin-bottom: 36px;",
          )}
        >
          <div style={s("max-width: 680px;")}>
            <div className="fg-eyebrow" style={s("margin-bottom: 14px;")}>
              // WHY TEAMS MUTE VISUAL TESTS
            </div>
            <h2
              className="fg-h2"
              style={s("margin: 0 0 12px 0; max-width: 640px;")}
            >
              Sub-pixel font drift, hydration jitter, and global whitespace
              dilution turn visual suites into alert fatigue.
            </h2>
            <p className="fg-lead">
              Frontguard isolates localized UI clusters before computing YCbCr
              Chroma SSIM and Complex Wavelet phase similarity, and publishes
              its benchmark harness limits openly.
            </p>
          </div>
          <a
            href="#validation"
            style={{
              fontFamily: MONO,
              ...s(
                "font-size: 12px; color: #e8862e; text-decoration: none; padding: 8px 12px; border: 1px solid rgba(232,134,46,0.32); border-radius: 5px; background: rgba(232,134,46,0.06); white-space: nowrap;",
              ),
            }}
          >
            Inspect full validation harness →
          </a>
        </div>

        <div className="fg-hairline-grid-4">
          {TELEMETRY_STATS.map((st) => (
            <div
              key={st.v}
              style={s(
                "background: #131210; padding: 24px 22px; display: flex; flex-direction: column; justify-content: space-between; gap: 10px;",
              )}
            >
              <div>
                <div
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "font-size: 12px; color: #a89f94; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 8px;",
                    ),
                  }}
                >
                  {st.tag}
                </div>
                <div
                  style={{
                    fontFamily: MONO,
                    ...s(
                      `font-size: 32px; font-weight: 700; color: ${st.c}; letter-spacing: -0.03em; font-variant-numeric: tabular-nums;`,
                    ),
                  }}
                >
                  {st.v}
                </div>
              </div>
              <div
                style={s(
                  "font-size: 14px; color: #c8c0b6; line-height: 1.55;",
                )}
              >
                {st.d}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
