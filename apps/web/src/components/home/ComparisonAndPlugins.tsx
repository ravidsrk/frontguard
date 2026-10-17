import { Link } from "@tanstack/react-router";
import { s } from "../../lib/style";
import { COMPARISON_ROWS, MONO } from "./home-data";

function renderCellContent(val: string) {
  if (val === "✓") {
    return (
      <>
        <span aria-hidden="true">✓</span>
        <span className="fg-sr-only">Supported</span>
      </>
    );
  }
  if (val === "◐") {
    return (
      <>
        <span aria-hidden="true">◐</span>
        <span className="fg-sr-only">Partial or opt-in</span>
      </>
    );
  }
  if (val === "✕") {
    return (
      <>
        <span aria-hidden="true">✕</span>
        <span className="fg-sr-only">Not available</span>
      </>
    );
  }
  return val;
}

export function ComparisonAndPlugins() {
  return (
    <section id="compare" className="fg-section">
      <div className="fg-shell">
        <div
          style={s(
            "display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 40px; gap: 24px; flex-wrap: wrap;",
          )}
        >
          <div>
            <h2 className="fg-h2">How Frontguard compares</h2>
            <p className="fg-lead">
              Local-first execution and perceptual cluster scoring compared
              against hosted visual regression platforms and legacy runners.
            </p>
          </div>
          <Link
            to="/comparisons"
            className="fg-btn-ghost"
            style={{
              fontFamily: MONO,
              ...s(
                "font-size: 13px; color: var(--text-primary); text-decoration: none; display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface);",
              ),
            }}
          >
            See all 11 capabilities across 6 tools →
          </Link>
        </div>

        <div
          style={s(
            "overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; background: var(--surface);",
          )}
        >
          <table
            style={s(
              "width: 100%; min-width: 720px; border-collapse: collapse; background: var(--surface);",
            )}
          >
            <caption
              style={s(
                "caption-side: bottom; text-align: left; padding: 14px 20px; border-top: 1px solid var(--border); background: #161412;",
              )}
            >
              <div
                style={s(
                  "display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;",
                )}
              >
                <h3
                  style={s(
                    "margin: 0; font-size: 14px; font-weight: 600; color: var(--text-primary);",
                  )}
                >
                  Experimental CSS suggestion verification, clearly labeled.
                </h3>
                <span className="fg-small">
                  Candidate CSS patches are opt-in (`◐`) and never auto-applied
                  to source files.
                </span>
              </div>
            </caption>
            <thead>
              <tr
                style={{
                  fontFamily: MONO,
                  ...s(
                    "background: #181613; border-bottom: 1px solid var(--border); font-size: 12px; text-align: left;",
                  ),
                }}
              >
                <th
                  scope="col"
                  className="fg-sticky-col-head"
                  style={s(
                    "padding: 16px 20px; color: var(--text-muted); font-weight: 600;",
                  )}
                >
                  CAPABILITY
                </th>
                <th
                  scope="col"
                  style={s(
                    "padding: 16px 16px; color: var(--accent); font-weight: 700; background: var(--accent-subtle); border-left: 1px solid var(--border); border-top: 1px solid var(--accent);",
                  )}
                >
                  Frontguard
                </th>
                <th
                  scope="col"
                  style={s(
                    "padding: 16px 16px; color: var(--text-secondary); font-weight: 600; border-left: 1px solid var(--border);",
                  )}
                >
                  Percy
                </th>
                <th
                  scope="col"
                  style={s(
                    "padding: 16px 16px; color: var(--text-secondary); font-weight: 600; border-left: 1px solid var(--border);",
                  )}
                >
                  Chromatic
                </th>
                <th
                  scope="col"
                  style={s(
                    "padding: 16px 16px; color: var(--text-secondary); font-weight: 600; border-left: 1px solid var(--border);",
                  )}
                >
                  BackstopJS
                </th>
                <th
                  scope="col"
                  style={s(
                    "padding: 16px 16px; color: var(--text-secondary); font-weight: 600; border-left: 1px solid var(--border);",
                  )}
                >
                  Lost Pixel
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((r, i) => {
                const cell = (val: string, isFrontguard = false) => {
                  let col = "var(--text-secondary)";
                  if (val === "✓" || val === "MIT" || val === "Forever" || val === "Free") {
                    col = "var(--success)";
                  } else if (val === "✕" || val === "Sunset") {
                    col = "var(--text-muted)";
                  } else if (val === "◐") {
                    col = isFrontguard ? "var(--text-primary)" : "var(--text-secondary)";
                  }
                  return (
                    <td
                      style={{
                        fontFamily: MONO,
                        ...s(
                          `padding: 15px 16px; border-left: 1px solid var(--border); font-size: 13px; color: ${col}; ${
                            isFrontguard
                              ? "background: rgba(232,134,46,0.05); font-weight: 600;"
                              : ""
                          }`,
                        ),
                      }}
                    >
                      {renderCellContent(val)}
                    </td>
                  );
                };
                return (
                  <tr
                    key={r.cap}
                    className="fg-cmp-row"
                    style={s(
                      `${
                        i < COMPARISON_ROWS.length - 1
                          ? "border-bottom: 1px solid var(--border);"
                          : ""
                      } font-size: 15px;`,
                    )}
                  >
                    <th
                      scope="row"
                      className="fg-sticky-col"
                      style={s(
                        "padding: 15px 20px; color: var(--text-primary); font-weight: 500; text-align: left;",
                      )}
                    >
                      {r.cap}
                    </th>
                    {cell(r.fg, true)}
                    {cell(r.percy)}
                    {cell(r.chromatic)}
                    {cell(r.backstop)}
                    {cell(r.lostpixel)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Readable Footnotes (--text-secondary) */}
        <div
          className="fg-small"
          style={s(
            "margin-top: 16px; display: flex; justify-content: space-between; color: var(--text-secondary); flex-wrap: wrap; gap: 12px;",
          )}
        >
          <div>
            <span style={{ fontFamily: MONO, color: "var(--success)" }}>✓</span>{" "}
            supported ·{" "}
            <span style={{ fontFamily: MONO, color: "var(--text-primary)" }}>
              ◐
            </span>{" "}
            partial / paid add-on / opt-in ·{" "}
            <span style={{ fontFamily: MONO, color: "var(--text-muted)" }}>
              ✕
            </span>{" "}
            not available
          </div>
          <div>
            Based on public documentation and pricing as of March 2026 · Lost
            Pixel archived February 2026
          </div>
        </div>
      </div>
    </section>
  );
}
