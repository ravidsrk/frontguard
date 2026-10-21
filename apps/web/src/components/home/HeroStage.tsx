import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { s } from "../../lib/style";
import {
  MONO,
  VIEWPORT_SCENARIOS,
  useCopy,
  type ViewportId,
} from "./home-data";

const HERO_STATS = [
  {
    value: "39 / 43",
    highlight: true,
    label: "Routes verified cleanly",
    qualifier: "route rechecks completed in the published local harness",
    todo: 'TODO: confirm meaning, e.g. "39 of 43 real regressions caught in [suite name]"',
  },
  {
    value: "2 / 5",
    highlight: false,
    label: "Benchmark repos booted",
    qualifier: "fixture repositories booted successfully",
    todo: "TODO: confirm meaning of 2 / 5 repository benchmark denominator",
  },
  {
    value: "0 AI calls",
    highlight: false,
    label: "Fully deterministic unless you opt in",
    qualifier: "classifier accuracy was not measured in that run",
    todo: null,
  },
  {
    value: "1 HOST",
    highlight: false,
    label: "Runs on a single machine",
    qualifier: "macOS only; cross-OS equivalence remains unproven",
    todo: "TODO: confirm single-host / cross-OS qualification wording",
  },
] as const;

export function HeroStage() {
  const [installCopied, copyInstall] = useCopy();
  const [viewport, setViewport] = useState<ViewportId>("1440");
  const [curtainPct, setCurtainPct] = useState<number>(52);
  const scenario = VIEWPORT_SCENARIOS[viewport];

  return (
    <section className="fg-section" style={s("position: relative; overflow: hidden;")}>
      <div className="fg-shell" style={s("position: relative;")}>
        <div className="fg-hero-grid">
          {/* Left Column: Core Proposition + 2 CTAs */}
          <div>
            <div className="fg-eyebrow" style={s("margin-bottom: 16px;")}>
              DETERMINISTIC VISUAL REGRESSION TESTING · MIT OPEN SOURCE
            </div>

            <h1 className="fg-h1">
              Catch the regression, not the noise.
            </h1>

            <p className="fg-lead" style={s("margin-bottom: 32px;")}>
              Deterministic visual regression testing for engineers and AI
              coding agents. Run local pixel and perceptual similarity checks in
              CI without mandatory cloud accounts.
            </p>

            {/* Max 2 CTAs: 1 Primary (copyable install command in --accent), 1 Secondary (Docs, ghost) */}
            <div
              style={s(
                "display: flex; align-items: stretch; gap: 12px; flex-wrap: wrap;",
              )}
            >
              <button
                type="button"
                onClick={() => copyInstall("npm install @frontguard/cli")}
                aria-label="Copy command: npm install @frontguard/cli"
                className="fg-btn-primary"
                style={{
                  fontFamily: MONO,
                  ...s(
                    "display: inline-flex; align-items: center; gap: 14px; padding: 13px 18px; background: var(--accent); border: 1px solid var(--accent); border-radius: 6px; font-size: 13px; font-weight: 600; color: var(--bg); cursor: pointer;",
                  ),
                }}
              >
                <span>$ npm install @frontguard/cli</span>
                <span
                  style={s(
                    "font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(13,12,11,0.18); color: var(--bg);",
                  )}
                >
                  {installCopied ? "Copied ✓" : "Copy"}
                </span>
              </button>

              <Link
                to="/docs/$"
                params={{ _splat: "getting-started/quickstart" }}
                className="fg-btn-ghost"
                style={s(
                  "padding: 13px 20px; background: transparent; color: var(--text-primary); border: 1px solid var(--border); font-weight: 500; font-size: 15px; border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 8px;",
                )}
              >
                Read the docs →
              </Link>
            </div>
          </div>

          {/* Right Column: Large Legible Pixel-Diff Viewfinder */}
          <div
            data-testid="hero-optical-viewfinder"
            style={s(
              "background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; box-shadow: 0 24px 64px rgba(0,0,0,0.5);",
            )}
          >
            {/* Top Bar: Route + Viewport Switcher */}
            <div
              style={{
                fontFamily: MONO,
                ...s(
                  "display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; background: #171512; border-bottom: 1px solid var(--border); font-size: 12px; flex-wrap: wrap;",
                ),
              }}
            >
              <div
                style={s(
                  "display: flex; align-items: center; gap: 8px; color: var(--text-secondary);",
                )}
              >
                <span
                  style={s(
                    "width: 8px; height: 8px; border-radius: 999px; background: var(--danger); display: inline-block;",
                  )}
                />
                <span style={s("color: var(--text-primary); font-weight: 600;")}>
                  {scenario.route}
                </span>
                <span style={s("color: var(--text-muted);")}>·</span>
                <span style={s("color: var(--text-muted);")}>
                  {scenario.device}
                </span>
              </div>

              <div
                role="group"
                aria-label="Preview viewport width"
                style={s(
                  "display: inline-flex; background: var(--bg); border: 1px solid var(--border); border-radius: 5px; padding: 2px; gap: 2px;",
                )}
              >
                {(["1440", "768", "375"] as const).map((vp) => {
                  const active = viewport === vp;
                  return (
                    <button
                      key={vp}
                      type="button"
                      onClick={() => setViewport(vp)}
                      aria-pressed={active}
                      style={{
                        fontFamily: MONO,
                        ...s(
                          `padding: 4px 9px; font-size: 11px; border-radius: 3px; border: 1px solid ${
                            active ? "var(--accent)" : "transparent"
                          }; cursor: pointer; background: ${
                            active ? "var(--accent-subtle)" : "transparent"
                          }; color: ${
                            active ? "var(--text-primary)" : "var(--text-muted)"
                          }; font-weight: ${active ? 600 : 400};`,
                        ),
                      }}
                    >
                      {VIEWPORT_SCENARIOS[vp].label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optical Split Canvas */}
            <div
              className="fg-dot-canvas"
              style={s(
                "position: relative; height: 300px; overflow: hidden; user-select: none;",
              )}
            >
              {/* Baseline Layer */}
              <div
                style={s(
                  "position: absolute; inset: 16px; background: #141210; border: 1px solid var(--border); border-radius: 6px; padding: 16px; display: grid; grid-template-columns: 96px 1fr; gap: 14px;",
                )}
              >
                <div
                  style={s(
                    "background: #1a1714; border: 1px solid var(--border); border-radius: 4px; padding: 10px; display: flex; flex-direction: column; justify-content: space-between;",
                  )}
                >
                  <div style={s("display: grid; gap: 6px;")}>
                    <div
                      style={s(
                        "height: 8px; width: 70%; background: #332e29; border-radius: 2px;",
                      )}
                    />
                    <div
                      style={s(
                        "height: 8px; width: 85%; background: #26221e; border-radius: 2px;",
                      )}
                    />
                    <div
                      style={s(
                        "height: 8px; width: 60%; background: #26221e; border-radius: 2px;",
                      )}
                    />
                  </div>
                  <div
                    style={s(
                      "height: 36px; background: var(--success); border-radius: 4px; display: flex; align-items: center; justify-content: center;",
                    )}
                  >
                    <span
                      style={{
                        fontFamily: MONO,
                        ...s(
                          "font-size: 10px; font-weight: 700; color: var(--bg);",
                        ),
                      }}
                    >
                      CTA 36px
                    </span>
                  </div>
                </div>

                <div
                  style={s(
                    "display: flex; flex-direction: column; justify-content: space-between;",
                  )}
                >
                  <div
                    style={s(
                      "display: flex; justify-content: space-between; align-items: center;",
                    )}
                  >
                    <div
                      style={s(
                        "height: 14px; width: 150px; background: #332e29; border-radius: 3px;",
                      )}
                    />
                    <span
                      style={{
                        fontFamily: MONO,
                        ...s(
                          "font-size: 11px; color: var(--success); background: rgba(79,180,119,0.12); border: 1px solid rgba(79,180,119,0.35); padding: 2px 8px; border-radius: 3px;",
                        ),
                      }}
                    >
                      BASELINE
                    </span>
                  </div>
                  <div
                    style={s(
                      "display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;",
                    )}
                  >
                    {[0, 1, 2].map((idx) => (
                      <div
                        key={idx}
                        style={s(
                          "height: 76px; background: #191714; border: 1px solid var(--border); border-radius: 4px; padding: 10px;",
                        )}
                      >
                        <div
                          style={s(
                            "height: 7px; width: 55%; background: #2d2823; border-radius: 2px; margin-bottom: 10px;",
                          )}
                        />
                        <div
                          style={s(
                            "height: 16px; width: 78%; background: #3d3630; border-radius: 2px;",
                          )}
                        />
                      </div>
                    ))}
                  </div>
                  <div
                    style={s(
                      "height: 68px; background: #191714; border: 1px solid var(--border); border-radius: 4px; padding: 10px; display: flex; align-items: flex-end; gap: 6px;",
                    )}
                  >
                    {[38, 56, 44, 72, 62, 84, 68, 90, 76, 94].map((h, i) => (
                      <div
                        key={i}
                        style={s(
                          `flex: 1; height: ${h}%; background: #2e2924; border-radius: 2px 2px 0 0;`,
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Candidate Overlay Layer with Diff Bounding Boxes */}
              <div
                style={s(
                  `position: absolute; inset: 16px; background: #141210; border: 1px solid var(--border); border-radius: 6px; padding: 16px; display: grid; grid-template-columns: 96px 1fr; gap: 14px; clip-path: inset(0 0 0 ${curtainPct}%);`,
                )}
              >
                <div
                  style={s(
                    "background: #1a1714; border: 1px solid var(--border); border-radius: 4px; padding: 10px; display: flex; flex-direction: column; justify-content: space-between;",
                  )}
                >
                  <div style={s("display: grid; gap: 6px;")}>
                    <div
                      style={s(
                        "height: 8px; width: 70%; background: #332e29; border-radius: 2px;",
                      )}
                    />
                    <div
                      style={s(
                        "height: 8px; width: 85%; background: #26221e; border-radius: 2px;",
                      )}
                    />
                    <div
                      style={s(
                        "height: 8px; width: 60%; background: #26221e; border-radius: 2px;",
                      )}
                    />
                  </div>
                  {/* Regressed collapsed CTA */}
                  <div
                    style={s(
                      "height: 12px; background: rgba(229,72,77,0.28); border: 1px dashed var(--danger); border-radius: 3px;",
                    )}
                  />
                </div>

                <div
                  style={s(
                    "display: flex; flex-direction: column; justify-content: space-between;",
                  )}
                >
                  <div
                    style={s(
                      "display: flex; justify-content: space-between; align-items: center;",
                    )}
                  >
                    <div
                      style={s(
                        "height: 14px; width: 150px; background: #332e29; border-radius: 3px;",
                      )}
                    />
                    <span
                      style={{
                        fontFamily: MONO,
                        ...s(
                          "font-size: 11px; color: #ff8a8d; background: rgba(229,72,77,0.14); border: 1px solid rgba(229,72,77,0.4); padding: 2px 8px; border-radius: 3px;", // #ff8a8d is 7.2:1 on the composited chip; --danger is 4.15:1 at 11px
                        ),
                      }}
                    >
                      ✘ REGRESSION · {scenario.diffPct}
                    </span>
                  </div>
                  <div
                    style={s(
                      "display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;",
                    )}
                  >
                    {[0, 1, 2].map((idx) => (
                      <div
                        key={idx}
                        style={s(
                          "height: 76px; background: #191714; border: 1px solid var(--border); border-radius: 4px; padding: 10px;",
                        )}
                      >
                        <div
                          style={s(
                            "height: 7px; width: 55%; background: #2d2823; border-radius: 2px; margin-bottom: 10px;",
                          )}
                        />
                        <div
                          style={s(
                            "height: 16px; width: 78%; background: #3d3630; border-radius: 2px;",
                          )}
                        />
                      </div>
                    ))}
                  </div>
                  <div
                    style={s(
                      "height: 68px; background: #191714; border: 1px solid var(--border); border-radius: 4px; padding: 10px; display: flex; align-items: flex-end; gap: 6px;",
                    )}
                  >
                    {[38, 56, 44, 72, 62, 84, 68, 90, 76, 94].map((h, i) => (
                      <div
                        key={i}
                        style={s(
                          `flex: 1; height: ${h}%; background: #2e2924; border-radius: 2px 2px 0 0;`,
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Ignored Noise Bounding Box (Green) */}
              <div
                style={s(
                  `position: absolute; left: ${scenario.noiseBox.x}%; top: ${scenario.noiseBox.y}%; width: ${scenario.noiseBox.w}%; height: ${scenario.noiseBox.h}%; border: 1px dashed var(--success); background: rgba(79,180,119,0.08); border-radius: 4px; pointer-events: none;`,
                )}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "position: absolute; top: -19px; left: 0; font-size: 10px; color: var(--success); background: var(--bg); padding: 1px 6px; border: 1px solid rgba(79,180,119,0.4); border-radius: 3px; white-space: nowrap;",
                    ),
                  }}
                >
                  {scenario.noiseBox.label}
                </span>
              </div>

              {/* Flagged Regression Cluster Bounding Box (Red) */}
              <div
                style={s(
                  `position: absolute; left: ${scenario.clusterBox.x}%; top: ${scenario.clusterBox.y}%; width: ${scenario.clusterBox.w}%; height: ${scenario.clusterBox.h}%; border: 2px solid var(--danger); background: rgba(229,72,77,0.16); border-radius: 4px; pointer-events: none;`,
                )}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "position: absolute; bottom: -21px; left: 0; font-size: 10px; color: var(--bg); background: var(--danger); padding: 1px 6px; border-radius: 3px; white-space: nowrap; font-weight: 600;", // --bg on --danger is 5.0:1; --text-primary on --danger is 3.47:1 at 10px
                    ),
                  }}
                >
                  {scenario.clusterBox.label}
                </span>
              </div>

              {/* Curtain Divider */}
              <div
                style={s(
                  `position: absolute; top: 0; bottom: 0; left: ${curtainPct}%; width: 2px; background: var(--text-primary); pointer-events: none;`,
                )}
              />
            </div>

            {/* Interactive Split Slider Footer */}
            <div
              style={{
                fontFamily: MONO,
                ...s(
                  "padding: 12px 16px; background: #161412; border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; font-size: 12px;",
                ),
              }}
            >
              <div
                style={s(
                  "display: flex; align-items: center; gap: 10px; flex: 1; min-width: 200px;",
                )}
              >
                <span style={s("color: var(--text-muted); font-size: 11px;")}>
                  SPLIT
                </span>
                <input
                  type="range"
                  min={10}
                  max={90}
                  value={curtainPct}
                  onChange={(e) => setCurtainPct(Number(e.target.value))}
                  aria-label="Hero baseline vs current split slider"
                  className="fg-range-slider"
                />
                <span
                  style={s(
                    "color: var(--text-primary); min-width: 36px; text-align: right;",
                  )}
                >
                  {curtainPct}%
                </span>
              </div>

              <div
                style={s(
                  "display: flex; align-items: center; gap: 12px; color: var(--text-secondary);",
                )}
              >
                <span>
                  Chroma SSIM:{" "}
                  <strong style={s("color: var(--danger);")}>
                    {scenario.chromaSsim}
                  </strong>
                </span>
                <span style={s("color: var(--text-muted);")}>·</span>
                <span>
                  Settled:{" "}
                  <strong style={s("color: var(--success);")}>
                    {scenario.settledFrames} frames
                  </strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Merged 4-Stat Strip (ONLY place these stats appear on the page) */}
        <div
          className="fg-hairline-grid-4"
          style={s("margin-top: 64px; border-radius: 8px; overflow: hidden;")}
        >
          {HERO_STATS.map((stat) => (
            <div
              key={stat.value}
              style={s(
                "background: var(--surface); padding: 24px; display: flex; flex-direction: column; justify-content: space-between; gap: 10px;",
              )}
            >
              <div>
                <div
                  style={{
                    fontFamily: MONO,
                    ...s(
                      `font-size: 28px; font-weight: 700; letter-spacing: -0.03em; color: ${
                        stat.highlight ? "var(--accent)" : "var(--text-primary)"
                      }; margin-bottom: 6px; font-variant-numeric: tabular-nums;`,
                    ),
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={s(
                    "font-size: 15px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;",
                  )}
                >
                  {stat.label}
                </div>
                <p
                  style={s(
                    "margin: 0; font-size: 14px; color: var(--text-secondary); line-height: 1.5;",
                  )}
                >
                  {stat.qualifier}
                </p>
              </div>
              {stat.todo && (
                <div className="fg-todo-note">{stat.todo}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
