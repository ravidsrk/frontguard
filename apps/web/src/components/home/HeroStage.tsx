import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { s } from "../../lib/style";
import { MONO, useCopy } from "./home-data";

type ViewportOption = 375 | 768 | 1440;

const VIEWPORT_META: Record<
  ViewportOption,
  {
    diffPct: string;
    chromaSsim: string;
    cwSsim: string;
    bbox: string;
    sidebarWidth: string;
    cardsCols: string;
  }
> = {
  1440: {
    diffPct: "1.84%",
    chromaSsim: "61.4%",
    cwSsim: "58.9%",
    bbox: "(48, 224) 148×164px",
    sidebarWidth: "34%",
    cardsCols: "repeat(2, minmax(0, 1fr))",
  },
  768: {
    diffPct: "2.31%",
    chromaSsim: "59.2%",
    cwSsim: "56.4%",
    bbox: "(28, 196) 132×148px",
    sidebarWidth: "38%",
    cardsCols: "repeat(2, minmax(0, 1fr))",
  },
  375: {
    diffPct: "3.12%",
    chromaSsim: "54.8%",
    cwSsim: "52.1%",
    bbox: "(16, 178) 118×136px",
    sidebarWidth: "42%",
    cardsCols: "1fr",
  },
};

export function HeroStage() {
  const [heroCopied, copyHero] = useCopy();
  const [viewport, setViewport] = useState<ViewportOption>(1440);
  const [splitPct, setSplitPct] = useState<number>(52);
  const [showClusterBox, setShowClusterBox] = useState<boolean>(true);

  const meta = VIEWPORT_META[viewport];

  return (
    <section
      className="fg-dot-canvas"
      style={s(
        "position: relative; overflow: hidden; border-bottom: 1px solid #1f1c19;",
      )}
    >
      <div
        style={s(
          "position: absolute; top: -180px; right: -80px; width: 680px; height: 680px; background: radial-gradient(circle, rgba(232,134,46,0.13) 0%, rgba(232,134,46,0.03) 42%, transparent 70%); pointer-events: none;",
        )}
      />
      <div
        className="fg-shell"
        style={s("padding-top: 68px; padding-bottom: 84px; position: relative;")}
      >
        <div className="fg-hero-grid">
          {/* Left column: Value proposition, install command, CTAs */}
          <div>
            <div
              style={s(
                "display: inline-flex; align-items: center; gap: 10px; padding: 6px 12px 6px 10px; background: #161412; border: 1px solid #2a2622; border-radius: 999px; margin-bottom: 24px;",
              )}
            >
              <span
                style={s(
                  "width: 8px; height: 8px; border-radius: 999px; background: #4fb477;",
                )}
              />
              <span
                style={{
                  fontFamily: MONO,
                  ...s(
                    "font-size: 12px; color: #c8c0b6; letter-spacing: 0.04em;",
                  ),
                }}
              >
                v0.2.3 RC · CLI-FIRST · PLAYWRIGHT · MCP VISUAL CORTEX
              </span>
            </div>

            <h1
              style={s(
                "margin: 0 0 22px 0; font-size: clamp(40px, 5vw, 60px); line-height: 1.04; letter-spacing: -0.035em; font-weight: 700; color: #f5f1ea;",
              )}
            >
              Catch the regression,{" "}
              <br />
              <span style={s("color: #e8862e;")}>not the noise.</span>
            </h1>

            <p
              style={s(
                "margin: 0 0 28px 0; font-size: 17px; line-height: 1.65; color: #c8c0b6; max-width: 540px;",
              )}
            >
              Open-source visual regression testing for engineers and AI coding
              agents. Deterministic pixel diffing with connected-component
              clustering, YCbCr Chroma SSIM, frame stability convergence, and
              optional BYOK analysis.
            </p>

            {/* Primary Copyable Install Bar */}
            <div
              style={s(
                "display: flex; align-items: stretch; gap: 10px; max-width: 520px; margin-bottom: 18px; flex-wrap: wrap;",
              )}
            >
              <button
                type="button"
                onClick={() => copyHero("npm install @frontguard/cli")}
                aria-label="Copy command: npm install @frontguard/cli"
                style={{
                  fontFamily: MONO,
                  ...s(
                    "flex: 1 1 290px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 13px 16px; background: #141210; border: 1px solid #2a2622; border-radius: 6px; font-size: 13px; color: #f5f1ea; cursor: pointer; text-align: left;",
                  ),
                }}
              >
                <span>
                  <span style={s("color: #e8862e; margin-right: 10px;")}>
                    $
                  </span>
                  npm install @frontguard/cli
                </span>
                <span
                  style={s(
                    `font-size: 12px; color: ${heroCopied ? "#4fb477" : "#a89f94"}; padding: 2px 8px; border-radius: 3px; background: #1d1a17; border: 1px solid #2a2622;`,
                  )}
                >
                  {heroCopied ? "copied ✓" : "copy"}
                </span>
              </button>
              <a
                href="#install"
                style={s(
                  "padding: 13px 20px; background: #e8862e; color: #0d0c0b; font-weight: 600; font-size: 14px; border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; white-space: nowrap;",
                )}
              >
                Quickstart →
              </a>
            </div>

            {/* Dual-Persona Pill Row (Human Engineers + Coding Agents) */}
            <div
              style={s(
                "display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px;",
              )}
            >
              <Link
                to="/docs/$"
                params={{ _splat: "getting-started/quickstart" }}
                style={{
                  fontFamily: MONO,
                  ...s(
                    "font-size: 12px; color: #c8c0b6; background: #131210; border: 1px solid #24201c; border-radius: 4px; padding: 6px 10px; text-decoration: none;",
                  ),
                }}
              >
                Read the docs →
              </Link>
              <Link
                to="/docs/$"
                params={{ _splat: "integrations/mcp" }}
                style={{
                  fontFamily: MONO,
                  ...s(
                    "font-size: 12px; color: #e8862e; background: rgba(232,134,46,0.08); border: 1px solid rgba(232,134,46,0.28); border-radius: 4px; padding: 6px 10px; text-decoration: none;",
                  ),
                }}
              >
                @frontguard/mcp · 7 agent tools →
              </Link>
              <a
                href="https://github.com/ravidsrk/frontguard"
                target="_blank"
                rel="noreferrer"
                style={{
                  fontFamily: MONO,
                  ...s(
                    "font-size: 12px; color: #a89f94; background: #131210; border: 1px solid #24201c; border-radius: 4px; padding: 6px 10px; text-decoration: none;",
                  ),
                }}
              >
                GitHub (MIT) ↗
              </a>
            </div>

            {/* Technical Trust Strip */}
            <div
              style={{
                fontFamily: MONO,
                ...s(
                  "display: flex; flex-wrap: wrap; align-items: center; gap: 14px; font-size: 12px; color: #a89f94; padding-top: 14px; border-top: 1px solid #1f1c19;",
                ),
              }}
            >
              <span>✓ Open-source (MIT)</span>
              <span aria-hidden="true" style={s("color: #a89f94;")}>·</span>
              <span>✓ Git orphan baselines</span>
              <span aria-hidden="true" style={s("color: #a89f94;")}>·</span>
              <span>✓ Frame stability &amp; PII redaction</span>
              <span aria-hidden="true" style={s("color: #a89f94;")}>·</span>
              <span>✓ Optional BYOK AI</span>
            </div>
          </div>

          {/* Right column: Interactive Optical Split-Curtain Viewfinder */}
          <div
            data-testid="hero-optical-viewfinder"
            style={s(
              "background: #131210; border: 1px solid #2a2622; border-radius: 10px; overflow: hidden; box-shadow: 0 24px 64px rgba(0,0,0,0.55);",
            )}
          >
            {/* Viewfinder Top Telemetry Chrome */}
            <div
              style={s(
                "display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; background: #181613; border-bottom: 1px solid #26221e; flex-wrap: wrap;",
              )}
            >
              <div style={s("display: flex; align-items: center; gap: 8px;")}>
                <span
                  style={s(
                    "width: 9px; height: 9px; border-radius: 999px; background: #e5484d;",
                  )}
                />
                <span
                  style={{
                    fontFamily: MONO,
                    ...s("font-size: 12px; color: #f5f1ea; font-weight: 600;"),
                  }}
                >
                  /dashboard
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "font-size: 12px; color: #ff8b8e; background: rgba(229,72,77,0.12); border: 1px solid rgba(229,72,77,0.35); padding: 2px 7px; border-radius: 3px;",
                    ),
                  }}
                >
                  ✘ REGRESSION · {meta.diffPct}
                </span>
              </div>

              {/* Interactive Viewport Switcher */}
              <div
                role="group"
                aria-label="Hero preview viewport width"
                style={s("display: flex; align-items: center; gap: 4px;")}
              >
                {([375, 768, 1440] as const).map((vp) => {
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
                          `padding: 4px 8px; font-size: 12px; border-radius: 3px; cursor: pointer; border: 1px solid ${
                            active ? "#e8862e" : "#2a2622"
                          }; background: ${
                            active ? "rgba(232,134,46,0.14)" : "#131210"
                          }; color: ${active ? "#f5f1ea" : "#a89f94"};`,
                        ),
                      }}
                    >
                      {vp}px
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setShowClusterBox((prev) => !prev)}
                  aria-pressed={showClusterBox}
                  style={{
                    fontFamily: MONO,
                    ...s(
                      `padding: 4px 8px; font-size: 12px; border-radius: 3px; cursor: pointer; border: 1px solid ${
                        showClusterBox ? "rgba(229,72,77,0.5)" : "#2a2622"
                      }; background: ${
                        showClusterBox ? "rgba(229,72,77,0.12)" : "#131210"
                      }; color: ${showClusterBox ? "#f5f1ea" : "#a89f94"};`,
                    ),
                  }}
                >
                  [1] bbox
                </button>
              </div>
            </div>

            {/* Sub-header Layer Badges */}
            <div
              style={{
                fontFamily: MONO,
                ...s(
                  "display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 14px; background: #100f0d; border-bottom: 1px solid #1f1c19; font-size: 12px; color: #a89f94; flex-wrap: wrap;",
                ),
              }}
            >
              <span>
                <span style={s("color: #4fb477;")}>◀ BASELINE</span>{" "}
                (frontguard-baselines)
              </span>
              <span style={s("color: #c8c0b6;")}>
                Chroma SSIM {meta.chromaSsim} · CW-SSIM {meta.cwSsim} ·{" "}
                <span style={s("color: #4fb477;")}>✓ Settled (2f)</span>
              </span>
              <span>
                (PR #142){" "}
                <span style={s("color: #e8862e;")}>CURRENT ▶</span>
              </span>
            </div>

            {/* Interactive Split-Curtain Viewport Canvas */}
            <div
              style={s(
                "position: relative; height: 248px; background: #0c0b0a; overflow: hidden; user-select: none;",
              )}
            >
              {/* Layer A (Full width underneath): CURRENT PR Render (broken .sidebar-cta) */}
              <div
                style={s(
                  "position: absolute; inset: 0; padding: 14px; display: flex; flex-direction: column; gap: 10px;",
                )}
              >
                <div
                  style={s(
                    "min-height: 28px; background: #171513; border: 1px solid #25211d; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; padding: 4px 10px;",
                  )}
                >
                  <span
                    style={s(
                      "display: inline-block; width: 68px; height: 6px; background: #3b3531; border-radius: 2px;",
                    )}
                  />
                  <span
                    style={{
                      fontFamily: MONO,
                      ...s(
                        "font-size: 12px; color: #a89f94; background: #1d1a17; border: 1px solid #2a2622; padding: 2px 6px; border-radius: 2px;",
                      ),
                    }}
                  >
                    🔒████████ redacted
                  </span>
                </div>

                <div
                  style={s(
                    "flex: 1; display: flex; gap: 10px; min-height: 0;",
                  )}
                >
                  {/* Sidebar in CURRENT render: CTA collapsed */}
                  <div
                    style={s(
                      `width: ${meta.sidebarWidth}; background: #151311; border: 1px solid rgba(229,72,77,0.45); border-radius: 5px; padding: 10px; display: flex; flex-direction: column; justify-content: space-between; position: relative;`,
                    )}
                  >
                    <div
                      style={s(
                        "display: flex; flex-direction: column; gap: 6px;",
                      )}
                    >
                      <div
                        style={s(
                          "height: 7px; width: 78%; background: #332e2a; border-radius: 2px;",
                        )}
                      />
                      <div
                        style={s(
                          "height: 7px; width: 62%; background: #26221e; border-radius: 2px;",
                        )}
                      />
                      <div
                        style={s(
                          "height: 7px; width: 70%; background: #26221e; border-radius: 2px;",
                        )}
                      />
                    </div>

                    {/* Collapsed CTA slot */}
                    <div
                      style={s(
                        "min-height: 36px; padding: 6px 8px; border: 1px dashed #e5484d; background: rgba(229,72,77,0.14); border-radius: 4px; display: flex; align-items: center; justify-content: center;",
                      )}
                    >
                      <span
                        style={{
                          fontFamily: MONO,
                          ...s(
                            "font-size: 12px; color: #ff8b8e; font-weight: 600;",
                          ),
                        }}
                      >
                        .sidebar-cta 0px
                      </span>
                    </div>
                  </div>

                  {/* Main cards in CURRENT render */}
                  <div
                    style={s(
                      `flex: 1; display: grid; grid-template-columns: ${meta.cardsCols}; gap: 8px;`,
                    )}
                  >
                    <div
                      style={s(
                        "background: #141210; border: 1px solid #24201c; border-radius: 5px; padding: 10px;",
                      )}
                    >
                      <div
                        style={s(
                          "width: 45%; height: 6px; background: #2a2622; border-radius: 2px; margin-bottom: 8px;",
                        )}
                      />
                      <div
                        style={s(
                          "width: 72%; height: 14px; background: #332e2a; border-radius: 2px;",
                        )}
                      />
                    </div>
                    <div
                      style={s(
                        "background: #141210; border: 1px solid #24201c; border-radius: 5px; padding: 10px;",
                      )}
                    >
                      <div
                        style={s(
                          "width: 50%; height: 6px; background: #2a2622; border-radius: 2px; margin-bottom: 8px;",
                        )}
                      />
                      <div
                        style={s(
                          "width: 64%; height: 14px; background: #332e2a; border-radius: 2px;",
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Layer B (Clipped to left splitPct%): BASELINE Render (intact .sidebar-cta) */}
              <div
                style={s(
                  `position: absolute; inset: 0; padding: 14px; display: flex; flex-direction: column; gap: 10px; background: #0e0d0b; clip-path: inset(0 ${100 - splitPct}% 0 0);`,
                )}
              >
                <div
                  style={s(
                    "min-height: 28px; background: #171513; border: 1px solid #25211d; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; padding: 4px 10px;",
                  )}
                >
                  <span
                    style={s(
                      "display: inline-block; width: 68px; height: 6px; background: #3b3531; border-radius: 2px;",
                    )}
                  />
                  <span
                    style={{
                      fontFamily: MONO,
                      ...s(
                        "font-size: 12px; color: #a89f94; background: #1d1a17; border: 1px solid #2a2622; padding: 2px 6px; border-radius: 2px;",
                      ),
                    }}
                  >
                    🔒████████ redacted
                  </span>
                </div>

                <div
                  style={s(
                    "flex: 1; display: flex; gap: 10px; min-height: 0;",
                  )}
                >
                  {/* Sidebar in BASELINE render: Intact amber button */}
                  <div
                    style={s(
                      `width: ${meta.sidebarWidth}; background: #151311; border: 1px solid #26221e; border-radius: 5px; padding: 10px; display: flex; flex-direction: column; justify-content: space-between;`,
                    )}
                  >
                    <div
                      style={s(
                        "display: flex; flex-direction: column; gap: 6px;",
                      )}
                    >
                      <div
                        style={s(
                          "height: 7px; width: 78%; background: #332e2a; border-radius: 2px;",
                        )}
                      />
                      <div
                        style={s(
                          "height: 7px; width: 62%; background: #26221e; border-radius: 2px;",
                        )}
                      />
                      <div
                        style={s(
                          "height: 7px; width: 70%; background: #26221e; border-radius: 2px;",
                        )}
                      />
                    </div>

                    <div
                      style={s(
                        "min-height: 36px; padding: 6px 8px; background: #e8862e; border-radius: 4px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.45);",
                      )}
                    >
                      <span
                        style={{
                          fontFamily: MONO,
                          ...s(
                            "font-size: 12px; color: #0d0c0b; font-weight: 700;",
                          ),
                        }}
                      >
                        Upgrade Plan →
                      </span>
                    </div>
                  </div>

                  {/* Main cards in BASELINE render */}
                  <div
                    style={s(
                      `flex: 1; display: grid; grid-template-columns: ${meta.cardsCols}; gap: 8px;`,
                    )}
                  >
                    <div
                      style={s(
                        "background: #141210; border: 1px solid #24201c; border-radius: 5px; padding: 10px;",
                      )}
                    >
                      <div
                        style={s(
                          "width: 45%; height: 6px; background: #2a2622; border-radius: 2px; margin-bottom: 8px;",
                        )}
                      />
                      <div
                        style={s(
                          "width: 72%; height: 14px; background: #332e2a; border-radius: 2px;",
                        )}
                      />
                    </div>
                    <div
                      style={s(
                        "background: #141210; border: 1px solid #24201c; border-radius: 5px; padding: 10px;",
                      )}
                    >
                      <div
                        style={s(
                          "width: 50%; height: 6px; background: #2a2622; border-radius: 2px; margin-bottom: 8px;",
                        )}
                      />
                      <div
                        style={s(
                          "width: 64%; height: 14px; background: #332e2a; border-radius: 2px;",
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Set-of-Mark [1] Cluster Bounding Box Overlay */}
              {showClusterBox && (
                <div
                  style={s(
                    `position: absolute; left: 18px; bottom: 18px; width: calc(${meta.sidebarWidth} - 14px); height: 52px; border: 1.5px solid #e5484d; border-radius: 5px; pointer-events: none;`,
                  )}
                >
                  <span
                    style={{
                      fontFamily: MONO,
                      ...s(
                        "position: absolute; top: -22px; left: -1px; background: #e5484d; color: #0d0c0b; font-size: 12px; font-weight: 700; padding: 1px 6px; border-radius: 2px; white-space: nowrap;",
                      ),
                    }}
                  >
                    [1] {meta.bbox}
                  </span>
                </div>
              )}

              {/* Split Curtain Divider Line & Handle */}
              <div
                style={s(
                  `position: absolute; top: 0; bottom: 0; left: ${splitPct}%; width: 2px; background: #e8862e; box-shadow: 0 2px 8px rgba(0,0,0,0.5); pointer-events: none;`,
                )}
              >
                <div
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); padding: 3px 8px; border-radius: 999px; background: #e8862e; color: #0d0c0b; font-size: 12px; font-weight: 700; white-space: nowrap; box-shadow: 0 2px 10px rgba(0,0,0,0.6);",
                    ),
                  }}
                >
                  ◀ {splitPct}% ▶
                </div>
              </div>
            </div>

            {/* Interactive Split Curtain Slider Control Bar */}
            <div
              style={s(
                "display: flex; align-items: center; gap: 12px; padding: 10px 14px; background: #151311; border-top: 1px solid #24201c; border-bottom: 1px solid #24201c;",
              )}
            >
              <span
                style={{
                  fontFamily: MONO,
                  ...s("font-size: 12px; color: #a89f94; white-space: nowrap;"),
                }}
              >
                SPLIT CURTAIN
              </span>
              <input
                type="range"
                min={10}
                max={90}
                value={splitPct}
                onChange={(e) => setSplitPct(Number(e.target.value))}
                aria-label="Hero baseline vs current split slider"
                className="fg-range-slider"
              />
              <span
                style={{
                  fontFamily: MONO,
                  ...s(
                    "font-size: 12px; color: #f5f1ea; min-width: 38px; text-align: right;",
                  ),
                }}
              >
                {splitPct}%
              </span>
            </div>

            {/* Compact Terminal Output Readout */}
            <div
              style={{
                fontFamily: MONO,
                ...s(
                  "padding: 12px 14px; background: #0f0e0c; font-size: 12px; line-height: 1.65; color: #c8c0b6;",
                ),
              }}
            >
              <div>
                <span style={s("color: #e8862e;")}>
                  $ npx -p @frontguard/cli frontguard run --affected
                </span>
              </div>
              <div style={s("color: #a89f94;")}>
                ✓ 12/47 routes affected · 3 viewports · waitForStability settled
              </div>
              <div>
                <span style={s("color: #ff8b8e;")}>✘ /dashboard</span>{" "}
                <span style={s("color: #a89f94;")}>({viewport}px)</span> ·{" "}
                <span style={s("color: #e8862e;")}>1 warning</span> ·{" "}
                <span style={s("color: #4fb477;")}>9 passed</span> ·{" "}
                <span style={s("color: #5b8def;")}>1 new</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
