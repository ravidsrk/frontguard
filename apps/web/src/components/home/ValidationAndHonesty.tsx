import { s } from "../../lib/style";
import {
  VALIDATION,
  VALIDATION_GATE,
  VALIDATION_METHODOLOGY_URL,
  VALIDATION_RESULTS_URL,
  formatPercent,
  partitionRepos,
} from "../../lib/validation-data";
import { HONEST_CARDS, MONO } from "./home-data";

export function ValidationAndHonesty() {
  const { booted, skipped } = partitionRepos();
  const { aggregate } = VALIDATION;
  const fpWithinTarget =
    aggregate.pixelFalsePositiveRate <= VALIDATION_GATE.maxFalsePositiveRate;
  const fpColor = fpWithinTarget ? "#4fb477" : "#e8862e";

  const kpis = [
    {
      label: "REPOS BOOTED",
      value: `${aggregate.reposBooted} / ${aggregate.reposAttempted}`,
      sub: `${aggregate.reposSkipped} skipped: boot failures documented below`,
      color: "#f5f1ea",
    },
    {
      label: "ROUTE RECHECKS",
      value: `${aggregate.recheckMeasuredRouteCount} / 43`,
      sub: `${aggregate.recheckRouteCount} passed · 4 route errors across booted repos`,
      color: "#f5f1ea",
    },
    {
      label: "PIXEL FALSE-POSITIVE RATE",
      value: formatPercent(aggregate.pixelFalsePositiveRate),
      sub: `${aggregate.recheckPositiveCount} FP across ${aggregate.recheckMeasuredRouteCount} no-change rechecks (gate ≤ ${formatPercent(VALIDATION_GATE.maxFalsePositiveRate)})`,
      color: fpColor,
    },
    {
      label: "AI CALLS IN HARNESS",
      value: VALIDATION.aiEnabled ? "ON" : "AI OFF",
      sub: "AI disabled; classifier accuracy was not measured in that run",
      color: "#e8862e",
    },
  ];

  return (
    <section
      id="validation"
      style={s("border-bottom: 1px solid #1f1c19; background: #0d0c0b;")}
    >
      <div
        className="fg-shell"
        style={s("padding-top: 96px; padding-bottom: 96px;")}
      >
        {/* Part 1: Architectural Honesty Principles */}
        <div style={s("max-width: 720px; margin-bottom: 40px;")}>
          <div className="fg-eyebrow" style={s("margin-bottom: 14px;")}>
            // RADICAL HONESTY · VISIBLE LIMITS
          </div>
          <h2 className="fg-h2" style={s("margin-bottom: 12px;")}>
            Built for engineers who read the source before they trust the badge.
          </h2>
          <p className="fg-lead">
            Visual testing only works when teams trust its signal. We separate
            deterministic pixel math from optional model inference and publish
            every benchmark failure.
          </p>
        </div>

        <div className="fg-grid-3" style={s("margin-bottom: 72px;")}>
          {HONEST_CARDS.map((h) => (
            <div
              key={h.label}
              style={s(
                "background: #131210; border: 1px solid #26221e; border-radius: 8px; padding: 26px;",
              )}
            >
              <div
                style={{
                  fontFamily: MONO,
                  ...s(
                    `font-size: 12px; color: ${h.color}; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 12px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px;`,
                  ),
                }}
              >
                <span
                  style={s(
                    `width: 7px; height: 7px; border-radius: 999px; background: ${h.color};`,
                  )}
                />
                <span>{h.label}</span>
              </div>
              <p
                style={s(
                  "margin: 0; font-size: 14px; color: #c8c0b6; line-height: 1.65;",
                )}
              >
                {h.body}
              </p>
            </div>
          ))}
        </div>

        {/* Part 2: Real Validation Harness Numbers */}
        <div
          style={s(
            "display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 36px; gap: 32px; flex-wrap: wrap; padding-top: 48px; border-top: 1px solid #1f1c19;",
          )}
        >
          <div>
            <div className="fg-eyebrow" style={s("margin-bottom: 14px;")}>
              // VALIDATION HARNESS · REAL-WORLD BENCHMARKS
            </div>
            <h2 className="fg-h2" style={s("max-width: 680px;")}>
              Numbers from a real harness, not a slide.
            </h2>
          </div>
          <div
            style={s(
              "display: flex; flex-direction: column; align-items: flex-start; gap: 8px;",
            )}
          >
            <div
              style={{
                fontFamily: MONO,
                ...s(
                  `display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; background: rgba(79,180,119,0.08); border: 1px solid ${fpColor}; border-radius: 4px; font-size: 12px; color: ${fpColor}; letter-spacing: 0.06em; text-transform: uppercase;`,
                ),
              }}
            >
              <span>●</span>
              <span>
                METHODOLOGY:{" "}
                {aggregate.methodologyValidated ? "VALIDATED" : "PENDING"}
              </span>
            </div>
            <div
              style={{
                fontFamily: MONO,
                ...s("font-size: 12px; color: #a89f94;"),
              }}
            >
              CLI v{VALIDATION.cliVersion} · {VALIDATION.runDate}
            </div>
          </div>
        </div>

        {/* 4 KPI Cards */}
        <div className="fg-hairline-grid-4" style={s("margin-bottom: 32px;")}>
          {kpis.map((k) => (
            <div
              key={k.label}
              style={s(
                "background: #131210; padding: 24px 22px; display: flex; flex-direction: column; justify-content: space-between; min-height: 136px;",
              )}
            >
              <div
                style={{
                  fontFamily: MONO,
                  ...s(
                    "font-size: 12px; color: #a89f94; letter-spacing: 0.06em; text-transform: uppercase;",
                  ),
                }}
              >
                {k.label}
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  ...s(
                    `font-size: 32px; font-weight: 700; color: ${k.color}; letter-spacing: -0.02em; margin: 8px 0; font-variant-numeric: tabular-nums;`,
                  ),
                }}
              >
                {k.value}
              </div>
              <div
                style={s(
                  "font-size: 13px; color: #c8c0b6; line-height: 1.5;",
                )}
              >
                {k.sub}
              </div>
            </div>
          ))}
        </div>

        {/* Booted vs Skipped Split */}
        <div className="fg-split-2" style={s("gap: 24px;")}>
          <div
            style={s(
              "background: #131210; border: 1px solid #26221e; border-radius: 8px; padding: 26px;",
            )}
          >
            <div
              style={{
                fontFamily: MONO,
                ...s(
                  "font-size: 12px; color: #4fb477; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 14px;",
                ),
              }}
            >
              ✓ BOOTED &amp; MEASURED ({booted.length})
            </div>
            <div
              style={s("display: flex; flex-direction: column; gap: 14px;")}
            >
              {booted.map((r) => (
                <div
                  key={r.name}
                  style={s(
                    "padding: 14px 16px; background: #0d0c0b; border: 1px solid #1f1c19; border-radius: 6px;",
                  )}
                >
                  <div
                    style={s(
                      "display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 6px; flex-wrap: wrap;",
                    )}
                  >
                    <span
                      style={s(
                        "font-size: 15px; font-weight: 600; color: #f5f1ea;",
                      )}
                    >
                      {r.name}
                    </span>
                    <span
                      style={{
                        fontFamily: MONO,
                        ...s("font-size: 12px; color: #a89f94;"),
                      }}
                    >
                      {r.category}
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      ...s(
                        "font-size: 12px; color: #c8c0b6; display: flex; flex-wrap: wrap; gap: 12px;",
                      ),
                    }}
                  >
                    <span>{r.recheckPass} routes passed</span>
                    <span>·</span>
                    <span>
                      FP:{" "}
                      <strong
                        style={s(
                          `color: ${
                            r.recheckFalsePositive === 0
                              ? "#4fb477"
                              : "#e8862e"
                          }; font-weight: 600;`,
                        )}
                      >
                        {r.recheckFalsePositive} (
                        {formatPercent(r.pixelFalsePositiveRate)})
                      </strong>
                    </span>
                    <span>·</span>
                    <span style={s("color: #a89f94;")}>
                      {r.recheckError} error{r.recheckError !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            style={s(
              "background: #131210; border: 1px solid #26221e; border-radius: 8px; padding: 26px;",
            )}
          >
            <div
              style={{
                fontFamily: MONO,
                ...s(
                  "font-size: 12px; color: #e8862e; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 6px;",
                ),
              }}
            >
              ⊘ SKIPPED IN THIS RUN ({skipped.length}) · HONEST REPORTING
            </div>
            <p
              style={s(
                "margin: 0 0 14px 0; font-size: 14px; color: #c8c0b6; line-height: 1.55;",
              )}
            >
              These repositories failed to boot in the headless harness before
              Frontguard ran. We list them rather than quietly dropping them
              from the denominator.
            </p>
            <div
              style={s("display: flex; flex-direction: column; gap: 10px;")}
            >
              {skipped.map((r) => (
                <div
                  key={r.name}
                  data-testid="skipped-repo"
                  style={s(
                    "padding: 12px 14px; background: #0d0c0b; border: 1px solid #1f1c19; border-radius: 6px;",
                  )}
                >
                  <div
                    style={s(
                      "display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 4px;",
                    )}
                  >
                    <span
                      style={s(
                        "font-size: 14px; font-weight: 600; color: #d8d0c5;",
                      )}
                    >
                      {r.name}
                    </span>
                    <span
                      style={{
                        fontFamily: MONO,
                        ...s("font-size: 12px; color: #a89f94;"),
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
                          "font-size: 12px; color: #c8c0b6; line-height: 1.5;",
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

        {/* Methodology Footer Bar */}
        <div
          style={{
            fontFamily: MONO,
            ...s(
              "margin-top: 20px; padding: 14px 18px; background: #131210; border: 1px solid #26221e; border-radius: 6px; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; font-size: 12px; color: #a89f94;",
            ),
          }}
        >
          <div>
            Run date: {VALIDATION.runDate} · CLI v{VALIDATION.cliVersion} · AI
            mode: {VALIDATION.aiEnabled ? "enabled" : "disabled"}
          </div>
          <div style={s("display: flex; gap: 18px; flex-wrap: wrap;")}>
            <a
              href={VALIDATION_RESULTS_URL}
              target="_blank"
              rel="noreferrer"
              style={s("color: #e8862e; text-decoration: none;")}
            >
              Published results →
            </a>
            <a
              href={VALIDATION_METHODOLOGY_URL}
              target="_blank"
              rel="noreferrer"
              style={s("color: #c8c0b6; text-decoration: none;")}
            >
              Methodology &amp; reproduction script →
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
