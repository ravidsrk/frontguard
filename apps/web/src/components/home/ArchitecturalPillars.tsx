import { s } from "../../lib/style";
import { MONO } from "./home-data";

const AI_JSON_LINES = [
  { text: "{", highlight: false },
  { text: '  "route": "/dashboard",', highlight: false },
  { text: '  "classification": "critical",', highlight: true },
  { text: '  "confidence": 0.92,', highlight: true },
  {
    text: '  "explanation": "Sidebar CTA button collapsed from 36px to 0px height",',
    highlight: false,
  },
  {
    text: '  "suggestion": "aside .sidebar-cta { min-height: 36px; display: flex; }",',
    highlight: true,
  },
  { text: '  "exitCode": 1', highlight: false },
  { text: "}", highlight: false },
] as const;

export function ArchitecturalPillars() {
  return (
    <section className="fg-section">
      <div className="fg-shell">
        <div
          className="fg-split-asym-left"
          style={s("align-items: center;")}
        >
          {/* Left Column: Outcome Explanation & Optional/Off-by-Default Guarantee */}
          <div>
            <div className="fg-eyebrow">
              OPTIONAL LAYER · OFF BY DEFAULT
            </div>

            <h2 className="fg-h2">
              Optional model-assisted classification for visual diffs—scores
              severity and suggests a CSS fix.
            </h2>

            <p className="fg-body" style={s("margin-bottom: 20px;")}>
              By default, Frontguard runs 100% offline using deterministic pixel
              and perceptual similarity math. When you opt in, Frontguard crops
              each diff cluster with its DOM selector and asks your model to
              classify severity and draft a candidate CSS patch—without ever
              silently overriding a failing exit code.
            </p>

            <p
              className="fg-small"
              style={s(
                "margin: 0; color: var(--text-muted); font-family: var(--fg-mono); font-size: 12px;",
              )}
            >
              BYOK: OpenAI, Anthropic, Gemini, or custom baseUrl · Baselines
              are never auto-overwritten.
            </p>
          </div>

          {/* Right Column: Compact 8-Line report.json with --accent-subtle highlights */}
          <div
            style={s(
              "background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden;",
            )}
          >
            <div
              style={{
                fontFamily: MONO,
                ...s(
                  "padding: 11px 16px; background: #171512; border-bottom: 1px solid var(--border); font-size: 12px; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center;",
                ),
              }}
            >
              <span>.frontguard/results/report.json</span>
              <span style={s("color: var(--success);")}>
                deterministic exitCode: 1
              </span>
            </div>

            <pre
              style={{
                fontFamily: MONO,
                ...s(
                  "margin: 0; padding: 16px 0; font-size: 12.5px; line-height: 1.75; color: var(--text-primary); overflow-x: auto;",
                ),
              }}
            >
              <code>
                {AI_JSON_LINES.map((line, i) => (
                  <div
                    key={i}
                    style={s(
                      `padding: 1px 20px; ${
                        line.highlight
                          ? "background: var(--accent-subtle); border-left: 1px solid var(--accent);"
                          : "border-left: 1px solid transparent;"
                      }`,
                    )}
                  >
                    {line.text}
                  </div>
                ))}
              </code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
