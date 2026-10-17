import { useRef, useState, type KeyboardEvent } from "react";
import { s } from "../../lib/style";
import {
  CLI_CODE,
  CLI_HTML,
  MCP_CODE,
  MCP_HTML,
  MONO,
  PW_CODE,
  PW_HTML,
  useCopy,
} from "./home-data";

type IntegrationTabId = "cli" | "playwright" | "agents";

interface IntegrationSurface {
  id: IntegrationTabId;
  label: string;
  pkg: string;
  sentence: string;
  code: string;
  html: string;
}

const INTEGRATION_TABS: ReadonlyArray<IntegrationSurface> = [
  {
    id: "cli",
    label: "Standalone CLI",
    pkg: "@frontguard/cli",
    sentence:
      "Auto-discovers routes from your live server or filesystem, converges animation frames, and stores reviewed baselines in the frontguard-baselines git orphan branch.",
    code: CLI_CODE,
    html: CLI_HTML,
  },
  {
    id: "playwright",
    label: "Playwright",
    pkg: "@frontguard/playwright",
    sentence:
      "Drop visualTest(page, name, options) directly inside existing Playwright E2E specs with component selector scoping, frame stability convergence, and PII redaction.",
    code: PW_CODE,
    html: PW_HTML,
  },
  {
    id: "agents",
    label: "Coding agents",
    pkg: "@frontguard/mcp",
    sentence:
      "Expose 7 local visual cortex tools to Claude Code, Cursor, or Windsurf via MCP stdio—or run frontguard guide --json for structured machine-readable workflows.",
    code: MCP_CODE,
    html: MCP_HTML,
  },
];

export function WorkflowEntryDeck() {
  const [activeTab, setActiveTab] = useState<IntegrationTabId>("cli");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [copied, copyCode] = useCopy();

  const currentTab =
    INTEGRATION_TABS.find((t) => t.id === activeTab) ?? INTEGRATION_TABS[0];

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = INTEGRATION_TABS.findIndex((t) => t.id === activeTab);
    if (currentIndex === -1) return;
    let nextIndex: number;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % INTEGRATION_TABS.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + INTEGRATION_TABS.length) % INTEGRATION_TABS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = INTEGRATION_TABS.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const nextTab = INTEGRATION_TABS[nextIndex];
    setActiveTab(nextTab.id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <section className="fg-section">
      <div className="fg-shell">
        <div style={s("max-width: 720px; margin-bottom: 48px;")}>
          <h2 className="fg-h2">
            Run standalone, drop into Playwright, or wire into your coding
            agent.
          </h2>
          <p className="fg-lead">
            The same local pixel and Chroma SSIM engine powers the standalone
            CLI, the Playwright test helper, and the 7-tool MCP server.
          </p>
        </div>

        {/* Single Tabbed Integration Component */}
        <div
          style={s(
            "background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden;",
          )}
        >
          {/* Tab Bar */}
          <div
            style={s(
              "display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 20px; background: #171512; border-bottom: 1px solid var(--border); flex-wrap: wrap;",
            )}
          >
            <div
              role="tablist"
              aria-label="Integration surface"
              onKeyDown={onTabKeyDown}
              style={s(
                "display: flex; gap: 6px; background: var(--bg); border: 1px solid var(--border); padding: 4px; border-radius: 6px; flex-wrap: wrap;",
              )}
            >
              {INTEGRATION_TABS.map((tab, index) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    ref={(el) => {
                      tabRefs.current[index] = el;
                    }}
                    id={`integration-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`integration-panel-${tab.id}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      fontFamily: MONO,
                      ...s(
                        `padding: 8px 14px; border-radius: 4px; border: 1px solid ${
                          isActive ? "var(--accent)" : "transparent"
                        }; background: ${
                          isActive ? "var(--accent-subtle)" : "transparent"
                        }; color: ${
                          isActive ? "var(--text-primary)" : "var(--text-muted)"
                        }; font-size: 12px; font-weight: ${
                          isActive ? 600 : 400
                        }; cursor: pointer;`,
                      ),
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <span
              style={{
                fontFamily: MONO,
                ...s(
                  "font-size: 12px; color: var(--text-muted); padding: 4px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px;",
                ),
              }}
            >
              {currentTab.pkg}
            </span>
          </div>

          {/* Active Tab Panel: 1 sentence of context + 1 code block with copy button */}
          <div
            id={`integration-panel-${currentTab.id}`}
            role="tabpanel"
            aria-labelledby={`integration-tab-${currentTab.id}`}
            style={s("padding: 28px 24px;")}
          >
            <p
              className="fg-body"
              style={s("margin-bottom: 20px; max-width: 72ch;")}
            >
              {currentTab.sentence}
            </p>

            <div
              style={s(
                "background: var(--bg); border: 1px solid var(--border); border-radius: 8px; overflow: hidden;",
              )}
            >
              <div
                style={{
                  fontFamily: MONO,
                  ...s(
                    "display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: #141210; border-bottom: 1px solid var(--border); font-size: 12px; color: var(--text-muted);",
                  ),
                }}
              >
                <span>{currentTab.pkg}</span>
                <button
                  type="button"
                  onClick={() => copyCode(currentTab.code)}
                  aria-label={`Copy ${currentTab.label} snippet`}
                  style={{
                    fontFamily: MONO,
                    ...s(
                      `padding: 4px 10px; font-size: 12px; border-radius: 4px; border: 1px solid var(--border); background: var(--surface); color: ${
                        copied ? "var(--success)" : "var(--text-secondary)"
                      }; cursor: pointer;`,
                    ),
                  }}
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </div>
              <pre
                style={{
                  fontFamily: MONO,
                  ...s(
                    "margin: 0; padding: 20px 22px; font-size: 12.5px; line-height: 1.7; color: var(--text-primary); overflow-x: auto;",
                  ),
                }}
                dangerouslySetInnerHTML={{ __html: currentTab.html }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
