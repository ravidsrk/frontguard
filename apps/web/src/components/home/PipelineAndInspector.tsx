import { useRef, useState, type KeyboardEvent } from "react";
import { s } from "../../lib/style";
import {
  DIFF_MODES,
  MONO,
  PIPELINE_PHASES,
   type DiffModeId,
} from "./home-data";

export function PipelineAndInspector() {
  const [activeDiffMode, setActiveDiffMode] =
    useState<DiffModeId>("cluster-ssim");
  const [inspectorCurtain, setInspectorCurtain] = useState<number>(50);
  const [onionOpacity, setOnionOpacity] = useState<number>(55);
  const [stabilitySettled, setStabilitySettled] = useState<boolean>(true);
  const diffTabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const onDiffTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = DIFF_MODES.findIndex((m) => m.id === activeDiffMode);
    if (currentIndex === -1) return;
    let nextIndex: number;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % DIFF_MODES.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + DIFF_MODES.length) % DIFF_MODES.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = DIFF_MODES.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextMode = DIFF_MODES[nextIndex];
    setActiveDiffMode(nextMode.id);
    diffTabRefs.current[nextIndex]?.focus();
  };

  return (
    <>
      {/* Section 4: How It Works (6 stages grouped into 3 connected phases + merged 3 pillars) */}
      <section className="fg-section">
        <div className="fg-shell">
          <div style={s("max-width: 720px; margin-bottom: 56px;")}>
            <div className="fg-eyebrow">HOW FRONTGUARD WORKS</div>
            <h2 className="fg-h2">
              Three connected phases from route discovery to verified report.
            </h2>
            <p className="fg-lead">
              Six pipeline stages grouped into three architectural phases—running
              local pixel and perceptual similarity checks before optional model
              analysis.
            </p>
          </div>

          <div className="fg-phases-flow">
            {PIPELINE_PHASES.map((p, idx) => (
              <div
                key={p.phase}
                className="fg-surface-card"
                style={s(
                  "display: flex; flex-direction: column; justify-content: space-between; gap: 24px; position: relative;",
                )}
              >
                <div>
                  <div
                    style={s(
                      "display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px;",
                    )}
                  >
                    <span
                      style={{
                        fontFamily: MONO,
                        ...s(
                          "font-size: 11px; color: var(--text-muted); letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600;",
                        ),
                      }}
                    >
                      {p.phase} · {p.name.toUpperCase()}
                    </span>
                    <span
                      style={{
                        fontFamily: MONO,
                        ...s(
                          "font-size: 11px; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--border); color: var(--text-secondary); background: var(--bg);",
                        ),
                      }}
                    >
                      {idx < 2 ? `Phase ${idx + 1} →` : "Phase 3 · Final"}
                    </span>
                  </div>

                  <h3
                    className="fg-h3"
                    style={s("font-size: 22px; margin-bottom: 12px;")}
                  >
                    {p.outcome}
                  </h3>

                  {/* Connected Stage Pills inside this Phase */}
                  <div
                    style={s(
                      "display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px;",
                    )}
                  >
                    {p.stages.map((st) => (
                      <div
                        key={st.n}
                        style={{
                          fontFamily: MONO,
                          ...s(
                            "font-size: 11px; padding: 4px 9px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); display: inline-flex; align-items: center; gap: 6px;",
                          ),
                        }}
                      >
                        <span style={s("color: var(--text-muted);")}>
                          {st.n}
                        </span>
                        <span style={s("font-weight: 600;")}>{st.name}</span>
                      </div>
                    ))}
                  </div>

                  <p className="fg-body" style={s("font-size: 15px;")}>
                    {p.desc}
                  </p>
                </div>

                <div
                  style={s(
                    "padding-top: 14px; border-top: 1px solid var(--border); display: grid; gap: 6px;",
                  )}
                >
                  {p.specs.map((specItem) => (
                    <div
                      key={specItem}
                      style={{
                        fontFamily: MONO,
                        ...s(
                          "font-size: 12px; color: var(--text-secondary); display: flex; align-items: center; gap: 8px;",
                        ),
                      }}
                    >
                      <span style={s("color: var(--text-muted);")}>›</span>
                      <span>{specItem}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 5: Product Proof — Full-Width Before/After Diff Visual on --surface-raised */}
      <section className="fg-section-raised">
        <div className="fg-shell">
          <div
            style={s(
              "display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; margin-bottom: 40px; flex-wrap: wrap;",
            )}
          >
            <div>
              <h2 className="fg-h2">
                See what Frontguard flags—and what it ignores.
              </h2>
              <p className="fg-lead">
                Instead of averaging changed pixels across a 1440×900 canvas,
                Frontguard extracts 8-connected bounding boxes and scores each
                cluster with local Chroma SSIM and wavelet CW-SSIM.
              </p>
            </div>
            <div className="fg-todo-note">
              TODO: pair interactive inspector with high-res production screenshot capture
            </div>
          </div>

          <div
            data-testid="visual-diff-inspector"
            style={s(
              "background: var(--bg); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; box-shadow: 0 20px 56px rgba(0,0,0,0.45);",
            )}
          >
            {/* Workbench Header + Accessible Tablist */}
            <div
              style={s(
                "display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 20px; background: var(--surface); border-bottom: 1px solid var(--border); flex-wrap: wrap;",
              )}
            >
              <div
                role="tablist"
                aria-label="Visual diff inspection view"
                onKeyDown={onDiffTabKeyDown}
                style={s(
                  "display: flex; gap: 4px; background: var(--bg); border: 1px solid var(--border); padding: 4px; border-radius: 6px; flex-wrap: wrap;",
                )}
              >
                {DIFF_MODES.map((m, index) => {
                  const active = activeDiffMode === m.id;
                  return (
                    <button
                      key={m.id}
                      ref={(el) => {
                        diffTabRefs.current[index] = el;
                      }}
                      id={`diff-tab-${m.id}`}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-controls={`diff-panel-${m.id}`}
                      tabIndex={active ? 0 : -1}
                      onClick={() => setActiveDiffMode(m.id)}
                      style={{
                        fontFamily: MONO,
                        ...s(
                          `padding: 7px 12px; border-radius: 4px; border: 1px solid ${
                            active ? "var(--accent)" : "transparent"
                          }; background: ${
                            active ? "var(--accent-subtle)" : "transparent"
                          }; color: ${
                            active ? "var(--text-primary)" : "var(--text-muted)"
                          }; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;`,
                        ),
                      }}
                    >
                      <span style={s("color: var(--text-muted);")}>
                        [{m.keyHint}]
                      </span>
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setStabilitySettled((prev) => !prev)}
                aria-pressed={stabilitySettled}
                style={{
                  fontFamily: MONO,
                  ...s(
                    `padding: 7px 12px; border-radius: 5px; border: 1px solid ${
                      stabilitySettled
                        ? "rgba(79,180,119,0.45)"
                        : "var(--border)"
                    }; background: ${
                      stabilitySettled
                        ? "rgba(79,180,119,0.1)"
                        : "var(--surface)"
                    }; color: ${
                      stabilitySettled
                        ? "var(--success)"
                        : "var(--text-secondary)"
                    }; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px;`,
                  ),
                }}
              >
                <span>●</span>
                <span>
                  waitForStability:{" "}
                  {stabilitySettled ? "ON (settled in 3 frames)" : "OFF"}
                </span>
              </button>
            </div>

            {/* Active Mode Stage */}
            <div
              id={`diff-panel-${activeDiffMode}`}
              role="tabpanel"
              aria-labelledby={`diff-tab-${activeDiffMode}`}
              className="fg-dot-canvas"
              style={s("padding: 28px; min-height: 320px;")}
            >
              {activeDiffMode === "side-by-side" && (
                <div className="fg-split-2" style={s("gap: 20px;")}>
                  <MockFrame
                    title="BASELINE · frontguard-baselines"
                    badge="COMMIT 8f4c21a"
                    badgeColor="var(--success)"
                    regressed={false}
                    showClusters={false}
                  />
                  <MockFrame
                    title="CURRENT · PR branch render"
                    badge="✘ 1.84% DIFF"
                    badgeColor="var(--danger)"
                    regressed={true}
                    showClusters={true}
                  />
                </div>
              )}

              {activeDiffMode === "swipe" && (
                <div>
                  <div
                    style={s(
                      "position: relative; height: 260px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface);",
                    )}
                  >
                    <div style={s("position: absolute; inset: 0; padding: 16px;")}>
                      <MockFrame
                        title="BASELINE"
                        badge="LEFT"
                        badgeColor="var(--success)"
                        regressed={false}
                        showClusters={false}
                      />
                    </div>
                    <div
                      style={s(
                        `position: absolute; inset: 0; padding: 16px; background: var(--surface); clip-path: inset(0 0 0 ${inspectorCurtain}%);`,
                      )}
                    >
                      <MockFrame
                        title="CURRENT CANDIDATE"
                        badge="RIGHT · REGRESSION"
                        badgeColor="var(--danger)"
                        regressed={true}
                        showClusters={true}
                      />
                    </div>
                    <div
                      style={s(
                        `position: absolute; top: 0; bottom: 0; left: ${inspectorCurtain}%; width: 2px; background: var(--text-primary); pointer-events: none;`,
                      )}
                    />
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      ...s(
                        "margin-top: 14px; display: flex; align-items: center; gap: 12px; font-size: 12px; color: var(--text-secondary);",
                      ),
                    }}
                  >
                    <span>SWIPE POSITION</span>
                    <input
                      type="range"
                      min={5}
                      max={95}
                      value={inspectorCurtain}
                      onChange={(e) =>
                        setInspectorCurtain(Number(e.target.value))
                      }
                      aria-label="Inspector swipe curtain position"
                      className="fg-range-slider"
                      style={s("max-width: 280px;")}
                    />
                    <span style={s("color: var(--text-primary);")}>
                      {inspectorCurtain}%
                    </span>
                  </div>
                </div>
              )}

              {activeDiffMode === "onion" && (
                <div>
                  <div
                    style={s(
                      "position: relative; height: 260px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface); padding: 16px;",
                    )}
                  >
                    <div style={s("position: absolute; inset: 16px;")}>
                      <MockFrame
                        title="ONION SKIN COMPOSITE"
                        badge="inspect_diff_cluster_dom → verify_css_patch"
                        badgeColor="var(--text-primary)"
                        regressed={false}
                        showClusters={false}
                      />
                    </div>
                    <div
                      style={s(
                        `position: absolute; inset: 16px; opacity: ${
                          onionOpacity / 100
                        };`,
                      )}
                    >
                      <MockFrame
                        title="ONION SKIN COMPOSITE"
                        badge={`ALPHA ${onionOpacity}%`}
                        badgeColor="var(--danger)"
                        regressed={true}
                        showClusters={true}
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      ...s(
                        "margin-top: 14px; display: flex; align-items: center; gap: 12px; font-size: 12px; color: var(--text-secondary);",
                      ),
                    }}
                  >
                    <span>CANDIDATE OPACITY</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={onionOpacity}
                      onChange={(e) => setOnionOpacity(Number(e.target.value))}
                      aria-label="Onion skin opacity"
                      className="fg-range-slider"
                      style={s("max-width: 280px;")}
                    />
                    <span style={s("color: var(--text-primary);")}>
                      {onionOpacity}%
                    </span>
                  </div>
                </div>
              )}

              {activeDiffMode === "cluster-ssim" && (
                <div className="fg-split-2" style={s("gap: 24px; align-items: stretch;")}>
                  <MockFrame
                    title="CONNECTED-COMPONENT CLUSTER OVERLAY"
                    badge="2 REGIONS SCORED"
                    badgeColor="var(--danger)"
                    regressed={true}
                    showClusters={true}
                  />
                  <div
                    style={s(
                      "display: flex; flex-direction: column; justify-content: space-between; gap: 14px;",
                    )}
                  >
                    {/* Flagged Cluster Card */}
                    <div
                      style={s(
                        "padding: 18px; background: var(--surface); border: 1px solid rgba(229,72,77,0.45); border-radius: 8px;",
                      )}
                    >
                      <div
                        style={{
                          fontFamily: MONO,
                          ...s(
                            "display: flex; justify-content: space-between; font-size: 12px; color: var(--danger); font-weight: 600; margin-bottom: 8px;",
                          ),
                        }}
                      >
                        <span>✘ FLAGGED · CLUSTER #1 (aside .sidebar-cta)</span>
                        <span>Chroma SSIM (YCbCr): 0.614</span>
                      </div>
                      <p className="fg-small" style={s("margin: 0;")}>
                        Primary sidebar CTA collapsed from{" "}
                        <code style={{ fontFamily: MONO, color: "var(--text-primary)" }}>
                          36px
                        </code>{" "}
                        to{" "}
                        <code style={{ fontFamily: MONO, color: "var(--text-primary)" }}>
                          0px
                        </code>{" "}
                        height inside bounding box{" "}
                        <code style={{ fontFamily: MONO, color: "var(--text-primary)" }}>
                          148×164px @ (48, 224)
                        </code>
                        .
                      </p>
                    </div>

                    {/* Ignored Noise Card */}
                    <div
                      style={s(
                        "padding: 18px; background: var(--surface); border: 1px solid rgba(79,180,119,0.4); border-radius: 8px;",
                      )}
                    >
                      <div
                        style={{
                          fontFamily: MONO,
                          ...s(
                            "display: flex; justify-content: space-between; font-size: 12px; color: var(--success); font-weight: 600; margin-bottom: 8px;",
                          ),
                        }}
                      >
                        <span>✓ IGNORED NOISE · REGION #2 (h1.page-title)</span>
                        <span>CW-SSIM: 0.994</span>
                      </div>
                      <p className="fg-small" style={s("margin: 0;")}>
                        1px sub-pixel font anti-aliasing shift along glyph stems.
                        Complex wavelet phase consistency exceeds{" "}
                        <code style={{ fontFamily: MONO, color: "var(--text-primary)" }}>
                          0.985
                        </code>
                        , so Frontguard suppresses the false alarm.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Caption explaining what Frontguard flagged and what noise it ignored */}
            <div
              style={s(
                "padding: 16px 24px; background: var(--surface); border-top: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;",
              )}
            >
              <p className="fg-small" style={s("margin: 0;")}>
                <strong style={s("color: var(--text-primary);")}>
                  Why this matters:
                </strong>{" "}
                Frontguard flagged the collapsed{" "}
                <code style={{ fontFamily: MONO, color: "var(--text-primary)" }}>
                  aside .sidebar-cta
                </code>{" "}
                button (<code style={{ fontFamily: MONO }}>Chroma SSIM 0.614</code>)
                while automatically suppressing 1px sub-pixel glyph hinting on the
                header (<code style={{ fontFamily: MONO }}>CW-SSIM 0.994</code>).
              </p>
              <span
                style={{
                  fontFamily: MONO,
                  ...s("font-size: 12px; color: var(--text-muted);"),
                }}
              >
                🔒 redactSensitive: 2 inputs masked
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function MockFrame({
  title,
  badge,
  badgeColor,
  regressed,
  showClusters,
}: {
  title: string;
  badge: string;
  badgeColor: string;
  regressed: boolean;
  showClusters: boolean;
}) {
  return (
    <div
      style={s(
        "background: #141210; border: 1px solid var(--border); border-radius: 6px; padding: 14px; height: 224px; display: flex; flex-direction: column; justify-content: space-between; position: relative;",
      )}
    >
      <div
        style={{
          fontFamily: MONO,
          ...s(
            "display: flex; align-items: center; justify-content: space-between; font-size: 11px; padding-bottom: 10px; border-bottom: 1px solid var(--border);",
          ),
        }}
      >
        <span style={s("color: var(--text-secondary);")}>{title}</span>
        <span style={s(`color: ${badgeColor}; font-weight: 600;`)}>{badge}</span>
      </div>

      <div
        style={s(
          "display: grid; grid-template-columns: 92px 1fr; gap: 12px; flex: 1; padding-top: 10px;",
        )}
      >
        <div
          style={s(
            "background: #191714; border: 1px solid var(--border); border-radius: 4px; padding: 8px; display: flex; flex-direction: column; justify-content: space-between; position: relative;",
          )}
        >
          <div style={s("display: grid; gap: 5px;")}>
            <div
              style={s("height: 6px; width: 70%; background: #2f2a25;")}
            />
            <div
              style={s("height: 6px; width: 85%; background: #25211d;")}
            />
          </div>
          {regressed ? (
            <div
              style={s(
                "height: 8px; background: rgba(229,72,77,0.35); border: 1px dashed var(--danger); border-radius: 2px;",
              )}
            />
          ) : (
            <div
              style={s(
                "height: 30px; background: var(--success); border-radius: 3px; display: flex; align-items: center; justify-content: center;",
              )}
            >
              <span
                style={{
                  fontFamily: MONO,
                  ...s("font-size: 9px; font-weight: 700; color: var(--bg);"),
                }}
              >
                CTA
              </span>
            </div>
          )}

          {showClusters && (
            <div
              style={s(
                "position: absolute; left: 4px; right: 4px; bottom: 4px; height: 42px; border: 2px solid var(--danger); background: rgba(229,72,77,0.14); border-radius: 3px;",
              )}
            />
          )}
        </div>

        <div
          style={s(
            "display: flex; flex-direction: column; justify-content: space-between; position: relative;",
          )}
        >
          <div
            style={s(
              "height: 14px; width: 62%; background: #332e29; border-radius: 2px;",
            )}
          />
          {showClusters && (
            <div
              style={s(
                "position: absolute; top: -2px; left: -2px; width: 66%; height: 18px; border: 1px dashed var(--success); background: rgba(79,180,119,0.08); border-radius: 3px;",
              )}
            />
          )}
          <div
            style={s(
              "display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;",
            )}
          >
            <div
              style={s(
                "height: 54px; background: #191714; border: 1px solid var(--border); border-radius: 3px;",
              )}
            />
            <div
              style={s(
                "height: 54px; background: #191714; border: 1px solid var(--border); border-radius: 3px;",
              )}
            />
          </div>
          <div
            style={s(
              "height: 44px; background: #191714; border: 1px solid var(--border); border-radius: 3px;",
            )}
          />
        </div>
      </div>
    </div>
  );
}
