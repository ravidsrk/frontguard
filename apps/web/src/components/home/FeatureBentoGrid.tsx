import { s } from "../../lib/style";
import {
  BENTO_FEATURES,
  CONFIG_CODE,
  CONFIG_HTML,
  MONO,
  useCopy,
} from "./home-data";

export function FeatureBentoGrid() {
  const [configCopied, copyConfig] = useCopy();

  return (
    <section
      id="features"
      style={s("border-bottom: 1px solid #1f1c19; background: #100f0e;")}
    >
      <div
        className="fg-shell"
        style={s("padding-top: 96px; padding-bottom: 96px;")}
      >
        {/* Header */}
        <div
          style={s(
            "display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 48px; gap: 32px; flex-wrap: wrap;",
          )}
        >
          <div>
            <div className="fg-eyebrow" style={s("margin-bottom: 14px;")}>
              // ENGINEERED FOR CI & LOCAL WORKFLOWS
            </div>
            <h2 className="fg-h2" style={s("max-width: 680px;")}>
              Every primitive required to run visual regression testing in
              production.
            </h2>
          </div>
          <p className="fg-lead" style={s("max-width: 380px;")}>
            Built for real frontend repositories: monorepos, dynamic hydration,
            authenticated routes, and multi-viewport matrices.
          </p>
        </div>

        {/* 12-Column Asymmetric Bento Grid */}
        <div className="fg-bento-grid" style={s("margin-bottom: 48px;")}>
          {BENTO_FEATURES.map((f) => (
            <div
              key={f.title}
              className={
                f.span === 6 ? "fg-bento-span-6" : "fg-bento-span-4"
              }
              style={s(
                "background: #131210; border: 1px solid #26221e; border-radius: 8px; padding: 28px; display: flex; flex-direction: column; justify-content: space-between; gap: 20px;",
              )}
            >
              <div>
                <div
                  style={s(
                    "display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;",
                  )}
                >
                  <span
                    style={{
                      fontFamily: MONO,
                      ...s(
                        `font-size: 12px; color: ${f.accent}; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600;`,
                      ),
                    }}
                  >
                    {f.tag}
                  </span>
                  <span
                    style={{
                      fontFamily: MONO,
                      ...s(
                        "font-size: 12px; color: #c8c0b6; background: #191714; border: 1px solid #26221e; padding: 2px 8px; border-radius: 3px;",
                      ),
                    }}
                  >
                    {f.badge}
                  </span>
                </div>

                <h3
                  style={s(
                    "margin: 0 0 10px 0; font-size: 20px; font-weight: 600; letter-spacing: -0.015em; color: #f5f1ea;",
                  )}
                >
                  {f.title}
                </h3>
                <p
                  style={s(
                    "margin: 0; font-size: 14px; color: #c8c0b6; line-height: 1.65;",
                  )}
                >
                  {f.desc}
                </p>
              </div>

              <div
                style={{
                  fontFamily: MONO,
                  ...s(
                    "padding: 9px 12px; background: #0e0d0b; border: 1px solid #1f1c19; border-radius: 5px; font-size: 12px; color: #a89f94; display: flex; align-items: center; gap: 8px;",
                  ),
                }}
              >
                <span style={s(`color: ${f.accent};`)}>◆</span>
                <span>{f.detail}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Typed Config Showcase Window */}
        <div
          className="fg-split-asym-left"
          style={s(
            "background: #131210; border: 1px solid #2a2622; border-radius: 10px; padding: 36px;",
          )}
        >
          <div>
            <div className="fg-eyebrow" style={s("margin-bottom: 14px;")}>
              // TYPED CONFIGURATION · ZERO BOILERPLATE
            </div>
            <h3
              style={s(
                "margin: 0 0 14px 0; font-size: clamp(24px, 3vw, 32px); line-height: 1.12; letter-spacing: -0.025em; font-weight: 600; color: #f5f1ea;",
              )}
            >
              Sensible defaults on day one. Granular control per route when you
              need it.
            </h3>
            <p
              style={s(
                "margin: 0 0 22px 0; font-size: 15px; color: #c8c0b6; line-height: 1.65;",
              )}
            >
              Configure pre-capture interaction steps (
              <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>click</code>,{" "}
              <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                waitForSelector
              </code>
              , <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>fill</code>
              ), force dark or light{" "}
              <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                colorScheme
              </code>
              , enable{" "}
              <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                waitForStability
              </code>
              ,{" "}
              <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                redactSensitive
              </code>
              ,{" "}
              <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                freezeTime
              </code>
              ,{" "}
              <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                seedRandom
              </code>
              , and{" "}
              <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                blockUrls
              </code>
              , and opt into multi-provider BYOK model analysis (OpenAI,
              Anthropic, Gemini, or custom{" "}
              <code style={{ fontFamily: MONO, color: "#f5f1ea" }}>
                baseUrl
              </code>
              ) in a single file.
            </p>
            <div
              style={{
                fontFamily: MONO,
                ...s(
                  "display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: #c8c0b6;",
                ),
              }}
            >
              {[
                "discover.maxDepth",
                "routes[].actions",
                "colorScheme: 'dark'",
                "waitForStability: true",
                "redactSensitive: true",
                "freezeTime",
                "seedRandom",
                "blockUrls",
              ].map((pill) => (
                <span
                  key={pill}
                  style={s(
                    "padding: 4px 10px; background: #181613; border: 1px solid #26221e; border-radius: 4px;",
                  )}
                >
                  {pill}
                </span>
              ))}
            </div>
          </div>

          <div
            style={s(
              "background: #0d0c0b; border: 1px solid #26221e; border-radius: 8px; overflow: hidden;",
            )}
          >
            <div
              style={s(
                "display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: #181613; border-bottom: 1px solid #24201c;",
              )}
            >
              <span
                style={{
                  fontFamily: MONO,
                  ...s("font-size: 12px; color: #c8c0b6;"),
                }}
              >
                frontguard.config.ts
              </span>
              <button
                type="button"
                onClick={() => copyConfig(CONFIG_CODE)}
                aria-label="Copy frontguard.config.ts"
                style={{
                  fontFamily: MONO,
                  ...s(
                    `padding: 4px 10px; font-size: 12px; border-radius: 4px; border: 1px solid #2a2622; background: #131210; color: ${
                      configCopied ? "#4fb477" : "#a89f94"
                    }; cursor: pointer;`,
                  ),
                }}
              >
                {configCopied ? "copied ✓" : "Copy"}
              </button>
            </div>
            <pre
              style={{
                fontFamily: MONO,
                ...s(
                  "margin: 0; padding: 20px 22px; font-size: 12.5px; line-height: 1.7; color: #d8d0c5; overflow-x: auto;",
                ),
              }}
              dangerouslySetInnerHTML={{ __html: CONFIG_HTML }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
