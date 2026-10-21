import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { s } from "../../lib/style";
import {
  CHECKLIST_FEATURES,
  CONFIG_CODE,
  CONFIG_HTML,
  LIFECYCLE_HOOKS_TEXT,
  MONO,
  PLUGINS,
  TOP_THREE_FEATURES,
  useCopy,
} from "./home-data";

export function FeatureBentoGrid() {
  const [configCopied, copyConfig] = useCopy();
  const [configExpanded, setConfigExpanded] = useState(false);

  return (
    <section id="features" className="fg-section">
      <div className="fg-shell">
        {/* Header */}
        <div
          style={s(
            "display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 48px; gap: 24px; flex-wrap: wrap;",
          )}
        >
          <div>
            <div className="fg-eyebrow">KEY CAPABILITIES</div>
            <h2 className="fg-h2">
              Every primitive required to run visual regression testing in
              production.
            </h2>
            <p className="fg-lead">
              Built for real frontend repositories: monorepos, dynamic
              hydration, authenticated routes, and multi-viewport matrices.
            </p>
          </div>
          <div className="fg-todo-note">
            TODO: confirm top 3 feature selection (Git-native baselines, Frame convergence, Smart rendering)
          </div>
        </div>

        {/* Top 3 Promoted Feature Cards with Code/Telemetry Snippets */}
        <div className="fg-grid-3" style={s("margin-bottom: 48px;")}>
          {TOP_THREE_FEATURES.map((f) => (
            <div
              key={f.title}
              className="fg-surface-card"
              style={s(
                "display: flex; flex-direction: column; justify-content: space-between; gap: 20px;",
              )}
            >
              <div>
                <div
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "font-size: 11px; color: var(--text-muted); letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; margin-bottom: 12px;",
                    ),
                  }}
                >
                  {f.tag}
                </div>
                <h3 className="fg-h3" style={s("margin-bottom: 10px;")}>
                  {f.title}
                </h3>
                <p className="fg-body" style={s("font-size: 15px;")}>
                  {f.desc}
                </p>
              </div>

              <pre
                // overflow-x: auto is a scrollable region; tabindex makes it keyboard reachable
                tabIndex={0}
                aria-label={`${f.title} snippet`}
                style={{
                  fontFamily: MONO,
                  ...s(
                    "margin: 0; padding: 12px 14px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 11.5px; line-height: 1.6; color: var(--text-primary); overflow-x: auto;",
                  ),
                }}
              >
                <code>{f.snippet}</code>
              </pre>
            </div>
          ))}
        </div>

        {/* Remaining 6 Features as Compact 3-Column Checklist */}
        <div
          className="fg-checklist-grid"
          style={s("margin-bottom: 48px;")}
        >
          {CHECKLIST_FEATURES.map((item) => (
            <div
              key={item.title}
              style={s(
                "background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 18px 20px; display: flex; align-items: flex-start; gap: 12px;",
              )}
            >
              <span
                aria-hidden="true"
                style={{
                  fontFamily: MONO,
                  ...s(
                    "color: var(--success); font-size: 14px; font-weight: 700; line-height: 1.4; flex-shrink: 0;",
                  ),
                }}
              >
                ✓
              </span>
              <div>
                <h3
                  style={s(
                    "margin: 0 0 4px 0; font-size: 16px; font-weight: 600; color: var(--text-primary);",
                  )}
                >
                  {item.title}
                </h3>
                <p
                  className="fg-small"
                  style={s("margin: 0; color: var(--text-secondary);")}
                >
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Collapsed Expandable Default Config ("View default config ▾") */}
        <div
          style={s(
            "background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; margin-bottom: 24px;",
          )}
        >
          <div
            style={s(
              "padding: 14px 20px; background: #171512; display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;",
            )}
          >
            <button
              type="button"
              onClick={() => setConfigExpanded((prev) => !prev)}
              aria-expanded={configExpanded}
              aria-controls="default-config-drawer"
              style={s(
                "background: transparent; border: none; padding: 0; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; cursor: pointer; text-align: left;",
              )}
            >
              <span
                style={{
                  fontFamily: MONO,
                  ...s(
                    "font-size: 12px; font-weight: 600; color: var(--text-primary);",
                  ),
                }}
              >
                {configExpanded ? "▴ Hide default config" : "▾ View default config"}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  ...s(
                    "font-size: 12px; color: var(--text-muted); padding: 2px 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 4px;",
                  ),
                }}
              >
                frontguard.config.ts
              </span>
              <span className="fg-small">
                Sensible defaults on day one; granular per-route actions and
                anti-flake controls when needed.
              </span>
            </button>

            <button
              type="button"
              onClick={() => copyConfig(CONFIG_CODE)}
              aria-label="Copy frontguard.config.ts"
              style={{
                fontFamily: MONO,
                ...s(
                  `padding: 5px 12px; font-size: 12px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg); color: ${
                    configCopied ? "var(--success)" : "var(--text-secondary)"
                  }; cursor: pointer;`,
                ),
              }}
            >
              {configCopied ? "Copied ✓" : "Copy config"}
            </button>
          </div>

          {configExpanded && (
            <div
              id="default-config-drawer"
              style={s(
                "border-top: 1px solid var(--border); background: var(--bg);",
              )}
            >
              <pre
                style={{
                  fontFamily: MONO,
                  ...s(
                    "margin: 0; padding: 20px 22px; font-size: 12.5px; line-height: 1.7; color: var(--text-primary); overflow-x: auto;",
                  ),
                }}
                dangerouslySetInnerHTML={{ __html: CONFIG_HTML }}
              />
            </div>
          )}
        </div>

        {/* Collapsed Single-Line Plugin Chips + Lifecycle Hooks + Docs Link */}
        <div
          style={s(
            "padding: 18px 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; display: flex; flex-direction: column; gap: 12px;",
          )}
        >
          <div
            style={s(
              "display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;",
            )}
          >
            <div
              style={s(
                "display: flex; align-items: center; gap: 8px; flex-wrap: wrap;",
              )}
            >
              <span
                style={{
                  fontFamily: MONO,
                  ...s(
                    "font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; margin-right: 4px;",
                  ),
                }}
              >
                5 Built-in plugins:
              </span>
              {PLUGINS.map((p) => (
                <span
                  key={p.name}
                  title={p.desc}
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "font-size: 12px; color: var(--text-primary); background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 3px 9px;",
                    ),
                  }}
                >
                  {p.name}
                </span>
              ))}
            </div>

            <Link
              to="/docs/$"
              params={{ _splat: "guides/custom-plugins" }}
              className="fg-link"
              style={{
                fontFamily: MONO,
                ...s(
                  "font-size: 12px; color: var(--text-secondary); text-decoration: none;",
                ),
              }}
            >
              Build your own plugin →
            </Link>
          </div>

          <div
            style={{
              fontFamily: MONO,
              ...s(
                "padding-top: 10px; border-top: 1px solid var(--border); font-size: 11.5px; color: var(--text-muted); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;",
              ),
            }}
          >
            <span>9 LIFECYCLE HOOKS</span>
            <span style={s("color: var(--text-secondary);")}>
              {LIFECYCLE_HOOKS_TEXT}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
