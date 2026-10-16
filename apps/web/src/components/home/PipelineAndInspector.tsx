import { useRef, useState, type KeyboardEvent } from "react";
import { s } from "../../lib/style";
import { MONO, STAGES } from "./home-data";

type InspectorTabId = "side-by-side" | "cluster-ssim" | "mcp-cortex";

const INSPECTOR_TABS: ReadonlyArray<{ id: InspectorTabId; label: string }> = [
  { id: "side-by-side", label: "Side-by-Side" },
  { id: "cluster-ssim", label: "Cluster + Chroma SSIM" },
  { id: "mcp-cortex", label: "MCP Agent Cortex" },
];

export function PipelineAndInspector() {
  const [inspectorTab, setInspectorTab] =
    useState<InspectorTabId>("cluster-ssim");
  const [redactEnabled, setRedactEnabled] = useState(true);
  const [stabilityEnabled, setStabilityEnabled] = useState(true);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = INSPECTOR_TABS.findIndex(
      (t) => t.id === inspectorTab,
    );
    if (currentIndex === -1) return;
    let nextIndex: number;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % INSPECTOR_TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + INSPECTOR_TABS.length) % INSPECTOR_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = INSPECTOR_TABS.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextTab = INSPECTOR_TABS[nextIndex];
    setInspectorTab(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <section
      id="how"
      style={s("border-bottom: 1px solid #1f1c19; background: #0d0c0b;")}
    >
      <div
        className="fg-shell"
        style={s("padding-top: 96px; padding-bottom: 96px;")}
      >
        <div
          style={s(
            "display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 48px; gap: 32px; flex-wrap: wrap;",
          )}
        >
          <div>
            <div className="fg-eyebrow" style={s("margin-bottom: 14px;")}>
              // HOW IT WORKS · SIX STAGES, ONE COMMAND
            </div>
            <h2 className="fg-h2" style={s("max-width: 680px;")}>
              From <code style={{ fontFamily: MONO, color: "#e8862e" }}>frontguard run</code>{" "}
              to a verified visual diff in six deterministic stages.
            </h2>
          </div>
          <p className="fg-lead" style={s("max-width: 400px;")}>
            Run the full pipeline or stop at any stage. Disable AI for a pure
            local pixel + perceptual SSIM gate.
          </p>
        </div>

        {/* 6-Stage Pipeline Track */}
        <div className="fg-pipeline-track">
          {STAGES.map((st, i) => {
            const isHighlighted =
              (st.num === "04" && inspectorTab === "cluster-ssim") ||
              (st.num === "05" && inspectorTab === "mcp-cortex") ||
              (st.num === "03" && inspectorTab === "side-by-side");
            return (
              <div
                key={st.num}
                style={s(
                  `background: ${
                    isHighlighted ? "#171411" : "#131210"
                  }; padding: 24px 20px; position: relative; display: flex; flex-direction: column; justify-content: space-between; min-height: 204px; border-top: 2px solid ${
                    isHighlighted ? "#e8862e" : "transparent"
                  };`,
                )}
              >
                <div>
                  <div
                    style={s(
                      "display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px;",
                    )}
                  >
                    <span
                      style={{
                        fontFamily: MONO,
                        ...s(
                          `font-size: 11px; color: ${
                            i === 3 || i === 4 ? "#e8862e" : "#8c847a"
                          }; letter-spacing: 0.08em; font-weight: 600;`,
                        ),
                      }}
                    >
                      {st.num}
                    </span>
                    <span
                      style={{
                        fontFamily: MONO,
                        ...s(
                          "font-size: 10px; color: #7c746b; background: #1a1815; border: 1px solid #26221e; padding: 2px 6px; border-radius: 3px;",
                        ),
                      }}
                    >
                      {st.artifact}
                    </span>
                  </div>
                  <div
                    style={s(
                      "font-size: 18px; font-weight: 600; letter-spacing: -0.015em; margin-bottom: 8px; color: #f5f1ea;",
                    )}
                  >
                    {st.title}
                  </div>
                </div>
                <div
                  style={s(
                    "font-size: 13px; color: #9c948a; line-height: 1.5;",
                  )}
                >
                  {st.desc}
                </div>
              </div>
            );
          })}
        </div>

        {/* Interactive Visual Diff Inspector Workbench */}
        <div
          data-testid="visual-diff-inspector"
          style={s(
            "margin-top: 32px; background: #131210; border: 1px solid #2a2622; border-radius: 10px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.45);",
          )}
        >
          {/* Inspector Top Chrome + WAI-ARIA Tablist + Interactive Layer Toggles */}
          <div
            style={s(
              "display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 20px; background: #181613; border-bottom: 1px solid #26221e; flex-wrap: wrap;",
            )}
          >
            <div
              style={s(
                "display: flex; align-items: center; gap: 10px; flex-wrap: wrap;",
              )}
            >
              <span
                style={s(
                  "display: inline-block; width: 8px; height: 8px; border-radius: 999px; background: #e5484d;",
                )}
              />
              <span
                style={{
                  fontFamily: MONO,
                  ...s("font-size: 12px; color: #f5f1ea; font-weight: 600;"),
                }}
              >
                /dashboard @ 1440px · chromium
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  ...s(
                    "font-size: 11px; color: #e8862e; background: rgba(232,134,46,0.12); border: 1px solid rgba(232,134,46,0.35); padding: 2px 8px; border-radius: 4px;",
                  ),
                }}
              >
                1 cluster · 1.84% diff
              </span>
            </div>

            {/* Layer Toggles + View Mode Tablist */}
            <div
              style={s(
                "display: flex; align-items: center; gap: 10px; flex-wrap: wrap;",
              )}
            >
              <div
                role="group"
                aria-label="Capture pipeline guards"
                style={s("display: flex; align-items: center; gap: 6px;")}
              >
                <button
                  type="button"
                  onClick={() => setStabilityEnabled((prev) => !prev)}
                  aria-pressed={stabilityEnabled}
                  style={{
                    fontFamily: MONO,
                    ...s(
                      `padding: 5px 9px; font-size: 11px; border-radius: 4px; cursor: pointer; border: 1px solid ${
                        stabilityEnabled ? "rgba(79,180,119,0.45)" : "#2a2622"
                      }; background: ${
                        stabilityEnabled ? "rgba(79,180,119,0.1)" : "#131210"
                      }; color: ${stabilityEnabled ? "#4fb477" : "#8c847a"};`,
                    ),
                  }}
                >
                  {stabilityEnabled ? "✓" : "○"} waitForStability
                </button>
                <button
                  type="button"
                  onClick={() => setRedactEnabled((prev) => !prev)}
                  aria-pressed={redactEnabled}
                  style={{
                    fontFamily: MONO,
                    ...s(
                      `padding: 5px 9px; font-size: 11px; border-radius: 4px; cursor: pointer; border: 1px solid ${
                        redactEnabled ? "rgba(232,134,46,0.45)" : "#2a2622"
                      }; background: ${
                        redactEnabled ? "rgba(232,134,46,0.1)" : "#131210"
                      }; color: ${redactEnabled ? "#e8862e" : "#8c847a"};`,
                    ),
                  }}
                >
                  {redactEnabled ? "🔒" : "○"} redactSensitive
                </button>
              </div>

              <div
                role="tablist"
                aria-label="Visual diff inspection view"
                onKeyDown={onTabKeyDown}
                style={s(
                  "display: inline-flex; background: #100f0d; border: 1px solid #2a2622; border-radius: 6px; padding: 3px; gap: 4px; flex-wrap: wrap;",
                )}
              >
                {INSPECTOR_TABS.map((tab, idx) => {
                  const active = inspectorTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      ref={(el) => {
                        tabRefs.current[idx] = el;
                      }}
                      id={`diff-tab-${tab.id}`}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-controls={`diff-panel-${tab.id}`}
                      tabIndex={active ? 0 : -1}
                      onClick={() => setInspectorTab(tab.id)}
                      style={{
                        fontFamily: MONO,
                        ...s(
                          `padding: 6px 12px; font-size: 11px; border-radius: 4px; border: none; cursor: pointer; background: ${
                            active ? "#26221e" : "transparent"
                          }; color: ${
                            active ? "#f5f1ea" : "#8c847a"
                          }; font-weight: ${active ? "600" : "400"};`,
                        ),
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Active Inspection Tabpanel */}
          <div
            role="tabpanel"
            id={`diff-panel-${inspectorTab}`}
            aria-labelledby={`diff-tab-${inspectorTab}`}
          >
            {inspectorTab === "side-by-side" && (
              <div
                className="fg-split-2"
                style={s("gap: 1px; background: #26221e;")}
              >
                <div style={s("background: #131210; padding: 24px;")}>
                  <div
                    style={{
                      fontFamily: MONO,
                      ...s(
                        "font-size: 11px; color: #4fb477; margin-bottom: 14px; display: flex; justify-content: space-between;",
                      ),
                    }}
                  >
                    <span>BASELINE · frontguard-baselines</span>
                    <span style={s("color: #7c746b;")}>sha256: 9f84c2…e10b</span>
                  </div>
                  <div
                    style={s(
                      "background: #0d0c0b; border: 1px solid #26221e; border-radius: 6px; padding: 18px; display: flex; gap: 14px;",
                    )}
                  >
                    <div
                      style={s(
                        "width: 118px; background: #181613; border: 1px solid #2a2622; border-radius: 4px; padding: 10px;",
                      )}
                    >
                      <div
                        style={s(
                          "height: 8px; width: 65%; background: #3b3531; border-radius: 2px; margin-bottom: 8px;",
                        )}
                      />
                      <div
                        style={s(
                          "height: 8px; width: 80%; background: #2a2622; border-radius: 2px; margin-bottom: 14px;",
                        )}
                      />
                      <div
                        style={s(
                          "padding: 7px 8px; background: #e8862e; color: #0d0c0b; border-radius: 4px; font-size: 10px; font-weight: 700; text-align: center;",
                        )}
                      >
                        Upgrade Plan
                      </div>
                    </div>
                    <div style={s("flex: 1; display: grid; gap: 10px;")}>
                      <div
                        style={s(
                          "height: 28px; background: #181613; border: 1px solid #26221e; border-radius: 4px; display: flex; align-items: center; justify-content: flex-end; padding: 0 10px;",
                        )}
                      >
                        <span
                          style={{
                            fontFamily: MONO,
                            ...s("font-size: 10px; color: #8c847a;"),
                          }}
                        >
                          {redactEnabled
                            ? "api_key: ████████████"
                            : "api_key: fg_live_98a2"}
                        </span>
                      </div>
                      <div
                        style={s(
                          "height: 54px; background: #181613; border: 1px solid #26221e; border-radius: 4px;",
                        )}
                      />
                    </div>
                  </div>
                </div>

                <div style={s("background: #131210; padding: 24px;")}>
                  <div
                    style={{
                      fontFamily: MONO,
                      ...s(
                        "font-size: 11px; color: #e5484d; margin-bottom: 14px; display: flex; justify-content: space-between;",
                      ),
                    }}
                  >
                    <span>CURRENT · PR branch render</span>
                    <span style={s("color: #7c746b;")}>
                      .sidebar-cta height: 0px
                    </span>
                  </div>
                  <div
                    style={s(
                      "background: #0d0c0b; border: 1px solid #26221e; border-radius: 6px; padding: 18px; display: flex; gap: 14px;",
                    )}
                  >
                    <div
                      style={s(
                        "width: 118px; background: #181613; border: 1px solid rgba(229,72,77,0.5); border-radius: 4px; padding: 10px;",
                      )}
                    >
                      <div
                        style={s(
                          "height: 8px; width: 65%; background: #3b3531; border-radius: 2px; margin-bottom: 8px;",
                        )}
                      />
                      <div
                        style={s(
                          "height: 8px; width: 80%; background: #2a2622; border-radius: 2px; margin-bottom: 14px;",
                        )}
                      />
                      <div
                        style={s(
                          "height: 26px; border: 1px dashed #e5484d; background: rgba(229,72,77,0.12); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #e5484d;",
                        )}
                      >
                        collapsed (0px)
                      </div>
                    </div>
                    <div style={s("flex: 1; display: grid; gap: 10px;")}>
                      <div
                        style={s(
                          "height: 28px; background: #181613; border: 1px solid #26221e; border-radius: 4px; display: flex; align-items: center; justify-content: flex-end; padding: 0 10px;",
                        )}
                      >
                        <span
                          style={{
                            fontFamily: MONO,
                            ...s("font-size: 10px; color: #8c847a;"),
                          }}
                        >
                          {redactEnabled
                            ? "api_key: ████████████"
                            : "api_key: fg_live_98a2"}
                        </span>
                      </div>
                      <div
                        style={s(
                          "height: 54px; background: #181613; border: 1px solid #26221e; border-radius: 4px;",
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {inspectorTab === "cluster-ssim" && (
              <div
                className="fg-split-asym-right"
                style={s("gap: 1px; background: #26221e;")}
              >
                <div style={s("background: #131210; padding: 24px;")}>
                  <div
                    style={{
                      fontFamily: MONO,
                      ...s(
                        "font-size: 11px; color: #e8862e; margin-bottom: 14px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;",
                      ),
                    }}
                  >
                    <span>
                      CONNECTED-COMPONENT CLUSTER OVERLAY · SET-OF-MARK [1]
                    </span>
                    <span style={s("color: #8c847a;")}>
                      bbox: (x: 48, y: 224, 148×164px)
                    </span>
                  </div>
                  <div
                    style={s(
                      "background: #0d0c0b; border: 1px solid #26221e; border-radius: 6px; padding: 18px; display: flex; gap: 14px; position: relative;",
                    )}
                  >
                    <div
                      style={s(
                        "width: 128px; background: #181613; border: 2px solid #e5484d; border-radius: 4px; padding: 10px; position: relative; box-shadow: 0 0 0 4px rgba(229,72,77,0.14);",
                      )}
                    >
                      <span
                        style={{
                          fontFamily: MONO,
                          ...s(
                            "position: absolute; top: -10px; left: -10px; background: #e5484d; color: #0d0c0b; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px;",
                          ),
                        }}
                      >
                        [1]
                      </span>
                      <div
                        style={s(
                          "height: 8px; width: 65%; background: #3b3531; border-radius: 2px; margin-bottom: 8px;",
                        )}
                      />
                      <div
                        style={s(
                          "height: 8px; width: 80%; background: #2a2622; border-radius: 2px; margin-bottom: 14px;",
                        )}
                      />
                      <div
                        style={s(
                          "padding: 7px 8px; background: rgba(229,72,77,0.22); border: 1px solid #e5484d; color: #ff8b8e; border-radius: 4px; font-size: 10px; font-weight: 600; text-align: center;",
                        )}
                      >
                        Δ 2,418 px
                      </div>
                    </div>
                    <div
                      style={s(
                        "flex: 1; display: grid; gap: 10px; opacity: 0.45;",
                      )}
                    >
                      <div
                        style={s(
                          "height: 28px; background: #181613; border: 1px solid #26221e; border-radius: 4px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px;",
                        )}
                      >
                        <span
                          style={{
                            fontFamily: MONO,
                            ...s("font-size: 10px; color: #4fb477;"),
                          }}
                        >
                          {stabilityEnabled
                            ? "✓ Unchanged region (CW-SSIM 0.998)"
                            : "⚠ Unsettled motion (+0.42%)"}
                        </span>
                        <span
                          style={{
                            fontFamily: MONO,
                            ...s("font-size: 10px; color: #8c847a;"),
                          }}
                        >
                          {redactEnabled ? "🔒 1 redacted" : "0 redacted"}
                        </span>
                      </div>
                      <div
                        style={s(
                          "height: 54px; background: #181613; border: 1px solid #26221e; border-radius: 4px;",
                        )}
                      />
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "background: #100f0d; padding: 24px; font-size: 12px; display: flex; flex-direction: column; justify-content: space-between; gap: 12px;",
                    ),
                  }}
                >
                  <div
                    style={s(
                      "color: #8c847a; font-size: 11px; letter-spacing: 0.08em;",
                    )}
                  >
                    REGION SIMILARITY TELEMETRY
                  </div>
                  <div style={s("display: grid; gap: 8px;")}>
                    <div
                      style={s(
                        "display: flex; justify-content: space-between; border-bottom: 1px solid #1f1c19; padding-bottom: 6px;",
                      )}
                    >
                      <span style={s("color: #9c948a;")}>Global SSIM</span>
                      <span style={s("color: #b8b0a6;")}>
                        0.984 (whitespace diluted)
                      </span>
                    </div>
                    <div
                      style={s(
                        "display: flex; justify-content: space-between; border-bottom: 1px solid #1f1c19; padding-bottom: 6px;",
                      )}
                    >
                      <span style={s("color: #9c948a;")}>
                        Cluster [1] Chroma SSIM (YCbCr)
                      </span>
                      <span style={s("color: #e5484d; font-weight: 600;")}>
                        0.614 (regression)
                      </span>
                    </div>
                    <div
                      style={s(
                        "display: flex; justify-content: space-between; border-bottom: 1px solid #1f1c19; padding-bottom: 6px;",
                      )}
                    >
                      <span style={s("color: #9c948a;")}>
                        Cluster [1] CW-SSIM (Phase)
                      </span>
                      <span style={s("color: #e8862e;")}>
                        0.589 (structural shift)
                      </span>
                    </div>
                    <div
                      style={s("display: flex; justify-content: space-between;")}
                    >
                      <span style={s("color: #9c948a;")}>Frame stability</span>
                      <span
                        style={s(
                          `color: ${stabilityEnabled ? "#4fb477" : "#e8862e"};`,
                        )}
                      >
                        {stabilityEnabled
                          ? "✓ Settled (2 RAF frames)"
                          : "Unchecked"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {inspectorTab === "mcp-cortex" && (
              <div
                style={{
                  fontFamily: MONO,
                  ...s(
                    "background: #100f0d; padding: 24px; font-size: 12px; line-height: 1.7; color: #d8d0c5;",
                  ),
                }}
              >
                <div style={s("color: #8c847a; margin-bottom: 8px;")}>
                  // @frontguard/mcp · inspect_diff_cluster_dom → verify_css_patch
                </div>
                <div>
                  <span style={s("color: #e8862e;")}>→ tool:</span>{" "}
                  inspect_diff_cluster_dom({"{"} diff_id:{" "}
                  <span style={s("color: #98c379;")}>
                    "local-run:/dashboard@1440@chromium"
                  </span>
                  , cluster_id: <span style={s("color: #e8862e;")}>1</span>{" "}
                  {"}"})
                </div>
                <div style={s("color: #9c948a; padding-left: 14px;")}>
                  targetSelector:{" "}
                  <span style={s("color: #f5f1ea;")}>"aside .sidebar-cta"</span>{" "}
                  · classification:{" "}
                  <span style={s("color: #e5484d;")}>"layout-shift"</span> ·
                  confidence: <span style={s("color: #4fb477;")}>0.92</span>
                </div>
                <div style={s("margin-top: 8px;")}>
                  <span style={s("color: #5b8def;")}>→ tool:</span>{" "}
                  verify_css_patch({"{"} target_selector:{" "}
                  <span style={s("color: #98c379;")}>"aside .sidebar-cta"</span>
                  , css_patch:{" "}
                  <span style={s("color: #98c379;")}>
                    "aside .sidebar-cta {"{ min-height: 36px; display: flex; }"}"
                  </span>{" "}
                  {"}"})
                </div>
                <div style={s("color: #4fb477; padding-left: 14px;")}>
                  ✓ validSyntax: true · selectorMatchedTarget: true ·
                  recommendation: "apply"
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
