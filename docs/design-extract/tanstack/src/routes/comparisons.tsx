import { createFileRoute, Link } from '@tanstack/react-router'
import { s } from '../lib/style'
import { Nav } from '../components/Nav'

export const Route = createFileRoute('/comparisons')({
  component: Comparisons,
})

const MONO = "'JetBrains Mono', monospace"
const Y = '#4fb477'
const P = '#e8862e'
const N = '#6b645c'
const INKC = '#a89f94'

function cell(v: string): string {
  if (v === '✓') return Y
  if (v === '◐') return P
  if (v === '✕') return N
  return INKC
}

type Row = {
  cap: string
  weight: string
  v: string[]
  c: string[]
}

function R(cap: string, vals: string[], weight = '400'): Row {
  return {
    cap,
    weight,
    v: vals,
    c: vals.map((val, i) => (i === 0 && val.startsWith('✓') ? Y : cell(val))),
  }
}

const alternatives = [
  { name: 'Percy', status: '↗ $399/mo pricing cliff', color: '#e8862e' },
  { name: 'Chromatic', status: '◐ Storybook-locked', color: '#e8862e' },
  { name: 'BackstopJS', status: '✕ unmaintained', color: '#e5484d' },
  { name: 'Lost Pixel', status: '✕ archived', color: '#e5484d' },
]

const cols = ['Frontguard', 'Percy', 'Chromatic', 'BackstopJS', 'Lost Pixel', 'Argos']

const matrix: Row[] = [
  R('Open source', ['✓ MIT', '✕', '◐', '✓', '◐', '✓ MIT'], '600'),
  R('CLI-first', ['✓', '✕', '✕', '✓', '✓', '✓']),
  R('AI change classification', ['✓', '✕', '✕', '✕', '✕', '✕'], '600'),
  R('AI fix verification', ['✓', '✕', '✕', '✕', '✕', '✕'], '600'),
  R('Anti-flake rendering', ['✓', '◐', '◐', '✕', '✕', '◐']),
  R('Self-hostable', ['✓', '✕', '✕', '✓', '◐', '◐']),
  R('Free tier', ['Forever', 'Trial', 'Hobby', 'Free', '✕', 'Hobby']),
  R('Pro entry', ['$29/mo', '~$399/mo', 'per-snap', 'n/a', 'n/a', '$100/mo']),
  R('Actively maintained', ['✓', '✓', '✓', '✕ 6yr', '✕', '✓']),
]

const versus = [
  { name: 'Percy', their: 'Polished hosted dashboard, broad framework SDKs, and mature review workflows backed by BrowserStack.', ours: 'CLI-first and free forever — no per-screenshot billing that punishes a growing suite. Plus AI explanations, not just a red diff to triage by hand.', to: '/docs', cta: 'Migration guide' },
  { name: 'Chromatic', their: 'Best-in-class for Storybook component testing, with TurboSnap and a tight Storybook publish flow.', ours: 'Tests the real app at real URLs, not just isolated stories — and classifies regression vs. intentional so review queues stay short. Storybook capture is supported too.', to: '/docs', cta: 'Migration guide' },
  { name: 'BackstopJS', their: 'A free, self-hosted classic — simple, scriptable, no vendor at all.', ours: 'Same self-hosted freedom, but with zero-config route discovery, anti-flake rendering, AI analysis, and active maintenance (BackstopJS has been quiet for years).', to: '/docs', cta: 'Migration guide' },
  { name: 'Lost Pixel / Argos', their: 'Modern, developer-friendly OSS-leaning tools with good CI ergonomics and Playwright trace support.', ours: 'The only one with AI change classification and verified fixes — and a flat, screenshot-count-independent price with full self-hosting.', to: '/docs', cta: 'Read comparison' },
]

const migrations = ['BackstopJS', 'Lost Pixel', 'Percy', 'Chromatic']

