import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { s } from "../../lib/style";
import { Shield } from "../Shield";
import { MONO } from "./home-data";

interface InstallStep {
  num: string;
  title: string;
  cmd: string;
  note: ReactNode;
}

const INSTALL_STEPS: ReadonlyArray<InstallStep> = [
  {
    num: "01",
    title: "Install CLI & Chromium",
    cmd: "npm install -D @frontguard/cli && npx playwright install chromium",
    note: "Installs the CLI and downloads the pinned Playwright Chromium binary.",
  },
  {
    num: "02",
    title: "Generate config & CI workflow",
    cmd: "npx -p @frontguard/cli frontguard init --ci",
    note: (
      <>
        Detects your framework and writes{" "}
        <code style={{ fontFamily: MONO, color: "var(--text-primary)" }}>
          frontguard.config.ts
        </code>{" "}
        with{" "}
        <code style={{ fontFamily: MONO, color: "var(--text-primary)" }}>
          baseUrl
        </code>{" "}
        in the generated config.
      </>
    ),
  },
  {
    num: "03",
    title: "Run your first comparison",
    cmd: "npx -p @frontguard/cli frontguard run",
    note: "Start your app in another terminal, then run Frontguard against your local server.",
  },
  {
    num: "04",
    title: "Promote reviewed baselines",
    cmd: "npx -p @frontguard/cli frontguard update-baselines",
    note: (
      <>
        After inspecting the HTML diff workbench, promote reviewed snapshots to
        the{" "}
        <code style={{ fontFamily: MONO, color: "var(--text-primary)" }}>
          frontguard-baselines
        </code>{" "}
        orphan branch.
      </>
    ),
  },
];

export function ClosingCommandDeck() {
  const [copiedStep, setCopiedStep] = useState<string | null>(null);

  const handleCopy = (cmd: string) => {
    try {
      navigator.clipboard?.writeText(cmd);
    } catch {
      /* ignore clipboard errors in headless environments */
    }
    setCopiedStep(cmd);
    setTimeout(() => {
      setCopiedStep((prev) => (prev === cmd ? null : prev));
    }, 1800);
  };

  return (
    <section id="install" className="fg-section">
      <div className="fg-shell">
        <div
          style={s(
            "display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 48px; flex-wrap: wrap;",
          )}
        >
          <div>
            <div style={s("margin-bottom: 16px;")}>
              <Shield w={34} h={40} />
            </div>
            <h2 className="fg-h2" style={s("max-width: 22ch;")}>
              Stop triaging noise. Run your first diff in two minutes.
            </h2>
            <p className="fg-lead">
              Install the CLI, run a local comparison against your dev server,
              and inspect the interactive HTML diff workbench before gating pull
              requests.
            </p>
          </div>
          <div className="fg-todo-note">
            TODO: confirm exact setup timing wording (e.g. "two minutes")
          </div>
        </div>

        {/* 4 Compact Numbered CLI Install Steps */}
        <ol
          style={s(
            "list-style: none; padding: 0; margin: 0 0 32px 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px;",
          )}
          className="fg-split-2"
        >
          {INSTALL_STEPS.map((st) => {
            const isCopied = copiedStep === st.cmd;
            return (
              <li
                key={st.num}
                className="fg-surface-card"
                style={s(
                  "display: flex; flex-direction: column; justify-content: space-between; gap: 16px;",
                )}
              >
                <div>
                  <div
                    style={s(
                      "display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;",
                    )}
                  >
                    <span
                      style={{
                        fontFamily: MONO,
                        ...s(
                          "font-size: 12px; color: var(--text-muted); font-weight: 600;",
                        ),
                      }}
                    >
                      STEP {st.num} · {st.title.toUpperCase()}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopy(st.cmd)}
                      aria-label={`Copy command: ${st.cmd}`}
                      style={{
                        fontFamily: MONO,
                        ...s(
                          `font-size: 11px; padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg); color: ${
                            isCopied ? "var(--success)" : "var(--text-secondary)"
                          }; cursor: pointer;`,
                        ),
                      }}
                    >
                      {isCopied ? "Copied ✓" : "Copy"}
                    </button>
                  </div>
                  <div className="fg-small">{st.note}</div>
                </div>

                <div
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "padding: 11px 14px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; font-size: 12px; color: var(--text-primary); overflow-x: auto; white-space: nowrap;",
                    ),
                  }}
                >
                  <span style={s("color: var(--text-muted); margin-right: 8px;")}>
                    $
                  </span>
                  {st.cmd}
                </div>
              </li>
            );
          })}
        </ol>

        {/* Bottom Bar: Primary CTA + Secondary Docs Link + Honest CI Note */}
        <div
          style={s(
            "display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; padding-top: 24px; border-top: 1px solid var(--border);",
          )}
        >
          <div
            style={s(
              "display: flex; align-items: center; gap: 12px; flex-wrap: wrap;",
            )}
          >
            <Link
              to="/docs/$"
              params={{ _splat: "getting-started/quickstart" }}
              className="fg-btn-primary"
              style={s(
                "padding: 13px 22px; background: var(--accent); color: var(--bg); font-weight: 600; font-size: 15px; border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 8px;",
              )}
            >
              Get started in Docs →
            </Link>
            <a
              href="https://github.com/ravidsrk/frontguard"
              target="_blank"
              rel="noreferrer"
              className="fg-btn-ghost"
              style={s(
                "padding: 13px 20px; background: transparent; color: var(--text-primary); border: 1px solid var(--border); font-weight: 500; font-size: 15px; border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 8px;",
              )}
            >
              View on GitHub
            </a>
          </div>

          <div
            style={{
              fontFamily: MONO,
              ...s("font-size: 12px; color: var(--text-muted);"),
            }}
          >
            CI note: Direct{" "}
            <code style={{ fontFamily: MONO, color: "var(--text-secondary)" }}>
              npx -p @frontguard/cli frontguard run --ci
            </code>{" "}
            is recommended while external Action smoke is still pending.
          </div>
        </div>
      </div>
    </section>
  );
}
