import { Link } from "@tanstack/react-router";
import { s } from "../../lib/style";
import { Shield } from "../Shield";
import { MONO, useCopy } from "./home-data";

export function ClosingCommandDeck() {
  const [ctaCopied, copyCta] = useCopy();

  return (
    <section
      style={s(
        "border-bottom: 1px solid #1f1c19; position: relative; overflow: hidden; background: #100f0e;",
      )}
    >
      <div
        style={s(
          "position: absolute; inset: 0; background: radial-gradient(ellipse 60% 50% at 50% 50%, rgba(232,134,46,0.14), transparent 70%); pointer-events: none;",
        )}
      />
      <div
        className="fg-shell"
        style={s(
          "padding-top: 104px; padding-bottom: 104px; text-align: center; position: relative;",
        )}
      >
        <div style={s("display: inline-block; margin-bottom: 20px;")}>
          <Shield w={44} h={52} />
        </div>
        <h2
          style={s(
            "margin: 0 auto 18px auto; font-size: clamp(36px, 4.8vw, 56px); line-height: 1.02; letter-spacing: -0.035em; font-weight: 700; max-width: 720px; color: #f5f1ea;",
          )}
        >
          Ship with <span style={s("color: #e8862e;")}>confidence.</span>
        </h2>
        <p
          style={s(
            "margin: 0 auto 36px auto; font-size: 17px; color: #b8b0a6; max-width: 540px; line-height: 1.55;",
          )}
        >
          Install the CLI, run a local comparison, and inspect the interactive
          HTML diff workbench before gating pull requests.
        </p>

        <div
          style={s(
            "display: inline-flex; align-items: stretch; gap: 10px; flex-wrap: wrap; justify-content: center;",
          )}
        >
          <button
            type="button"
            onClick={() => copyCta("npx -p @frontguard/cli frontguard init --ci")}
            aria-label="Copy command: npx -p @frontguard/cli frontguard init --ci"
            style={{
              fontFamily: MONO,
              ...s(
                "display: flex; align-items: center; gap: 18px; padding: 14px 18px; background: #141210; border: 1px solid #2a2622; border-radius: 6px; font-size: 13px; color: #f5f1ea; cursor: pointer;",
              ),
            }}
          >
            <span>
              <span style={s("color: #e8862e; margin-right: 10px;")}>{"$"}</span>
              npx -p @frontguard/cli frontguard init --ci
            </span>
            <span
              style={s(
                `font-size: 11px; color: ${ctaCopied ? "#4fb477" : "#8c847a"}; padding: 2px 7px; border-radius: 3px; background: #1d1a17; border: 1px solid #2a2622;`,
              )}
            >
              {ctaCopied ? "copied ✓" : "copy"}
            </span>
          </button>
          <Link
            to="/docs/$"
            params={{ _splat: "getting-started/quickstart" }}
            style={s(
              "padding: 14px 22px; background: #e8862e; color: #0d0c0b; font-weight: 600; font-size: 14px; border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 8px;",
            )}
          >
            Read the docs →
          </Link>
          <a
            href="https://github.com/ravidsrk/frontguard"
            target="_blank"
            rel="noreferrer"
            style={s(
              "padding: 14px 20px; background: transparent; color: #f5f1ea; border: 1px solid #2a2622; font-weight: 500; font-size: 14px; border-radius: 6px; text-decoration: none; display: inline-flex; align-items: center; gap: 8px;",
            )}
          >
            Star on GitHub ★
          </a>
        </div>
      </div>
    </section>
  );
}