function Comparisons() {
  return (
    <div style={s('background: #0d0c0b; color: #b8b0a6; min-height: 100vh;')}>
      <Nav active="compare" />

      {/* header */}
      <header style={s('max-width: 1200px; margin: 0 auto; padding: 76px 28px 44px; text-align: center;')}>
        <div style={s(`font-family: ${MONO}; font-size: 12px; color: #e8862e; letter-spacing: 0.08em; margin-bottom: 16px;`)}>// HOW IT COMPARES</div>
        <h1 style={s('font-size: 52px; line-height: 1.04; letter-spacing: -0.035em; font-weight: 700; color: #f5f1ea; margin: 0 0 18px;')}>Frontguard vs. everyone else.</h1>
        <p style={s('font-size: 18px; line-height: 1.55; color: #b8b0a6; margin: 0 auto; max-width: 600px;')}>Visual testing tools all take a screenshot and diff it. Only Frontguard explains <em style={s('color: #f5f1ea; font-style: normal;')}>why</em> something changed, verifies a fix, and stays open source and self-hostable.</p>
      </header>

      {/* alternatives strip */}
      <section style={s('max-width: 1200px; margin: 0 auto; padding: 0 28px 12px;')}>
        <div style={s('display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;')}>
          {alternatives.map((alt) => (
            <div key={alt.name} style={s('border: 1px solid #2a2622; background: #131210; padding: 16px 18px;')}>
              <div style={s(`font-family: ${MONO}; font-size: 13px; color: #d8d0c5; margin-bottom: 6px;`)}>{alt.name}</div>
              <div style={s(`font-family: ${MONO}; font-size: 12px; color: ${alt.color};`)}>{alt.status}</div>
            </div>
          ))}
        </div>
      </section>

      {/* big matrix */}
      <section style={s('max-width: 1200px; margin: 0 auto; padding: 8px 28px 40px;')}>
        <div style={s('border: 1px solid #2a2622; overflow-x: auto;')}>
          <table style={s('width: 100%; border-collapse: collapse; font-size: 13.5px; min-width: 860px;')}>
            <thead>
              <tr style={s('background: #161412;')}>
                <th style={s(`text-align: left; padding: 18px; font-family: ${MONO}; font-size: 11px; color: #7c746b; font-weight: 500; letter-spacing: 0.04em; position: sticky; left: 0; background: #161412;`)}>CAPABILITY</th>
                {cols.map((h, i) => (
                  <th key={h} style={s(`padding: 18px 12px; font-family: ${MONO}; font-size: ${i === 0 ? '13px' : '12px'}; color: ${i === 0 ? '#e8862e' : '#8c847a'}; font-weight: ${i === 0 ? 700 : 500};`)}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.cap} className="fg-cmp-row" style={s('border-top: 1px solid #211e1b;')}>
                  <td style={s(`padding: 15px 18px; color: #d8d0c5; font-weight: ${row.weight};`)}>{row.cap}</td>
                  {row.v.map((val, i) => (
                    <td key={i} style={s(`text-align: center; padding: 15px 12px; color: ${row.c[i]}; font-family: ${MONO}; ${i === 0 ? 'font-weight: 700;' : 'font-size: 12.5px;'}`)}>{val}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={s(`display: flex; gap: 22px; flex-wrap: wrap; margin-top: 16px; font-family: ${MONO}; font-size: 11.5px; color: #6b645c;`)}>
          <span><span style={s('color: #4fb477;')}>✓</span> full support</span>
          <span><span style={s('color: #e8862e;')}>◐</span> partial / limited</span>
          <span><span style={s('color: #6b645c;')}>✕</span> not available</span>
        </div>
      </section>

      {/* head to head */}
      <section style={s('max-width: 1200px; margin: 0 auto; padding: 56px 28px;')}>
        <h2 style={s('font-size: 32px; letter-spacing: -0.03em; font-weight: 700; color: #f5f1ea; margin: 0 0 8px;')}>Head to head</h2>
        <p style={s('font-size: 16px; color: #b8b0a6; margin: 0 0 36px;')}>The honest version — what each tool is genuinely good at, and where Frontguard pulls ahead.</p>
        <div style={s('display: grid; grid-template-columns: 1fr 1fr; gap: 18px;')}>
          {versus.map((v) => (
            <div key={v.name} className="fg-vs" style={s('border: 1px solid #2a2622; background: #131210; padding: 28px 26px;')}>
              <div style={s('display: flex; align-items: center; gap: 12px; margin-bottom: 18px;')}>
                <span style={s(`font-family: ${MONO}; font-size: 13px; color: #e8862e; font-weight: 700;`)}>frontguard</span>
                <span style={s(`font-family: ${MONO}; font-size: 12px; color: #564f48;`)}>vs</span>
                <span style={s(`font-family: ${MONO}; font-size: 13px; color: #d8d0c5;`)}>{v.name}</span>
              </div>
              <div style={s('margin-bottom: 16px;')}>
                <div style={s(`font-family: ${MONO}; font-size: 11px; color: #8c847a; letter-spacing: 0.04em; margin-bottom: 7px;`)}>{v.name.toUpperCase()} IS GOOD AT</div>
                <p style={s('margin: 0; font-size: 14px; line-height: 1.55; color: #b8b0a6;')}>{v.their}</p>
              </div>
              <div style={s('margin-bottom: 20px;')}>
                <div style={s(`font-family: ${MONO}; font-size: 11px; color: #e8862e; letter-spacing: 0.04em; margin-bottom: 7px;`)}>WHERE FRONTGUARD WINS</div>
                <p style={s('margin: 0; font-size: 14px; line-height: 1.55; color: #d8d0c5;')}>{v.ours}</p>
              </div>
              <Link to={v.to} className="fg-link" style={s(`font-family: ${MONO}; font-size: 12.5px; color: #8c847a; text-decoration: none;`)}>{v.cta} →</Link>
            </div>
          ))}
        </div>
      </section>

      {/* migration */}
      <section style={s('border-top: 1px solid #211e1b; background: #100f0e;')}>
        <div style={s('max-width: 1200px; margin: 0 auto; padding: 64px 28px;')}>
          <div style={s('display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 48px; align-items: center;')}>
            <div>
              <h2 style={s('font-size: 30px; letter-spacing: -0.03em; font-weight: 700; color: #f5f1ea; margin: 0 0 16px;')}>Switching is a config file, not a rewrite.</h2>
              <p style={s('font-size: 15.5px; line-height: 1.6; color: #b8b0a6; margin: 0;')}>Frontguard reads your app by URL — no test files to port, no proprietary snapshot format. Point it at your dev server and you have baselines in one run. Migration guides walk through the rest.</p>
            </div>
            <div style={s('display: grid; grid-template-columns: 1fr 1fr; gap: 12px;')}>
              {migrations.map((m) => (
                <Link key={m} to="/docs" className="fg-vs" style={s('border: 1px solid #2a2622; background: #131210; padding: 18px 20px; text-decoration: none;')}>
                  <div style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48; margin-bottom: 6px;`)}>MIGRATE FROM</div>
                  <div style={s('font-size: 16px; color: #f5f1ea; font-weight: 600;')}>{m}</div>
                  <div style={s(`font-family: ${MONO}; font-size: 12px; color: #e8862e; margin-top: 8px;`)}>Read guide →</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={s('border-top: 1px solid #211e1b;')}>
        <div style={s('max-width: 1200px; margin: 0 auto; padding: 80px 28px; text-align: center;')}>
          <h2 style={s('font-size: 40px; letter-spacing: -0.035em; font-weight: 700; color: #f5f1ea; margin: 0 0 16px;')}>See the difference yourself.</h2>
          <p style={s('font-size: 17px; color: #b8b0a6; margin: 0 auto 30px; max-width: 440px; line-height: 1.55;')}>Install the CLI and run your first AI-explained visual check in two minutes.</p>
          <div style={s('display: flex; gap: 14px; justify-content: center;')}>
            <Link to="/docs" className="fg-btn-primary" style={s(`background: #e8862e; color: #0d0c0b; font-family: ${MONO}; font-weight: 700; font-size: 14px; padding: 14px 26px; text-decoration: none;`)}>Get started →</Link>
            <Link to="/pricing" className="fg-btn-ghost" style={s(`border: 1px solid #322d28; color: #f5f1ea; font-family: ${MONO}; font-weight: 500; font-size: 14px; padding: 14px 26px; text-decoration: none;`)}>View pricing</Link>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer style={s('border-top: 1px solid #211e1b; background: #0d0c0b;')}>
        <div style={s('max-width: 1200px; margin: 0 auto; padding: 32px 28px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;')}>
          <span style={s(`font-family: ${MONO}; font-size: 12px; color: #564f48;`)}>© 2026 Frontguard · MIT License</span>
          <div style={s(`display: flex; gap: 22px; font-family: ${MONO}; font-size: 12px;`)}>
            <Link to="/docs" className="fg-link" style={s('color: #6b645c; text-decoration: none;')}>Docs</Link>
            <Link to="/pricing" className="fg-link" style={s('color: #6b645c; text-decoration: none;')}>Pricing</Link>
            <a href="https://github.com/ravidsrk/frontguard" className="fg-link" style={s('color: #6b645c; text-decoration: none;')}>GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
