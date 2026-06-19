import { createFileRoute } from '@tanstack/react-router'
import { s } from '../lib/style'
import { Nav } from '../components/Nav'

export const Route = createFileRoute('/brand')({
  component: Brand,
})

const MONO = "'JetBrains Mono', monospace"
const clip = 'polygon(0% 0%, 100% 0%, 100% 62%, 50% 100%, 0% 62%)'

const neutrals = [
  { name: 'canvas', hex: '#0d0c0b' },
  { name: 'panel', hex: '#131210' },
  { name: 'raised', hex: '#1f1c19' },
  { name: 'border', hex: '#322d28' },
  { name: 'ink-mid', hex: '#b8b0a6' },
  { name: 'ink-hi', hex: '#f5f1ea' },
]

const statuses = [
  { glyph: '✓', label: 'pass', hex: '#4fb477' },
  { glyph: '⚠', label: 'warning', hex: '#e8862e' },
  { glyph: '✘', label: 'regression', hex: '#e5484d' },
  { glyph: '★', label: 'new', hex: '#5b8def' },
]

const say = [
  'Name the real problem: false positives, flake, muted channels.',
  'Quote the classifier: "intentional change, not a regression."',
  'Lead with BYOK, MIT, and self-hostable — earn trust with facts.',
  'Publish real numbers, including where it gets things wrong.',
]

const dont = [
  'Promise "zero false positives" or "100% accuracy."',
  'Call it magic, autonomous, or a silver bullet.',
  'Bury that AI is optional and runs on your own key.',
  'Shout in title case or pile on exclamation marks.',
]

const voice = [
  { label: 'HONEST', color: '#4fb477', body: "Lead with the real problem — false positives and flake. Skeptical engineers smell hype. Don't oversell." },
  { label: 'PRECISE', color: '#e8862e', body: 'Specifics over adjectives. "Restore flex-direction: column at <768px" beats "fixes your layout."' },
  { label: 'LOWERCASE', color: '#5b8def', body: 'The wordmark and commands stay lowercase, like the CLI. Terminal-native, never shouty.' },
]

/** A raw shield mark with a configurable notch color (the surface behind it). */
function Mark({ w, h, seam, notch }: { w: number; h: number; seam: number; notch: string }) {
  return (
    <span style={{ position: 'relative', width: w, height: h, display: 'inline-block' }}>
      <span style={{ position: 'absolute', inset: 0, background: '#e8862e', clipPath: clip }} />
      <span style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: seam, transform: 'translateX(-50%)', background: notch, clipPath: clip }} />
    </span>
  )
}

