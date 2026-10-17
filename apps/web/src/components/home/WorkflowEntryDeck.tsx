import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { s } from "../../lib/style";
import { CLI_HTML, MCP_HTML, MONO, PW_HTML, useCopy } from "./home-data";

type InstallTabId = "cli" | "playwright" | "ci";

const INSTALL_TABS: ReadonlyArray<{
  id: InstallTabId;
  label: string;
  sub: string;
}> = [
  { id: "cli", label: "01 · CLI Quickstart", sub: "Any framework" },
  {
    id: "playwright",
    label: "02 · @frontguard/playwright",
    sub: "Existing test suite",
  },
  { id: "ci", label: "03 · GitHub Actions CI", sub: "Pull request gate" },
];

export function WorkflowEntryDeck() {
  const [activeTab, setActiveTab] = useState<InstallTabId>("cli");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [copiedCmd, copyCmd] = useCopy();

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = INSTALL_TABS.findIndex((t) => t.id === activeTab);
    if (currentIndex === -1) return;
    let nextIndex: number;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % INSTALL_TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + INSTALL_TABS.length) % INSTALL_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = INSTALL_TABS.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextTab = INSTALL_TABS[nextIndex];
    setActiveTab(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <section
      style={s("border-bottom: 1px solid #1f1c19; background: #0d0c0b;")}
    >
      <div
        className="fg-shell"
        style={s("padding-top: 96px; padding-bottom: 96px;")}
      >
        {/* Header */}
        <div style={s("max-width: 720px; margin-bottom: 48px;")}>
          <div className="fg-eyebrow" style={s("margin-bottom: 14px;")}>
            // DUAL-PERSONA ENTRY · ENGINEERS & CODING AGENTS
          </div>
          <h2 className="fg-h2" style={s("margin-bottom: 12px;")}>
            Run standalone, drop into Playwright, or wire into your coding
            agent.
          </h2>
          <p className="fg-lead">
            Same pixel + Chroma SSIM engine across every surface. Start with
            zero-config CLI discovery, assert inside existing Playwright tests,
            or expose 7 visual cortex tools via MCP.
          </p>
        </div>

        {/* 3 Entry Surface Cards */}
        <div className="fg-grid-3" style={s("margin-bottom: 64px;")}>
          {/* Card 1: Standalone CLI */}
          <div
            style={s(
              "background: #131210; border: 1px solid #26221e; border-radius: 8px; padding: 26px; display: flex; flex-direction: column; justify-content: space-between; gap: 18px;",
            )}
          >
            <div>
              <div
                style={s(
                  "display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; gap: 8px;",
                )}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "font-size: 12px; color: #e8862e; letter-spacing: 0.06em; text-transform: uppercase;",
                    ),
                  }}
                >
                  OPTION A · STANDALONE CLI
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "font-size: 12px; color: #a89f94; padding: 2px 7px; background: #1a1815; border-radius: 3px;",
                    ),
                  }}
                >
                  @frontguard/cli
                </span>
              </div>
              <h3
                style={s(
                  "margin: 0 0 8px 0; font-size: 20px; font-weight: 600; letter-spacing: -0.015em; color: #f5f1ea;",
                )}
              >
                Crawl and diff your whole app
              </h3>
              <p
                style={s(
                  "margin: 0; font-size: 14px; color: #c8c0b6; line-height: 1.6;",
                )}
              >
                Auto-discovers routes from your filesystem or live server,
                converges animation frames, and stores baselines in{" "}
                <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                  frontguard-baselines
                </code>
                .
              </p>
            </div>
            <pre
              style={{
                fontFamily: MONO,
                ...s(
                  "margin: 0; background: #0d0c0b; border: 1px solid #1f1c19; border-radius: 6px; padding: 14px; font-size: 12px; line-height: 1.65; color: #d8d0c5; overflow-x: auto;",
                ),
              }}
              dangerouslySetInnerHTML={{ __html: CLI_HTML }}
            />
          </div>

          {/* Card 2: Playwright Native */}
          <div
            style={s(
              "background: #131210; border: 1px solid #26221e; border-radius: 8px; padding: 26px; display: flex; flex-direction: column; justify-content: space-between; gap: 18px;",
            )}
          >
            <div>
              <div
                style={s(
                  "display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; gap: 8px;",
                )}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "font-size: 12px; color: #4fb477; letter-spacing: 0.06em; text-transform: uppercase;",
                    ),
                  }}
                >
                  OPTION B · PLAYWRIGHT-NATIVE
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "font-size: 12px; color: #a89f94; padding: 2px 7px; background: #1a1815; border-radius: 3px;",
                    ),
                  }}
                >
                  @frontguard/playwright
                </span>
              </div>
              <h3
                style={s(
                  "margin: 0 0 8px 0; font-size: 20px; font-weight: 600; letter-spacing: -0.015em; color: #f5f1ea;",
                )}
              >
                Inside your existing E2E specs
              </h3>
              <p
                style={s(
                  "margin: 0; font-size: 14px; color: #c8c0b6; line-height: 1.6;",
                )}
              >
                Call{" "}
                <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                  visualTest(page, name, options)
                </code>{" "}
                with component{" "}
                <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                  selector
                </code>
                ,{" "}
                <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                  waitForStable
                </code>
                , and{" "}
                <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                  redactSensitive
                </code>
                .
              </p>
            </div>
            <pre
              style={{
                fontFamily: MONO,
                ...s(
                  "margin: 0; background: #0d0c0b; border: 1px solid #1f1c19; border-radius: 6px; padding: 14px; font-size: 12px; line-height: 1.65; color: #d8d0c5; overflow-x: auto;",
                ),
              }}
              dangerouslySetInnerHTML={{ __html: PW_HTML }}
            />
          </div>

          {/* Card 3: Agentic Coding / MCP Visual Cortex */}
          <div
            style={s(
              "background: #131210; border: 1px solid rgba(232,134,46,0.35); border-radius: 8px; padding: 26px; display: flex; flex-direction: column; justify-content: space-between; gap: 18px;",
            )}
          >
            <div>
              <div
                style={s(
                  "display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; gap: 8px;",
                )}
              >
                <span
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "font-size: 12px; color: #5b8def; letter-spacing: 0.06em; text-transform: uppercase;",
                    ),
                  }}
                >
                  OPTION C · AI CODING AGENTS
                </span>
                <span
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "font-size: 12px; color: #e8862e; padding: 2px 7px; background: rgba(232,134,46,0.1); border: 1px solid rgba(232,134,46,0.28); border-radius: 3px;",
                    ),
                  }}
                >
                  @frontguard/mcp
                </span>
              </div>
              <h3
                style={s(
                  "margin: 0 0 8px 0; font-size: 20px; font-weight: 600; letter-spacing: -0.015em; color: #f5f1ea;",
                )}
              >
                Visual cortex for Claude Code &amp; Cursor
              </h3>
              <p
                style={s(
                  "margin: 0; font-size: 14px; color: #c8c0b6; line-height: 1.6;",
                )}
              >
                Run{" "}
                <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                  frontguard guide --json
                </code>{" "}
                for structured agent workflows, or connect{" "}
                <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                  @frontguard/mcp
                </code>{" "}
                to inspect local reports and verify CSS patches.
              </p>
            </div>
            <pre
              style={{
                fontFamily: MONO,
                ...s(
                  "margin: 0; background: #0d0c0b; border: 1px solid #1f1c19; border-radius: 6px; padding: 14px; font-size: 12px; line-height: 1.65; color: #d8d0c5; overflow-x: auto;",
                ),
              }}
              dangerouslySetInnerHTML={{ __html: MCP_HTML }}
            />
          </div>
        </div>

        {/* Interactive Install Workbench (#install) */}
        <div
          id="install"
          style={s(
            "background: #131210; border: 1px solid #2a2622; border-radius: 10px; overflow: hidden;",
          )}
        >
          <div
            style={s(
              "display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 24px; background: #181613; border-bottom: 1px solid #26221e; flex-wrap: wrap;",
            )}
          >
            <div>
              <div className="fg-eyebrow" style={s("margin-bottom: 4px;")}>
                // INTERACTIVE QUICKSTART
              </div>
              <div
                style={s(
                  "font-size: 18px; font-weight: 600; color: #f5f1ea; letter-spacing: -0.01em;",
                )}
              >
                Add Frontguard to your repository
              </div>
            </div>

            <div
              role="tablist"
              aria-label="Installation workflow"
              onKeyDown={onTabKeyDown}
              style={s(
                "display: flex; gap: 6px; background: #100f0d; border: 1px solid #26221e; padding: 4px; border-radius: 6px; flex-wrap: wrap;",
              )}
            >
              {INSTALL_TABS.map((tab, index) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    ref={(el) => {
                      tabRefs.current[index] = el;
                    }}
                    id={`install-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`install-panel-${tab.id}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      fontFamily: MONO,
                      ...s(
                        `padding: 8px 14px; border-radius: 4px; border: 1px solid ${
                          isActive ? "#e8862e" : "transparent"
                        }; background: ${
                          isActive ? "rgba(232,134,46,0.12)" : "transparent"
                        }; color: ${
                          isActive ? "#f5f1ea" : "#a89f94"
                        }; font-size: 12px; cursor: pointer; text-align: left;`,
                      ),
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            id={`install-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`install-tab-${activeTab}`}
            style={s("padding: 28px 24px;")}
          >
            {activeTab === "cli" && (
              <div
                className="fg-split-2"
                style={s("gap: 16px; align-items: stretch;")}
              >
                <StepCard
                  step="STEP 01"
                  title="Install CLI & Chromium"
                  note="Adds @frontguard/cli and downloads the pinned Playwright Chromium binary."
                  cmd="npm install -D @frontguard/cli && npx playwright install chromium"
                  onCopy={copyCmd}
                  copied={copiedCmd}
                />
                <StepCard
                  step="STEP 02"
                  title="Generate config & CI workflow"
                  note={
                    <>
                      Detects your framework and writes{" "}
                      <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                        frontguard.config.ts
                      </code>{" "}
                      with{" "}
                      <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                        baseUrl
                      </code>{" "}
                      in the generated config.
                    </>
                  }
                  cmd="npx -p @frontguard/cli frontguard init --ci"
                  onCopy={copyCmd}
                  copied={copiedCmd}
                />
                <StepCard
                  step="STEP 03"
                  title="Run your first comparison"
                  note="Start your app in another terminal, then run Frontguard against the configured baseUrl."
                  cmd="npx -p @frontguard/cli frontguard run"
                  onCopy={copyCmd}
                  copied={copiedCmd}
                />
                <StepCard
                  step="STEP 04"
                  title="Promote reviewed baselines"
                  note="After inspecting the HTML diff report, commit baselines to the frontguard-baselines orphan branch."
                  cmd="npx -p @frontguard/cli frontguard update-baselines"
                  onCopy={copyCmd}
                  copied={copiedCmd}
                />
              </div>
            )}

            {activeTab === "playwright" && (
              <div className="fg-split-asym-left">
                <div>
                  <div
                    style={{
                      fontFamily: MONO,
                      ...s(
                        "font-size: 12px; color: #4fb477; margin-bottom: 10px;",
                      ),
                    }}
                  >
                    INSTALL ADAPTER
                  </div>
                  <pre
                    style={{
                      fontFamily: MONO,
                      ...s(
                        "margin: 0 0 16px 0; padding: 14px; background: #0d0c0b; border: 1px solid #26221e; border-radius: 6px; font-size: 12px; color: #f5f1ea; overflow-x: auto;",
                      ),
                    }}
                  >
                    <code>npm install -D @frontguard/playwright</code>
                  </pre>
                  <p
                    style={s(
                      "margin: 0 0 16px 0; font-size: 14px; color: #c8c0b6; line-height: 1.6;",
                    )}
                  >
                    Drop{" "}
                    <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                      visualTest(page, name, options)
                    </code>{" "}
                    into any Playwright test. Supports{" "}
                    <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                      selector
                    </code>{" "}
                    for component-scoped captures,{" "}
                    <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                      waitForStable
                    </code>
                    ,{" "}
                    <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                      redactSensitive
                    </code>
                    , and{" "}
                    <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                      masks
                    </code>
                    .
                  </p>
                  <Link
                    to="/docs/$"
                    params={{ _splat: "playwright/overview" }}
                    style={{
                      fontFamily: MONO,
                      ...s(
                        "font-size: 12px; color: #e8862e; text-decoration: none;",
                      ),
                    }}
                  >
                    Read @frontguard/playwright documentation →
                  </Link>
                </div>
                <pre
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "margin: 0; padding: 18px; background: #0d0c0b; border: 1px solid #26221e; border-radius: 6px; font-size: 12px; line-height: 1.65; color: #d8d0c5; overflow-x: auto;",
                    ),
                  }}
                  dangerouslySetInnerHTML={{ __html: PW_HTML }}
                />
              </div>
            )}

            {activeTab === "ci" && (
              <div className="fg-split-asym-left">
                <div>
                  <div
                    style={{
                      fontFamily: MONO,
                      ...s(
                        "font-size: 12px; color: #e8862e; margin-bottom: 10px;",
                      ),
                    }}
                  >
                    GITHUB ACTIONS WORKFLOW
                  </div>
                  <p
                    style={s(
                      "margin: 0 0 14px 0; font-size: 14px; color: #c8c0b6; line-height: 1.6;",
                    )}
                  >
                    Run{" "}
                    <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                      npx -p @frontguard/cli frontguard init --ci
                    </code>{" "}
                    to generate{" "}
                    <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                      .github/workflows/frontguard.yml
                    </code>{" "}
                    using the direct CLI runner.
                  </p>
                  <div
                    style={s(
                      "padding: 12px 14px; background: rgba(232,134,46,0.08); border: 1px solid rgba(232,134,46,0.28); border-radius: 6px; font-size: 14px; color: #c8c0b6; line-height: 1.6;",
                    )}
                  >
                    Fetches the{" "}
                    <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                      frontguard-baselines
                    </code>{" "}
                    orphan branch and runs deterministic checks on every pull
                    request.
                  </div>
                </div>
                <pre
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "margin: 0; padding: 18px; background: #0d0c0b; border: 1px solid #26221e; border-radius: 6px; font-size: 12px; line-height: 1.65; color: #d8d0c5; overflow-x: auto;",
                    ),
                  }}
                >
                  <code>{`- name: Install Chromium
  run: npx playwright install --with-deps chromium

- name: Fetch baselines branch
  run: git fetch origin frontguard-baselines:frontguard-baselines || true

- name: Run Frontguard visual regression check
  run: npx -p @frontguard/cli frontguard run --ci`}</code>
                </pre>
              </div>
            )}
          </div>

          <div
            style={{
              fontFamily: MONO,
              ...s(
                "padding: 12px 24px; background: #100f0d; border-top: 1px solid #24201c; font-size: 12px; color: #a89f94; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;",
              ),
            }}
          >
            <span>
              CI note: Direct{" "}
              <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                npx -p @frontguard/cli frontguard run --ci
              </code>{" "}
              is recommended in workflows while external Action smoke is still
              pending.
            </span>
            <Link
              to="/status"
              style={s("color: #e8862e; text-decoration: none;")}
            >
              Release &amp; CI status →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function StepCard({
  step,
  title,
  note,
  cmd,
  onCopy,
  copied,
}: {
  step: string;
  title: string;
  note: ReactNode;
  cmd: string;
  onCopy: (text: string) => void;
  copied: boolean;
}) {
  return (
    <div
      style={s(
        "background: #0f0e0c; border: 1px solid #24201c; border-radius: 8px; padding: 18px 20px; display: flex; flex-direction: column; justify-content: space-between; gap: 14px;",
      )}
    >
      <div>
        <div
          style={s(
            "display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;",
          )}
        >
          <span
            style={{
              fontFamily: MONO,
              ...s(
                "font-size: 12px; color: #e8862e; letter-spacing: 0.06em; text-transform: uppercase;",
              ),
            }}
          >
            {step}
          </span>
          <button
            type="button"
            onClick={() => onCopy(cmd)}
            style={{
              fontFamily: MONO,
              ...s(
                "font-size: 12px; color: #a89f94; background: #181613; border: 1px solid #26221e; border-radius: 3px; padding: 3px 8px; cursor: pointer;",
              ),
            }}
          >
            {copied ? "copied ✓" : "copy"}
          </button>
        </div>
        <div
          style={s(
            "font-size: 16px; font-weight: 600; color: #f5f1ea; margin-bottom: 6px;",
          )}
        >
          {title}
        </div>
        <div style={s("font-size: 14px; color: #c8c0b6; line-height: 1.55;")}>
          {note}
        </div>
      </div>
      <div
        style={{
          fontFamily: MONO,
          ...s(
            "padding: 10px 12px; background: #151311; border: 1px solid #26221e; border-radius: 5px; font-size: 12px; color: #f5f1ea; overflow-x: auto; white-space: nowrap;",
          ),
        }}
      >
        <span style={s("color: #e8862e; margin-right: 8px;")}>{"$"}</span>
        {cmd}
      </div>
    </div>
  );
}
