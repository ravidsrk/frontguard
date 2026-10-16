import { s } from "../../lib/style";
import { MONO, PILLARS } from "./home-data";

export function ArchitecturalPillars() {
  return (
    <section
      style={s(
        "border-bottom: 1px solid #1f1c19; background: #100f0e;",
      )}
    >
      <div
        className="fg-shell"
        style={s("padding-top: 96px; padding-bottom: 96px;")}
      >
        <div style={s("max-width: 720px; margin-bottom: 48px;")}>
          <div className="fg-eyebrow" style={s("margin-bottom: 14px;")}>
            // THREE ARCHITECTURAL PILLARS
          </div>
          <h2 className="fg-h2" style={s("margin-bottom: 12px;")}>
            Deterministic pixel gates first. Grounded intelligence when you want
            it.
          </h2>
          <p className="fg-lead">
            Every run executes local pixel and perceptual similarity checks
            without network calls. When you opt into BYOK analysis or fix
            verification, model outputs stay strictly advisory.
          </p>
        </div>

        {/* 3 Pillar Cards */}
        <div className="fg-grid-3" style={s("margin-bottom: 56px;")}>
          {PILLARS.map((pl) => (
            <div
              key={pl.n}
              style={s(
                `background: #131210; border: 1px solid #26221e; border-top: 2px solid ${pl.c}; border-radius: 8px; padding: 28px; display: flex; flex-direction: column; justify-content: space-between; gap: 20px;`,
              )}
            >
              <div>
                <div
                  style={{
                    fontFamily: MONO,
                    ...s(
                      `font-size: 11px; color: ${pl.c}; letter-spacing: 0.1em; margin-bottom: 14px; font-weight: 600;`,
                    ),
                  }}
                >
                  {pl.n}
                </div>
                <h3
                  style={s(
                    "margin: 0 0 10px 0; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; color: #f5f1ea;",
                  )}
                >
                  {pl.h}
                </h3>
                <p
                  style={s(
                    "margin: 0; font-size: 14px; color: #9c948a; line-height: 1.6;",
                  )}
                >
                  {pl.p}
                </p>
              </div>

              <div
                style={s(
                  "padding-top: 14px; border-top: 1px solid #1f1c19; display: grid; gap: 6px;",
                )}
              >
                {pl.spec.map((item) => (
                  <div
                    key={item}
                    style={{
                      fontFamily: MONO,
                      ...s(
                        "font-size: 11px; color: #b8b0a6; display: flex; align-items: center; gap: 8px;",
                      ),
                    }}
                  >
                    <span style={s(`color: ${pl.c};`)}>›</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Unified AI Classification & Verification Card */}
        <div
          className="fg-split-asym-left"
          style={s(
            "background: #131210; border: 1px solid #2a2622; border-radius: 10px; padding: 36px;",
          )}
        >
          <div>
            <div className="fg-eyebrow" style={s("margin-bottom: 14px;")}>
              // ADVISORY ANALYSIS · NEVER SILENTLY OVERRIDES EXIT CODES
            </div>
            <h2
              className="fg-h2"
              style={s("font-size: clamp(24px, 3vw, 34px); margin-bottom: 16px;")}
            >
              Optional model-assisted classification for visual diffs.
            </h2>
            <p
              style={s(
                "margin: 0 0 24px 0; font-size: 15px; color: #9c948a; line-height: 1.65;",
              )}
            >
              Traditional visual tools report raw pixel counts. When you
              configure an OpenAI or Anthropic key, Frontguard crops around each
              connected-component diff cluster and asks your model to classify
              severity, explain the visual shift, and optionally verify a
              candidate CSS patch in a Playwright sandbox.
            </p>
            <div style={s("display: grid; gap: 10px;")}>
              {[
                [
                  "Pixel diff + cluster SSIM",
                  "Runs locally on every screenshot before any model call",
                ],
                [
                  "Advisory AI classification",
                  "Labels shifts as critical, warning, info, or noise with confidence score",
                ],
                [
                  "Opt-in fix verification",
                  "Applies candidate CSS in a temporary browser context and re-diffs",
                ],
              ].map(([a, b]) => (
                <div
                  key={a}
                  style={s(
                    "display: flex; align-items: baseline; gap: 12px; padding: 10px 14px; background: #171513; border: 1px solid #24201c; border-radius: 6px; flex-wrap: wrap;",
                  )}
                >
                  <span
                    style={{
                      fontFamily: MONO,
                      ...s("font-size: 12px; color: #e8862e; font-weight: 600;"),
                    }}
                  >
                    ✓ {a}
                  </span>
                  <span style={s("font-size: 12px; color: #8c847a;")}>
                    — {b}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Structured Advisory JSON Telemetry Artifact */}
          <div
            style={s(
              "background: #0f0e0c; border: 1px solid #26221e; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between;",
            )}
          >
            <div
              style={{
                fontFamily: MONO,
                ...s(
                  "padding: 11px 16px; background: #171513; border-bottom: 1px solid #24201c; font-size: 11px; color: #8c847a; display: flex; justify-content: space-between; align-items: center;",
                ),
              }}
            >
              <span>.frontguard/results/report.json</span>
              <span style={s("color: #4fb477;")}>exitCode: 1 (deterministic)</span>
            </div>
            <pre
              style={{
                fontFamily: MONO,
                ...s(
                  "margin: 0; padding: 18px 20px; font-size: 11.5px; line-height: 1.7; color: #d8d0c5; overflow-x: auto;",
                ),
              }}
            >
              <code>{`{
  "route": "/dashboard",
  "viewport": 1440,
  "status": "regression",
  "diffPercentage": 1.84,
  "clusters": [
    {
      "id": 1,
      "bbox": { "x": 48, "y": 224, "width": 148, "height": 164 },
      "chromaSSIM": 0.614,
      "cwSSIM": 0.589
    }
  ],
  "aiAnalysis": {
    "classification": "critical",
    "confidence": 0.92,
    "explanation": "Primary CTA button in sidebar collapsed to 0px height"
  },
  "suggestedFix": {
    "target": "aside .sidebar-cta",
    "patch": "aside .sidebar-cta { min-height: 36px; display: flex; }",
    "verified": false
  }
}`}</code>
            </pre>
            <div
              style={{
                fontFamily: MONO,
                ...s(
                  "padding: 10px 16px; background: #141210; border-top: 1px solid #24201c; font-size: 11px; color: #8c847a; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px;",
                ),
              }}
            >
              <span>BYOK provider: direct to OpenAI / Anthropic</span>
              <span style={s("color: #e8862e;")}>
                Baselines never auto-overwritten
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