function Brand() {
  return (
    <div style={s('background: #0d0c0b; color: #b8b0a6; min-height: 100vh;')}>
      <Nav active="brand" />

      <div style={s('padding: 56px 28px 80px;')}>
        <div style={s('max-width: 1080px; margin: 0 auto;')}>

          <h1 style={s('font-size: 52px; letter-spacing: -0.04em; font-weight: 700; color: #f5f1ea; margin: 0 0 16px; line-height: 1.0;')}>The Frontguard<br />brand system.</h1>
          <p style={s('font-size: 17px; color: #b8b0a6; margin: 0 0 64px; max-width: 540px; line-height: 1.55;')}>A terminal-native identity for an open-source developer tool. Sharp, precise, mono-forward — built to look at home in a CLI and a PR comment alike.</p>

          {/* 01 MARK */}
          <div style={s(`font-family: ${MONO}; font-size: 12px; color: #e8862e; letter-spacing: 0.08em; margin-bottom: 20px;`)}>01 / THE MARK</div>
          <div style={s('display: grid; grid-template-columns: 1.1fr 1fr; gap: 20px; margin-bottom: 24px;')}>
            <div style={s('border: 1px solid #2a2622; background: #131210; padding: 48px; display: flex; align-items: center; justify-content: center; min-height: 280px;')}>
              <Mark w={120} h={142} seam={7} notch="#131210" />
            </div>
            <div style={s('border: 1px solid #2a2622; background: #131210; padding: 32px; display: flex; flex-direction: column; justify-content: center; gap: 20px;')}>
              <div>
                <div style={s(`font-family: ${MONO}; font-size: 12px; color: #f5f1ea; margin-bottom: 6px;`)}>The shield</div>
                <p style={s('font-size: 13.5px; line-height: 1.55; color: #8c847a; margin: 0;')}>A geometric shield = protection, the guard at the gate. Built from a single 5-point polygon — no decorative SVG.</p>
              </div>
              <div>
                <div style={s(`font-family: ${MONO}; font-size: 12px; color: #f5f1ea; margin-bottom: 6px;`)}>The seam</div>
                <p style={s('font-size: 13.5px; line-height: 1.55; color: #8c847a; margin: 0;')}>A center split divides the shield into two halves — <span style={s('color: #e8862e;')}>baseline</span> vs <span style={s('color: #e8862e;')}>current</span>. The visual diff, built into the mark.</p>
              </div>
              <div>
                <div style={s(`font-family: ${MONO}; font-size: 12px; color: #f5f1ea; margin-bottom: 6px;`)}>The cursor</div>
                <p style={s('font-size: 13.5px; line-height: 1.55; color: #8c847a; margin: 0;')}>The wordmark ends in a blinking block cursor <span style={s('display: inline-block; width: 7px; height: 13px; background: #e8862e; vertical-align: -1px; animation: fg-blink 1.1s step-end infinite;')} /> — the terminal, always.</p>
              </div>
            </div>
          </div>

          {/* lockups */}
          <div style={s('display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 64px;')}>
            <div style={s('border: 1px solid #2a2622; background: #131210; padding: 36px 28px; display: flex; flex-direction: column; align-items: center; gap: 22px;')}>
              <div style={s('display: flex; align-items: center; gap: 13px;')}>
                <Mark w={30} h={36} seam={2} notch="#131210" />
                <span style={s(`font-family: ${MONO}; font-weight: 700; font-size: 21px; letter-spacing: -0.02em; color: #f5f1ea;`)}>frontguard<span style={s('display: inline-block; width: 8px; height: 16px; background: #e8862e; vertical-align: -1px; margin-left: 2px;')} /></span>
              </div>
              <span style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48;`)}>PRIMARY LOCKUP</span>
            </div>
            <div style={s('border: 1px solid #2a2622; background: #f5f1ea; padding: 36px 28px; display: flex; flex-direction: column; align-items: center; gap: 22px;')}>
              <div style={s('display: flex; align-items: center; gap: 13px;')}>
                <span style={{ position: 'relative', width: 30, height: 36, display: 'inline-block' }}>
                  <span style={{ position: 'absolute', inset: 0, background: '#14110d', clipPath: clip }} />
                  <span style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2, transform: 'translateX(-50%)', background: '#f5f1ea', clipPath: clip }} />
                </span>
                <span style={s(`font-family: ${MONO}; font-weight: 700; font-size: 21px; letter-spacing: -0.02em; color: #14110d;`)}>frontguard</span>
              </div>
              <span style={s(`font-family: ${MONO}; font-size: 11px; color: #9b958c;`)}>MONO · ON LIGHT</span>
            </div>
            <div style={s('border: 1px solid #2a2622; background: #131210; padding: 36px 28px; display: flex; flex-direction: column; align-items: center; gap: 22px;')}>
              <Mark w={46} h={55} seam={3} notch="#131210" />
              <span style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48;`)}>MARK · APP ICON</span>
            </div>
          </div>

          {/* 02 COLOR */}
          <div style={s(`font-family: ${MONO}; font-size: 12px; color: #e8862e; letter-spacing: 0.08em; margin-bottom: 20px;`)}>02 / COLOR</div>
          <div style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48; letter-spacing: 0.06em; margin-bottom: 12px;`)}>CANVAS &amp; INK — warm neutrals</div>
          <div style={s('display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; margin-bottom: 32px;')}>
            {neutrals.map((c) => (
              <div key={c.name} className="fg-swatch">
                <div style={s(`height: 84px; background: ${c.hex}; border: 1px solid #2a2622;`)} />
                <div style={s(`font-family: ${MONO}; font-size: 11px; color: #d8d0c5; margin-top: 8px;`)}>{c.name}</div>
                <div style={s(`font-family: ${MONO}; font-size: 10.5px; color: #6b645c;`)}>{c.hex}</div>
              </div>
            ))}
          </div>

          <div style={s('display: grid; grid-template-columns: 1fr 1.4fr; gap: 32px; margin-bottom: 64px;')}>
            <div>
              <div style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48; letter-spacing: 0.06em; margin-bottom: 12px;`)}>BRAND ACCENT — amber</div>
              <div className="fg-swatch" style={s('background: #e8862e; padding: 24px; min-height: 160px; display: flex; flex-direction: column; justify-content: space-between;')}>
                <span style={s(`font-family: ${MONO}; font-size: 13px; color: #4a2a0e; font-weight: 700;`)}>Frontguard Amber</span>
                <div style={s(`font-family: ${MONO}; font-size: 12px; color: #4a2a0e; line-height: 1.7;`)}>#E8862E<br />oklch(0.72 0.18 50)</div>
              </div>
            </div>
            <div>
              <div style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48; letter-spacing: 0.06em; margin-bottom: 12px;`)}>STATUS PALETTE — the terminal language</div>
              <div style={s('display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;')}>
                {statuses.map((st) => (
                  <div key={st.label} style={s('border: 1px solid #2a2622; background: #131210; padding: 16px 18px; display: flex; align-items: center; gap: 14px;')}>
                    <span style={s(`font-family: ${MONO}; font-size: 22px; color: ${st.hex}; width: 22px; text-align: center;`)}>{st.glyph}</span>
                    <div>
                      <div style={s(`font-family: ${MONO}; font-size: 13px; color: #f5f1ea;`)}>{st.label}</div>
                      <div style={s(`font-family: ${MONO}; font-size: 10.5px; color: #6b645c;`)}>{st.hex}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 03 TYPE */}
          <div style={s(`font-family: ${MONO}; font-size: 12px; color: #e8862e; letter-spacing: 0.08em; margin-bottom: 20px;`)}>03 / TYPOGRAPHY</div>
          <div style={s('display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;')}>
            <div style={s('border: 1px solid #2a2622; background: #131210; padding: 32px;')}>
              <div style={s('display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 20px;')}>
                <span style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48;`)}>DISPLAY &amp; BODY</span>
                <span style={s(`font-family: ${MONO}; font-size: 11px; color: #e8862e;`)}>Space Grotesk</span>
              </div>
              <div style={s("font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 46px; color: #f5f1ea; letter-spacing: -0.03em; line-height: 1; margin-bottom: 4px;")}>Aa</div>
              <div style={s("font-family: 'Space Grotesk', sans-serif; font-size: 15px; color: #8c847a; letter-spacing: 0.04em; margin-bottom: 18px;")}>ABCDEFGHIJKLM abcdefghijklm 0123456789</div>
              <div style={s("display: flex; gap: 18px; font-family: 'Space Grotesk', sans-serif; font-size: 13px; color: #b8b0a6;")}>
                <span>Regular</span><span style={s('font-weight: 500;')}>Medium</span><span style={s('font-weight: 600;')}>SemiBold</span><span style={s('font-weight: 700;')}>Bold</span>
              </div>
            </div>
            <div style={s('border: 1px solid #2a2622; background: #131210; padding: 32px;')}>
              <div style={s('display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 20px;')}>
                <span style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48;`)}>CODE · LABELS · UI</span>
                <span style={s(`font-family: ${MONO}; font-size: 11px; color: #e8862e;`)}>JetBrains Mono</span>
              </div>
              <div style={s(`font-family: ${MONO}; font-weight: 700; font-size: 46px; color: #f5f1ea; line-height: 1; margin-bottom: 4px;`)}>Aa</div>
              <div style={s(`font-family: ${MONO}; font-size: 14px; color: #8c847a; margin-bottom: 18px;`)}>ABCDEFGHIJKLM abcdefghijklm 0123456789</div>
              <div style={s(`display: flex; gap: 18px; font-family: ${MONO}; font-size: 13px; color: #b8b0a6;`)}>
                <span>Regular</span><span style={s('font-weight: 500;')}>Medium</span><span style={s('font-weight: 700;')}>Bold</span>
              </div>
            </div>
          </div>
          <div style={s('border: 1px solid #2a2622; background: #131210; padding: 32px 36px; margin-bottom: 64px;')}>
            <div style={s('display: flex; align-items: baseline; gap: 20px; padding: 12px 0; border-bottom: 1px solid #211e1b;')}>
              <span style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48; width: 96px;`)}>DISPLAY / 52</span>
              <span style={s("font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 38px; color: #f5f1ea; letter-spacing: -0.035em;")}>Ship with confidence</span>
            </div>
            <div style={s('display: flex; align-items: baseline; gap: 20px; padding: 12px 0; border-bottom: 1px solid #211e1b;')}>
              <span style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48; width: 96px;`)}>HEADING / 38</span>
              <span style={s("font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 27px; color: #f5f1ea; letter-spacing: -0.02em;")}>Detect, understand, fix</span>
            </div>
            <div style={s('display: flex; align-items: baseline; gap: 20px; padding: 12px 0; border-bottom: 1px solid #211e1b;')}>
              <span style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48; width: 96px;`)}>BODY / 16</span>
              <span style={s("font-family: 'Space Grotesk', sans-serif; font-size: 16px; color: #b8b0a6;")}>Renders every page and explains what changed and why.</span>
            </div>
            <div style={s('display: flex; align-items: baseline; gap: 20px; padding: 12px 0;')}>
              <span style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48; width: 96px;`)}>MONO / 13</span>
              <span style={s(`font-family: ${MONO}; font-size: 13px; color: #e8862e;`)}>$ npx frontguard run --url localhost:3000</span>
            </div>
          </div>

          {/* 04 VOICE */}
          <div style={s(`font-family: ${MONO}; font-size: 12px; color: #e8862e; letter-spacing: 0.08em; margin-bottom: 20px;`)}>04 / VOICE</div>
          <div style={s('display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;')}>
            {voice.map((v) => (
              <div key={v.label} style={s('border: 1px solid #2a2622; background: #131210; padding: 26px 24px;')}>
                <div style={s(`font-family: ${MONO}; font-size: 12px; color: ${v.color}; margin-bottom: 10px;`)}>{v.label}</div>
                <p style={s('font-size: 14px; line-height: 1.55; color: #b8b0a6; margin: 0;')}>{v.body}</p>
              </div>
            ))}
          </div>

          {/* 05 MESSAGING */}
          <div style={s(`font-family: ${MONO}; font-size: 12px; color: #e8862e; letter-spacing: 0.08em; margin: 64px 0 20px;`)}>05 / MESSAGING</div>
          <div style={s('border: 1px solid #2a2622; background: #131210; padding: 36px 34px; margin-bottom: 20px;')}>
            <div style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48; letter-spacing: 0.06em; margin-bottom: 14px;`)}>PRIMARY TAGLINE</div>
            <div style={s('font-size: 34px; letter-spacing: -0.03em; font-weight: 700; color: #f5f1ea; line-height: 1.1;')}>Catch the regression, not the noise.</div>
            <div style={s('height: 1px; background: #211e1b; margin: 28px 0;')} />
            <div style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48; letter-spacing: 0.06em; margin-bottom: 14px;`)}>THE ONE-LINER</div>
            <p style={s('font-size: 16px; line-height: 1.6; color: #c8c0b6; margin: 0; max-width: 620px;')}>Everyone adds visual regression tests. Then everyone mutes the channel they post to. Frontguard uses AI vision to tell a real regression from noise — so a red run means something again.</p>
          </div>
          <div style={s('display: grid; grid-template-columns: 1fr 1fr; gap: 20px;')}>
            <div style={s('border: 1px solid #1f3a28; background: #0e1410; padding: 26px 24px;')}>
              <div style={s(`font-family: ${MONO}; font-size: 12px; color: #4fb477; margin-bottom: 16px;`)}>SAY</div>
              <ul style={s('list-style: none; padding: 0; margin: 0; display: grid; gap: 11px;')}>
                {say.map((x) => (
                  <li key={x} style={s('display: grid; grid-template-columns: 16px 1fr; gap: 10px; font-size: 14px; line-height: 1.5; color: #c8c0b6;')}>
                    <span style={s(`color: #4fb477; font-family: ${MONO};`)}>+</span>{x}
                  </li>
                ))}
              </ul>
            </div>
            <div style={s('border: 1px solid #3a1f1f; background: #170f0e; padding: 26px 24px;')}>
              <div style={s(`font-family: ${MONO}; font-size: 12px; color: #e5484d; margin-bottom: 16px;`)}>DON'T</div>
              <ul style={s('list-style: none; padding: 0; margin: 0; display: grid; gap: 11px;')}>
                {dont.map((x) => (
                  <li key={x} style={s('display: grid; grid-template-columns: 16px 1fr; gap: 10px; font-size: 14px; line-height: 1.5; color: #b8b0a6;')}>
                    <span style={s(`color: #e5484d; font-family: ${MONO};`)}>−</span>{x}
                  </li>
                ))}
              </ul>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
