import { Link } from "@tanstack/react-router";
import { s } from "../../lib/style";
import {
  COMPARISON_ROWS,
  LIFECYCLE_HOOKS_TEXT,
  MONO,
  PLUGINS,
} from "./home-data";

export function ComparisonAndPlugins() {
  return (
    <>
      {/* Comparison Matrix Section (#compare) */}
      <section
        id="compare"
        style={s("border-bottom: 1px solid #1f1c19; background: #0d0c0b;")}
      >
        <div
          className="fg-shell"
          style={s("padding-top: 96px; padding-bottom: 96px;")}
        >
          <div
            style={s(
              "display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 40px; gap: 32px; flex-wrap: wrap;",
            )}
          >
            <div>
              <div className="fg-eyebrow" style={s("margin-bottom: 14px;")}>
                // HOW IT STACKS UP
              </div>
              <h2 className="fg-h2" style={s("max-width: 680px;")}>
                Experimental CSS suggestion verification, clearly labeled.
              </h2>
            </div>
            <Link
              to="/comparisons"
              style={{
                fontFamily: MONO,
                ...s(
                  "font-size: 13px; color: #e8862e; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; border: 1px solid rgba(232,134,46,0.32); border-radius: 6px; background: rgba(232,134,46,0.06);",
                ),
              }}
            >
              See all 11 capabilities across 6 tools →
            </Link>
          </div>

          <div style={s("overflow-x: auto;")}>
            <table
              style={s(
                "width: 100%; min-width: 720px; border-collapse: collapse; border: 1px solid #26221e; background: #131210;",
              )}
            >
              <thead>
                <tr
                  style={{
                    fontFamily: MONO,
                    ...s(
                      "background: #1a1815; border-bottom: 1px solid #26221e; font-size: 12px; text-align: left;",
                    ),
                  }}
                >
                  <th style={s("padding: 16px 20px; color: #a89f94; font-weight: 600;")}>
                    CAPABILITY
                  </th>
                  <th
                    style={s(
                      "padding: 16px 14px; color: #e8862e; font-weight: 600; background: rgba(232,134,46,0.06); border-left: 1px solid #26221e;",
                    )}
                  >
                    Frontguard
                  </th>
                  <th
                    style={s(
                      "padding: 16px 14px; color: #c8c0b6; font-weight: 600; border-left: 1px solid #26221e;",
                    )}
                  >
                    Percy
                  </th>
                  <th
                    style={s(
                      "padding: 16px 14px; color: #c8c0b6; font-weight: 600; border-left: 1px solid #26221e;",
                    )}
                  >
                    Chromatic
                  </th>
                  <th
                    style={s(
                      "padding: 16px 14px; color: #c8c0b6; font-weight: 600; border-left: 1px solid #26221e;",
                    )}
                  >
                    BackstopJS
                  </th>
                  <th
                    style={s(
                      "padding: 16px 14px; color: #c8c0b6; font-weight: 600; border-left: 1px solid #26221e;",
                    )}
                  >
                    Lost Pixel
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((r, i) => {
                  const cell = (val: string, hi = false) => {
                    let col = "#c8c0b6";
                    if (val === "✓" || val === "Forever" || val === "Free")
                      col = "#4fb477";
                    else if (val === "✕" || val === "Sunset") col = "#a89f94";
                    else if (val === "◐") col = "#e8862e";
                    return (
                      <td
                        style={{
                          fontFamily: MONO,
                          ...s(
                            `padding: 15px 14px; border-left: 1px solid #26221e; font-size: 13px; color: ${col}; ${
                              hi
                                ? "background: rgba(232,134,46,0.04); font-weight: 600;"
                                : ""
                            }`,
                          ),
                        }}
                      >
                        {val}
                      </td>
                    );
                  };
                  return (
                    <tr
                      key={r.cap}
                      style={s(
                        `${
                          i < COMPARISON_ROWS.length - 1
                            ? "border-bottom: 1px solid #1f1c19;"
                            : ""
                        } font-size: 14px;`,
                      )}
                    >
                      <th
                        scope="row"
                        style={s(
                          "padding: 15px 20px; color: #f5f1ea; font-weight: 500; text-align: left;",
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

          <div
            style={{
              fontFamily: MONO,
              ...s(
                "margin-top: 16px; display: flex; justify-content: space-between; font-size: 12px; color: #a89f94; flex-wrap: wrap; gap: 12px;",
              ),
            }}
          >
            <div>
              ✓ supported · ◐ partial / paid add-on / opt-in · ✕ not available
            </div>
            <div>
              Based on public docs &amp; pricing as of March 2026 · Lost Pixel
              archived Feb 2026
            </div>
          </div>
        </div>
      </section>

      {/* Extensibility & Plugins Section */}
      <section
        style={s("border-bottom: 1px solid #1f1c19; background: #100f0e;")}
      >
        <div
          className="fg-shell"
          style={s("padding-top: 96px; padding-bottom: 96px;")}
        >
          <div
            style={s(
              "display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 40px; gap: 32px; flex-wrap: wrap;",
            )}
          >
            <div>
              <div className="fg-eyebrow" style={s("margin-bottom: 14px;")}>
                // EXTENSIBLE BY DESIGN · 5 BUILT-IN PLUGINS
              </div>
              <h2 className="fg-h2" style={s("max-width: 680px;")}>
                Nine lifecycle hooks. Five built-in plugins. Or scaffold your
                own.
              </h2>
            </div>
            <div
              style={{
                fontFamily: MONO,
                ...s(
                  "background: #141210; border: 1px solid #2a2622; border-radius: 6px; padding: 12px 16px; font-size: 12px; color: #d8d0c5;",
                ),
              }}
            >
              <span style={s("color: #e8862e; margin-right: 8px;")}>{"$"}</span>
              npm create frontguard-plugin my-plugin
            </div>
          </div>

          <div className="fg-plugins-track">
            {PLUGINS.map((p) => (
              <div
                key={p.name}
                style={s(
                  "background: #131210; padding: 24px 22px; display: flex; flex-direction: column; justify-content: space-between; min-height: 156px;",
                )}
              >
                <div>
                  <div
                    style={{
                      fontFamily: MONO,
                      ...s(
                        "font-size: 12px; color: #e8862e; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 10px;",
                      ),
                    }}
                  >
                    {p.tag}
                  </div>
                  <div
                    style={s(
                      "font-size: 17px; font-weight: 600; color: #f5f1ea; margin-bottom: 8px;",
                    )}
                  >
                    {p.name}
                  </div>
                </div>
                <div
                  style={s(
                    "font-size: 14px; color: #c8c0b6; line-height: 1.55;",
                  )}
                >
                  {p.desc}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              fontFamily: MONO,
              ...s(
                "margin-top: 20px; padding: 14px 18px; background: #131210; border: 1px solid #26221e; border-radius: 6px; font-size: 12px; color: #c8c0b6; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;",
              ),
            }}
          >
            <span style={s("color: #e8862e; font-weight: 600;")}>
              LIFECYCLE HOOKS
            </span>
            <span>{LIFECYCLE_HOOKS_TEXT}</span>
          </div>
        </div>
      </section>
    </>
  );
}
