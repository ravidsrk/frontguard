import { s } from "../../lib/style";
import {
  VALIDATION,
  VALIDATION_METHODOLOGY_URL,
  VALIDATION_RESULTS_URL,
  formatPercent,
  partitionRepos,
} from "../../lib/validation-data";
import { MONO } from "./home-data";

export function ValidationAndHonesty() {
  const { booted, skipped } = partitionRepos();
  const { aggregate } = VALIDATION;

  return (
    <section id="validation" className="fg-section">
      <div className="fg-shell">
        {/* Merged Header: Trust + Real Harness Methodology */}
        <div style={s("max-width: 740px; margin-bottom: 48px;")}>
          <div className="fg-eyebrow">OPEN-SOURCE PROOF &amp; TRUST</div>
          <h2 className="fg-h2">
            Built for engineers who read the source before they trust the badge.
          </h2>
          <p className="fg-lead">
            Visual testing only works when teams trust its signal. We separate
            deterministic pixel math from optional model inference and publish
            every benchmark script, result artifact, and boot failure.
          </p>
        </div>

        {/* 2-Column Split: 3-Point Harness Methodology Summary + Transparent Skipped Repos */}
        <div className="fg-split-2" style={s("margin-bottom: 40px;")}>
          {/* Left Card: 3-Point Harness Methodology Summary */}
          <div
            className="fg-surface-card"
            style={s(
              "display: flex; flex-direction: column; justify-content: space-between; gap: 24px;",
            )}
          >
            <div>
              <div
                style={s(
                  "display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; flex-wrap: wrap;",
                )}
              >
                <h3 className="fg-h3" style={s("margin: 0;")}>
                  Numbers from a real harness, not a slide.
                </h3>
                <span
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "font-size: 11px; color: var(--accent); background: var(--accent-subtle); border: 1px solid var(--accent); padding: 2px 8px; border-radius: 4px; font-weight: 600;",
                    ),
                  }}
                >
                  {formatPercent(aggregate.pixelFalsePositiveRate)} FP RATE
                </span>
              </div>

              <div style={s("display: grid; gap: 14px;")}>
                <div
                  style={s(
                    "padding: 14px 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;",
                  )}
                >
                  <div
                    style={s(
                      "font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;",
                    )}
                  >
                    1. Zero-change recheck gate
                  </div>
                  <p className="fg-small" style={s("margin: 0;")}>
                    Booted{" "}
                    {booted.map((b) => b.name).join(" and ")} locally and
                    re-ran{" "}
                    <code style={{ fontFamily: MONO, color: "var(--text-primary)" }}>
                      {aggregate.recheckMeasuredRouteCount}
                    </code>{" "}
                    routes with zero code changes—recording{" "}
                    <code style={{ fontFamily: MONO, color: "var(--success)" }}>
                      {aggregate.recheckPositiveCount}
                    </code>{" "}
                    pixel false positives.
                  </p>
                </div>

                <div
                  style={s(
                    "padding: 14px 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;",
                  )}
                >
                  <div
                    style={s(
                      "font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;",
                    )}
                  >
                    2. Deterministic offline baseline
                  </div>
                  <p className="fg-small" style={s("margin: 0;")}>
                    Executed on CLI v{VALIDATION.cliVersion} ({VALIDATION.runDate})
                    with AI disabled so every pass/fail decision reflects pure
                    pixel and perceptual SSIM thresholds.
                  </p>
                </div>

                <div
                  style={s(
                    "padding: 14px 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;",
                  )}
                >
                  <div
                    style={s(
                      "font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;",
                    )}
                  >
                    3. Reproducible open-source script
                  </div>
                  <p className="fg-small" style={s("margin: 0;")}>
                    Every fixture repository, route list, and raw JSON output is
                    checked into the repository for independent verification.
                  </p>
                </div>
              </div>
            </div>

            <div
              style={{
                fontFamily: MONO,
                ...s(
                  "padding-top: 14px; border-top: 1px solid var(--border); display: flex; gap: 20px; flex-wrap: wrap; font-size: 12px;",
                ),
              }}
            >
              <a
                href={VALIDATION_RESULTS_URL}
                target="_blank"
                rel="noreferrer"
                className="fg-link"
                style={s("color: var(--text-primary); text-decoration: none;")}
              >
                Published results JSON →
              </a>
              <a
                href={VALIDATION_METHODOLOGY_URL}
                target="_blank"
                rel="noreferrer"
                className="fg-link"
                style={s("color: var(--text-secondary); text-decoration: none;")}
              >
                Reproduction script (validate-v020.mjs) →
              </a>
            </div>
          </div>

          {/* Right Card: Transparent Reporting of Skipped Fixture Repos */}
          <div className="fg-surface-card">
            <div
              style={{
                fontFamily: MONO,
                ...s(
                  "font-size: 11px; color: var(--text-muted); letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px; font-weight: 600;",
                ),
              }}
            >
              UNEDITED DENOMINATOR · {skipped.length} REPOS SKIPPED ON BOOT
            </div>
            <p className="fg-small" style={s("margin: 0 0 16px 0;")}>
              These fixture repositories failed headless environment boot before
              Frontguard ran. We publish them alongside booted repos rather than
              quietly dropping them from the denominator.
            </p>

            <div style={s("display: grid; gap: 10px;")}>
              {skipped.map((r) => (
                <div
                  key={r.name}
                  data-testid="skipped-repo"
                  style={s(
                    "padding: 12px 14px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px;",
                  )}
                >
                  <div
                    style={s(
                      "display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 4px;",
                    )}
                  >
                    <span
                      style={s(
                        "font-size: 14px; font-weight: 600; color: var(--text-primary);",
                      )}
                    >
                      {r.name}
                    </span>
                    <span
                      style={{
                        fontFamily: MONO,
                        ...s("font-size: 11px; color: var(--text-muted);"),
                      }}
                    >
                      {r.category}
                    </span>
                  </div>
                  {r.skipReason && (
                    <div
                      style={{
                        fontFamily: MONO,
                        ...s(
                          "font-size: 11.5px; color: var(--text-secondary); line-height: 1.5;",
                        ),
                      }}
                    >
                      {r.skipReason}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* External Social Proof Placeholders (Unfabricated TODOs per spec) */}
        <div
          style={s(
            "padding: 20px 24px; background: var(--surface); border: 1px dashed var(--border); border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;",
          )}
        >
          <div className="fg-small">
            <strong style={s("color: var(--text-primary);")}>
              External adoption &amp; community proof:
            </strong>{" "}
            Insert verified community metrics and adopter feedback here once
            approved.
          </div>
          <div style={s("display: flex; gap: 10px; flex-wrap: wrap;")}>
            <span className="fg-todo-note">
              TODO: insert verified GitHub star count
            </span>
            <span className="fg-todo-note">
              TODO: insert approved user / team logos
            </span>
            <span className="fg-todo-note">
              TODO: insert verified engineer quote
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
