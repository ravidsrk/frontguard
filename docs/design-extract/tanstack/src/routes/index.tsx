import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { s } from '../lib/style'
import { Nav } from '../components/Nav'
import { Footer } from '../components/Footer'
import { Shield } from '../components/Shield'

export const Route = createFileRoute('/')({
  component: Home,
})

const MONO = "'JetBrains Mono', monospace"

const stages = [
  { num: '01', title: 'Discover', desc: 'Crawl, filesystem scan, or config — finds every route automatically.' },
  { num: '02', title: 'Filter', desc: 'Dependency graph renders only pages affected by your changes.' },
  { num: '03', title: 'Render', desc: 'Playwright × viewports × browsers. Anti-flake multi-render.' },
  { num: '04', title: 'Diff', desc: 'pixelmatch fast gate, then DOM + computed-style diff.' },
  { num: '05', title: 'Analyze', desc: 'AI vision classifies, explains, and scores confidence.' },
  { num: '06', title: 'Report', desc: 'Console, JSON, HTML, and a GitHub PR comment with diffs.' },
]

const features = [
  { tag: 'DISCOVERY', title: 'Zero-config routes', desc: 'Auto-crawls your app to find every page. No manual route lists.' },
  { tag: 'RENDER', title: 'Multi-browser', desc: 'Chromium, Firefox and WebKit via Playwright from day one.' },
  { tag: 'SPEED', title: 'Smart rendering', desc: 'Dependency graph renders only the pages your PR actually affects.' },
  { tag: 'STORAGE', title: 'Git-native baselines', desc: 'Stored in an orphan branch — zero bloat on your main branch.' },
  { tag: 'PREVIEW', title: 'Preview deploys', desc: 'Auto-detects Vercel and Netlify preview URLs. Push and go.' },
  { tag: 'CONFIG', title: 'Per-route thresholds', desc: 'Strict on /checkout, relaxed on /blog — all in one file.' },
  { tag: 'DETECT', title: 'Framework detection', desc: 'Next.js, Remix, SvelteKit, Nuxt and Astro out of the box.' },
  { tag: 'SECURITY', title: 'Security hardened', desc: 'Shell-injection prevention, path-traversal guards, key redaction.' },
  { tag: 'REPORT', title: 'PR thumbnails', desc: 'Baseline / current / diff images embedded right in the PR comment.' },
]

const comparison = [
  { cap: 'Open source (MIT)', fg: '✓', percy: '✕', chromatic: '◐', backstop: '✓', lostpixel: '◐' },
  { cap: 'CLI-first', fg: '✓', percy: '✕', chromatic: '✕', backstop: '✓', lostpixel: '✓' },
  { cap: 'AI change classification', fg: '✓', percy: '✕', chromatic: '✕', backstop: '✕', lostpixel: '✕' },
  { cap: 'AI fix verification', fg: '✓', percy: '✕', chromatic: '✕', backstop: '✕', lostpixel: '✕' },
  { cap: 'Anti-flake rendering', fg: '✓', percy: '◐', chromatic: '◐', backstop: '✕', lostpixel: '✕' },
  { cap: 'Self-hostable', fg: '✓', percy: '✕', chromatic: '✕', backstop: '✓', lostpixel: '◐' },
  { cap: 'Free tier', fg: 'Forever', percy: 'Trial', chromatic: 'Hobby', backstop: 'Free', lostpixel: '✕' },
]

const plugins = [
  { name: 'Figma', desc: 'Design-to-code comparison & token extraction.' },
  { name: 'Perf Budgets', desc: 'LCP / CLS / TTFB thresholds tied to the diff.' },
  { name: 'Accessibility', desc: 'axe-core WCAG audits in the same render pass.' },
  { name: '3rd-Party Scripts', desc: 'Flags ad / analytics / widget drift between runs.' },
  { name: 'Monitor', desc: 'Production visual monitoring & alerting.' },
]

const honest = [
  { label: 'YOU BRING THE KEY', color: '#e8862e', body: 'AI runs on your own OpenAI or Anthropic key, so you pay per judged diff. The anti-flake gate keeps ~90% of pages away from the model — the bill stays small, and your screenshots never touch a server we run.' },
  { label: 'YOU STAY IN THE LOOP', color: '#4fb477', body: 'Vision models misjudge edge cases. Frontguard never silently auto-approves — every classification and every fix is yours to accept or reject, and that feedback trains the local fix-pattern database.' },
  { label: 'NUMBERS, NOT CLAIMS', color: '#5b8def', body: "It's young. We validate against real, live repositories and publish real false-positive rates rather than asserting accuracy. Trust is earned — tell us where the classifier gets it wrong." },
]

const stats = [
  { v: '~40%', c: '#e8862e', d: "of visual-diff runs fail for reasons that aren't real bugs" },
  { v: '73%', c: '#f5f1ea', d: 'of teams have lost faith in test automation to flake' },
  { v: '<10%', c: '#f5f1ea', d: 'of frontend teams run visual regression testing at all' },
  { v: '$100M', c: '#f5f1ea', d: 'a single mobile CSS bug cost on Prime Day' },
]

const pillars = [
  { n: '01 / DETECT', c: '#4fb477', h: 'Find what changed', p: 'Pixel diff plus DOM and computed-style diff across every viewport and browser — catching what humans miss. Multi-render consensus kills the flaky-screenshot noise.' },
  { n: '02 / UNDERSTAND', c: '#e8862e', h: 'Explain why it broke', p: 'AI vision classifies every diff — regression, intentional, or content update — maps it to the exact code change, and explains the root cause in plain language.' },
  { n: '03 / FIX', c: '#5b8def', h: 'Verified, not guessed', p: 'Generate a fix, apply it, re-render, and compare again. Only fixes that provably resolve the regression are suggested — no hallucinated guesses.' },
]

const TERMINAL_HTML = `<span style="color: #e8862e;">🔍 Discovering routes...</span> found <span style="color: #f5f1ea;">47</span> routes
<span style="color: #5b8def;">📊</span> 12/47 routes affected by changed files
<span style="color: #b8b0a6;">🖥  Rendering 12 routes × 3 viewports</span>
<span style="color: #3b3531;">───────────────────────────────────</span>
<span style="color: #4fb477;">  ✓ /</span>           375 768 1440  <span style="color: #4fb477;">PASS</span>
<span style="color: #4fb477;">  ✓ /pricing</span>    375 768 1440  <span style="color: #4fb477;">PASS</span>
<span style="color: #e8862e;">  ⚠ /checkout</span>   375 768 1440  <span style="color: #e8862e;">WARN</span>
<span style="color: #e5484d;">  ✘ /dashboard</span>  375 768 1440  <span style="color: #e5484d;">REGRESSION</span>
<span style="color: #5b8def;">  ★ /settings</span>   375 768 1440  <span style="color: #5b8def;">NEW</span>
<span style="color: #3b3531;">───────────────────────────────────</span>
<span style="color: #e5484d;">1 regression</span> · <span style="color: #e8862e;">1 warning</span> · <span style="color: #4fb477;">9 passed</span> · <span style="color: #5b8def;">1 new</span><span style="display: inline-block; width: 8px; height: 15px; background: #e8862e; vertical-align: -2px; margin-left: 4px; animation: fg-blink 1.1s step-end infinite;"></span>`

const CLI_HTML = `<span style="color: #7c746b;">$</span> npx frontguard run \\
    --url http://localhost:3000

<span style="color: #4fb477;">  ✓ 11 passed</span>   <span style="color: #e5484d;">✘ 1 regression</span>
<span style="color: #564f48;">  AI: "submit button lost its background"</span>`

const PW_HTML = `<span style="color: #c678dd;">import</span> { expectVisual } <span style="color: #c678dd;">from</span> <span style="color: #98c379;">'@frontguard/playwright'</span>;

test(<span style="color: #98c379;">'home page'</span>, <span style="color: #c678dd;">async</span> ({ page }) => {
  <span style="color: #c678dd;">await</span> page.goto(<span style="color: #98c379;">'/'</span>);
  <span style="color: #c678dd;">await</span> expectVisual(page);
});`

const CONFIG_HTML = `<span style="color: #c678dd;">export default</span> {
  baseUrl: <span style="color: #98c379;">'http://localhost:3000'</span>,

  <span style="color: #564f48;">// auto-discover routes (zero config)</span>
  discover: {
    startUrl: <span style="color: #98c379;">'/'</span>,
    maxDepth: <span style="color: #e8862e;">3</span>,
    exclude: [<span style="color: #98c379;">'/admin/*'</span>, <span style="color: #98c379;">'/api/*'</span>],
  },

  viewports: [<span style="color: #e8862e;">375</span>, <span style="color: #e8862e;">768</span>, <span style="color: #e8862e;">1440</span>],
  browsers: [<span style="color: #98c379;">'chromium'</span>],
  threshold: <span style="color: #e8862e;">0.1</span>,

  <span style="color: #564f48;">// AI analysis (optional, BYOK)</span>
  ai: { provider: <span style="color: #98c379;">'openai'</span>, model: <span style="color: #98c379;">'gpt-4o'</span> },
};`

function useCopy(): [string, (text: string) => void] {
  const [label, setLabel] = useState('copy')
  const copy = (text: string) => {
    try {
      navigator.clipboard?.writeText(text)
    } catch {
      /* noop */
    }
    setLabel('copied ✓')
    window.setTimeout(() => setLabel('copy'), 1600)
  }
  return [label, copy]
}

function Home() {
  const [installLabel, copyInstall] = useCopy()
  const [initLabel, copyInit] = useCopy()

  const eyebrow = (text: string) =>
    s(
      `font-family: ${MONO}; font-size: 12px; color: #e8862e; letter-spacing: 0.08em; margin: 0 0 14px;`,
    )

  return (
    <div style={s('background: #0d0c0b; color: #b8b0a6; min-height: 100vh; overflow-x: hidden;')}>
      <Nav />

      {/* ============ HERO ============ */}
      <header id="top" style={s('position: relative; max-width: 1200px; margin: 0 auto; padding: 88px 28px 72px;')}>
        <div style={s('display: grid; grid-template-columns: 1fr 1fr; gap: 56px; align-items: center;')}>
          <div>
            <div style={s("display: inline-flex; align-items: center; gap: 10px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #e8862e; border: 1px solid #3a2a18; background: #1a130b; padding: 6px 12px; margin-bottom: 26px; white-space: nowrap;")}>
              <span style={s('display: inline-block; width: 6px; height: 6px; background: #e8862e; animation: fg-pulse 2s ease-in-out infinite;')} />
              OPEN SOURCE · MIT · SELF-HOSTABLE
            </div>
            <h1 style={s('font-size: 58px; line-height: 1.02; letter-spacing: -0.035em; font-weight: 700; color: #f5f1ea; margin: 0 0 22px;')}>
              Catch the regression,<br />not the noise.
            </h1>
            <p style={s('font-size: 18px; line-height: 1.55; color: #b8b0a6; margin: 0 0 32px; max-width: 490px;')}>
              Teams add visual regression tests — then mute the channel they post to, because ~40% of failures aren't real bugs. Frontguard uses AI vision to label every diff a{' '}
              <em style={s('color: #f5f1ea; font-style: normal;')}>regression</em>, an{' '}
              <em style={s('color: #f5f1ea; font-style: normal;')}>intentional change</em>, or{' '}
              <em style={s('color: #f5f1ea; font-style: normal;')}>content</em> — so a red run means something again.
            </p>

            <div style={s('display: flex; align-items: stretch; max-width: 440px; margin-bottom: 22px; border: 1px solid #322d28; background: #161412;')}>
              <span style={s("font-family: 'JetBrains Mono', monospace; font-size: 14px; color: #e6e0d6; padding: 14px 16px; flex: 1; white-space: nowrap; overflow: hidden;")}>
                <span style={s('color: #7c746b;')}>$ </span>npm install @frontguard/cli
              </span>
              <button onClick={() => copyInstall('npm install @frontguard/cli')} className="fg-btn-ghost" style={s("font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #b8b0a6; background: #1f1c19; border: none; border-left: 1px solid #322d28; padding: 0 18px; cursor: pointer;")}>
                {installLabel}
              </button>
            </div>

            <div style={s('display: flex; gap: 14px;')}>
              <Link to="/docs" className="fg-btn-primary" style={s("background: #e8862e; color: #0d0c0b; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 14px; padding: 14px 26px; text-decoration: none;")}>
                Get started →
              </Link>
              <a href="https://github.com/ravidsrk/frontguard" className="fg-btn-ghost" style={s("border: 1px solid #322d28; color: #f5f1ea; font-family: 'JetBrains Mono', monospace; font-weight: 500; font-size: 14px; padding: 14px 26px; text-decoration: none;")}>
                ★ Star on GitHub
              </a>
            </div>
          </div>

          {/* terminal visual */}
          <div style={s('position: relative;')}>
            <div style={s('position: absolute; inset: -40px -20px -40px 20px; background: radial-gradient(60% 50% at 60% 40%, rgba(232,134,46,0.10), transparent 70%); pointer-events: none;')} />
            <div style={s('position: relative; background: #121110; border: 1px solid #2a2622; box-shadow: 0 24px 60px rgba(0,0,0,0.5); overflow: hidden;')}>
              <div style={s('display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #211e1b; background: #161412;')}>
                <span style={s('width: 11px; height: 11px; border-radius: 50%; background: #322d28;')} />
                <span style={s('width: 11px; height: 11px; border-radius: 50%; background: #322d28;')} />
                <span style={s('width: 11px; height: 11px; border-radius: 50%; background: #322d28;')} />
                <span style={s("margin-left: 10px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #564f48;")}>frontguard run</span>
              </div>
              <div
                style={s("font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 1.85; padding: 18px 20px; color: #b8b0a6; white-space: pre;")}
                dangerouslySetInnerHTML={{ __html: TERMINAL_HTML }}
              />
            </div>

            {/* AI classification card */}
            <div style={s('position: relative; margin: -22px 0 0 auto; width: 86%; background: #1a130b; border: 1px solid #3a2a18; padding: 16px 18px; box-shadow: 0 16px 40px rgba(0,0,0,0.45);')}>
              <div style={s("display: flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #e5484d; margin-bottom: 8px; letter-spacing: 0.04em;")}>
                <span style={s('width: 7px; height: 7px; border-radius: 50%; background: #e5484d;')} />
                AI ANALYSIS — REGRESSION · 94% CONFIDENCE
              </div>
              <p style={s('margin: 0; font-size: 13.5px; line-height: 1.55; color: #d8d0c5;')}>
                "The sidebar overlaps main content on mobile. A{' '}
                <span style={s("color: #e8862e; font-family: 'JetBrains Mono', monospace; font-size: 12.5px;")}>flex-direction</span> change in{' '}
                <span style={s("color: #f5f1ea; font-family: 'JetBrains Mono', monospace; font-size: 12.5px;")}>Dashboard.module.css:28</span> removed column stacking."
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ============ PROBLEM STRIP ============ */}
      <section style={s('border-top: 1px solid #211e1b; border-bottom: 1px solid #211e1b; background: #100f0e;')}>
        <div style={s('max-width: 1200px; margin: 0 auto; padding: 52px 28px; display: grid; grid-template-columns: 1.1fr 1fr; gap: 56px; align-items: center;')}>
          <div>
            <p style={s(`font-family: ${MONO}; font-size: 12px; color: #7c746b; letter-spacing: 0.08em; margin: 0 0 16px;`)}>// WHY TEAMS MUTE VISUAL TESTS</p>
            <p style={s('font-size: 24px; line-height: 1.45; color: #f5f1ea; margin: 0; font-weight: 500; letter-spacing: -0.01em;')}>
              Everyone adds visual regression tests. Then everyone <span style={s('color: #e8862e;')}>mutes the channel they post to.</span>
            </p>
            <p style={s('font-size: 15px; line-height: 1.6; color: #b8b0a6; margin: 20px 0 0;')}>
              Around 40% of pixel-diff runs go red for things that aren't real bugs — a 2px font shift, a changed date, a lazy image. Once a red run usually means nothing, the tool is dead — worse than no tests. That's the problem Frontguard exists to solve.
            </p>
          </div>
          <div style={s('display: grid; grid-template-columns: repeat(2, 1fr); gap: 1px; background: #211e1b; border: 1px solid #211e1b;')}>
            {stats.map((st) => (
              <div key={st.d} style={s('background: #0d0c0b; padding: 22px 20px;')}>
                <div style={s(`font-family: ${MONO}; font-size: 30px; font-weight: 700; color: ${st.c};`)}>{st.v}</div>
                <div style={s('font-size: 13px; color: #7c746b; margin-top: 6px;')}>{st.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ THREE PILLARS ============ */}
      <section style={s('max-width: 1200px; margin: 0 auto; padding: 84px 28px 20px;')}>
        <p style={eyebrow('')}>// HOW FRONTGUARD THINKS</p>
        <h2 style={s('font-size: 38px; letter-spacing: -0.03em; font-weight: 700; color: #f5f1ea; margin: 0 0 48px; max-width: 620px;')}>Not just "pixels differ." Detect, understand, fix.</h2>
        <div style={s('display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;')}>
          {pillars.map((p) => (
            <div key={p.n} className="fg-card-hover" style={s('border: 1px solid #2a2622; background: #131210; padding: 28px 24px;')}>
              <div style={s(`font-family: ${MONO}; font-size: 12px; color: ${p.c}; margin-bottom: 18px;`)}>{p.n}</div>
              <h3 style={s('font-size: 21px; color: #f5f1ea; margin: 0 0 10px; font-weight: 600; letter-spacing: -0.01em;')}>{p.h}</h3>
              <p style={s('font-size: 14.5px; line-height: 1.6; color: #b8b0a6; margin: 0;')}>{p.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ TWO WAYS IN ============ */}
      <section style={s('max-width: 1200px; margin: 0 auto; padding: 84px 28px 0;')}>
        <p style={eyebrow('')}>// RUN IT YOUR WAY</p>
        <h2 style={s('font-size: 38px; letter-spacing: -0.03em; font-weight: 700; color: #f5f1ea; margin: 0 0 14px;')}>One command, or three lines.</h2>
        <p style={s('font-size: 16px; color: #b8b0a6; margin: 0 0 44px; max-width: 600px;')}>Run it standalone against any URL, or drop visual assertions straight into the Playwright suite you already have. No proprietary snapshot format, no test files to port.</p>
        <div style={s('display: grid; grid-template-columns: 1fr 1fr; gap: 20px;')}>
          <div className="fg-card-hover" style={s('border: 1px solid #2a2622; background: #131210; overflow: hidden;')}>
            <div style={s('display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid #211e1b;')}>
              <span style={s(`font-family: ${MONO}; font-size: 13px; color: #f5f1ea; font-weight: 500;`)}>Standalone CLI</span>
              <span style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48;`)}>@frontguard/cli</span>
            </div>
            <pre style={s(`margin: 0; padding: 20px; font-family: ${MONO}; font-size: 13px; line-height: 1.8; color: #d8d0c5; overflow-x: auto;`)} dangerouslySetInnerHTML={{ __html: CLI_HTML }} />
            <p style={s('margin: 0; padding: 0 20px 20px; font-size: 13.5px; line-height: 1.55; color: #8c847a;')}>Point it at any URL. It auto-discovers routes, renders, diffs, and posts the verdict — zero test files to write.</p>
          </div>
          <div className="fg-card-hover" style={s('border: 1px solid #2a2622; background: #131210; overflow: hidden;')}>
            <div style={s('display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid #211e1b;')}>
              <span style={s(`font-family: ${MONO}; font-size: 13px; color: #f5f1ea; font-weight: 500;`)}>Playwright-native</span>
              <span style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48;`)}>@frontguard/playwright</span>
            </div>
            <pre style={s(`margin: 0; padding: 20px; font-family: ${MONO}; font-size: 13px; line-height: 1.8; color: #b8b0a6; overflow-x: auto;`)} dangerouslySetInnerHTML={{ __html: PW_HTML }} />
            <p style={s('margin: 0; padding: 0 20px 20px; font-size: 13.5px; line-height: 1.55; color: #8c847a;')}>Three lines in a test you already wrote. Reuses the page Playwright just rendered — no second browser launch.</p>
          </div>
        </div>
      </section>

      {/* ============ PIPELINE ============ */}
      <section id="how" style={s('max-width: 1200px; margin: 0 auto; padding: 84px 28px;')}>
        <p style={eyebrow('')}>// THE PIPELINE</p>
        <h2 style={s('font-size: 38px; letter-spacing: -0.03em; font-weight: 700; color: #f5f1ea; margin: 0 0 14px;')}>Six stages, fully self-hostable.</h2>
        <p style={s('font-size: 16px; color: #b8b0a6; margin: 0 0 44px; max-width: 580px;')}>Each stage is independent with error boundaries — one page failing doesn't kill the run. A fast pixel gate means ~90% of pages never hit the AI.</p>
        <div style={s('display: grid; grid-template-columns: repeat(6, 1fr); gap: 0; border: 1px solid #2a2622;')}>
          {stages.map((st) => (
            <div key={st.num} style={s('padding: 22px 18px; border-right: 1px solid #2a2622; background: #131210; position: relative;')}>
              <div style={s(`font-family: ${MONO}; font-size: 11px; color: #564f48; margin-bottom: 14px;`)}>{st.num}</div>
              <div style={s(`font-family: ${MONO}; font-size: 13px; color: #e8862e; margin-bottom: 8px; font-weight: 500;`)}>{st.title}</div>
              <div style={s('font-size: 12.5px; line-height: 1.5; color: #8c847a;')}>{st.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ AI CLASSIFICATION ============ */}
      <section style={s('border-top: 1px solid #211e1b; background: #100f0e;')}>
        <div style={s('max-width: 1200px; margin: 0 auto; padding: 84px 28px;')}>
          <div style={s('display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 56px; align-items: center;')}>
            <div>
              <p style={eyebrow('')}>// AI CLASSIFICATION</p>
              <h2 style={s('font-size: 36px; letter-spacing: -0.03em; font-weight: 700; color: #f5f1ea; margin: 0 0 18px;')}>Kills the #1 pain of visual testing: false positives.</h2>
              <p style={s('font-size: 15.5px; line-height: 1.6; color: #b8b0a6; margin: 0 0 24px;')}>A diff isn't a bug. Frontguard tells a regression apart from an intentional redesign, so your suite stops crying wolf — and teams stop disabling it.</p>
              <ul style={s('list-style: none; padding: 0; margin: 0; display: grid; gap: 12px;')}>
                {[
                  'Severity and confidence scoring on every issue',
                  'Bring your own key — OpenAI or Anthropic',
                  'Runs locally first; AI activates only on real diffs',
                ].map((li) => (
                  <li key={li} style={s('display: flex; gap: 12px; font-size: 14.5px; color: #d8d0c5;')}>
                    <span style={s(`color: #4fb477; font-family: ${MONO};`)}>✓</span>
                    {li}
                  </li>
                ))}
              </ul>
            </div>
            <div style={s('display: grid; gap: 16px;')}>
              <div style={s('border: 1px solid #3a1f1f; background: #170f0e; padding: 20px 22px;')}>
                <div style={s('display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;')}>
                  <span style={s(`font-family: ${MONO}; font-size: 13px; color: #f5f1ea;`)}>✘ /dashboard <span style={s('color: #7c746b;')}>@ 375px</span></span>
                  <span style={s(`font-family: ${MONO}; font-size: 11px; color: #e5484d; border: 1px solid #4a2424; padding: 3px 9px;`)}>REGRESSION · 94%</span>
                </div>
                <p style={s('margin: 0; font-size: 13.5px; line-height: 1.55; color: #c8c0b6;')}>
                  "The sidebar overlaps the main content on mobile. A flex-direction change in{' '}
                  <span style={s(`color: #e8862e; font-family: ${MONO}; font-size: 12.5px;`)}>Dashboard.module.css:28</span> removed the column stacking."
                </p>
                <div style={s(`margin-top: 12px; padding-top: 12px; border-top: 1px solid #2a1818; font-family: ${MONO}; font-size: 12px; color: #8c847a;`)}>
                  Suggested fix: restore <span style={s('color: #4fb477;')}>flex-direction: column</span> at the &lt; 768px breakpoint.
                </div>
              </div>
              <div style={s('border: 1px solid #1f3a28; background: #0e1410; padding: 20px 22px;')}>
                <div style={s('display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;')}>
                  <span style={s(`font-family: ${MONO}; font-size: 13px; color: #f5f1ea;`)}>✓ /pricing <span style={s('color: #7c746b;')}>@ 1440px</span></span>
                  <span style={s(`font-family: ${MONO}; font-size: 11px; color: #4fb477; border: 1px solid #24472f; padding: 3px 9px;`)}>INTENTIONAL · 91%</span>
                </div>
                <p style={s('margin: 0; font-size: 13.5px; line-height: 1.55; color: #c8c0b6;')}>"New 'Enterprise' pricing tier added. Layout intact, content expanded. Not a regression."</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ FEATURES GRID ============ */}
      <section id="features" style={s('max-width: 1200px; margin: 0 auto; padding: 84px 28px;')}>
        <p style={eyebrow('')}>// EVERYTHING IN THE BOX</p>
        <h2 style={s('font-size: 38px; letter-spacing: -0.03em; font-weight: 700; color: #f5f1ea; margin: 0 0 48px;')}>CLI-first. Zero dashboards required.</h2>
        <div style={s('display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: #211e1b; border: 1px solid #211e1b;')}>
          {features.map((f) => (
            <div key={f.title} className="fg-cmp-row" style={s('background: #0d0c0b; padding: 26px 22px;')}>
              <div style={s(`font-family: ${MONO}; font-size: 11px; color: #e8862e; margin-bottom: 12px;`)}>{f.tag}</div>
              <h3 style={s('font-size: 16.5px; color: #f5f1ea; margin: 0 0 8px; font-weight: 600;')}>{f.title}</h3>
              <p style={s('font-size: 13.5px; line-height: 1.55; color: #8c847a; margin: 0;')}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ CONFIG ============ */}
      <section style={s('border-top: 1px solid #211e1b; background: #100f0e;')}>
        <div style={s('max-width: 1200px; margin: 0 auto; padding: 84px 28px; display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 48px; align-items: center;')}>
          <div>
            <p style={eyebrow('')}>// CONFIGURATION</p>
            <h2 style={s('font-size: 36px; letter-spacing: -0.03em; font-weight: 700; color: #f5f1ea; margin: 0 0 18px;')}>One file. Sensible defaults.</h2>
            <p style={s('font-size: 15.5px; line-height: 1.6; color: #b8b0a6; margin: 0 0 16px;')}>
              Auto-discover routes by crawling, or list them explicitly. Set per-route thresholds — strict on{' '}
              <span style={s(`color: #e8862e; font-family: ${MONO}; font-size: 13px;`)}>/checkout</span>, relaxed on{' '}
              <span style={s(`color: #e8862e; font-family: ${MONO}; font-size: 13px;`)}>/blog</span>.
            </p>
            <p style={s('font-size: 15.5px; line-height: 1.6; color: #b8b0a6; margin: 0;')}>
              <span style={s(`color: #f5f1ea; font-family: ${MONO}; font-size: 13px;`)}>frontguard init</span> auto-detects Next.js, Remix, SvelteKit, Nuxt or Astro and writes this for you.
            </p>
          </div>
          <div style={s('background: #121110; border: 1px solid #2a2622; box-shadow: 0 20px 50px rgba(0,0,0,0.4);')}>
            <div style={s('display: flex; align-items: center; gap: 8px; padding: 11px 16px; border-bottom: 1px solid #211e1b; background: #161412;')}>
              <span style={s('width: 10px; height: 10px; border-radius: 50%; background: #322d28;')} />
              <span style={s('width: 10px; height: 10px; border-radius: 50%; background: #322d28;')} />
              <span style={s('width: 10px; height: 10px; border-radius: 50%; background: #322d28;')} />
              <span style={s(`margin-left: 10px; font-family: ${MONO}; font-size: 12px; color: #564f48;`)}>frontguard.config.ts</span>
            </div>
            <pre style={s(`margin: 0; padding: 20px 22px; font-family: ${MONO}; font-size: 12.5px; line-height: 1.7; color: #b8b0a6; overflow-x: auto;`)} dangerouslySetInnerHTML={{ __html: CONFIG_HTML }} />
          </div>
        </div>
      </section>

      {/* ============ COMPARISON ============ */}
      <section id="compare" style={s('max-width: 1200px; margin: 0 auto; padding: 84px 28px;')}>
        <p style={eyebrow('')}>// HOW IT COMPARES</p>
        <h2 style={s('font-size: 38px; letter-spacing: -0.03em; font-weight: 700; color: #f5f1ea; margin: 0 0 40px;')}>The only one with AI fix verification.</h2>
        <div style={s('border: 1px solid #2a2622; overflow-x: auto;')}>
          <table style={s('width: 100%; border-collapse: collapse; font-size: 13.5px;')}>
            <thead>
              <tr style={s('background: #161412;')}>
                <th style={s(`text-align: left; padding: 16px 18px; font-family: ${MONO}; font-size: 11px; color: #7c746b; font-weight: 500; letter-spacing: 0.04em;`)}>CAPABILITY</th>
                {['Frontguard', 'Percy', 'Chromatic', 'BackstopJS', 'Lost Pixel'].map((h, i) => (
                  <th key={h} style={s(`padding: 16px 14px; font-family: ${MONO}; font-size: 12px; color: ${i === 0 ? '#e8862e' : '#8c847a'}; font-weight: ${i === 0 ? 700 : 500};`)}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.cap} className="fg-cmp-row" style={s('border-top: 1px solid #211e1b;')}>
                  <td style={s('padding: 14px 18px; color: #d8d0c5;')}>{row.cap}</td>
                  <td style={s(`text-align: center; padding: 14px; color: #4fb477; font-family: ${MONO}; font-weight: 700;`)}>{row.fg}</td>
                  <td style={s(`text-align: center; padding: 14px; color: #6b645c; font-family: ${MONO};`)}>{row.percy}</td>
                  <td style={s(`text-align: center; padding: 14px; color: #6b645c; font-family: ${MONO};`)}>{row.chromatic}</td>
                  <td style={s(`text-align: center; padding: 14px; color: #6b645c; font-family: ${MONO};`)}>{row.backstop}</td>
                  <td style={s(`text-align: center; padding: 14px; color: #6b645c; font-family: ${MONO};`)}>{row.lostpixel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ============ PLUGINS ============ */}
      <section style={s('max-width: 1200px; margin: 0 auto; padding: 20px 28px 84px;')}>
        <div style={s('border: 1px solid #2a2622; background: #131210; padding: 36px 32px;')}>
          <div style={s('display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 28px;')}>
            <h3 style={s('font-size: 22px; color: #f5f1ea; margin: 0; font-weight: 600; letter-spacing: -0.01em;')}>Extensible by design — 5 built-in plugins, 6 lifecycle hooks</h3>
            <code style={s(`font-family: ${MONO}; font-size: 12px; color: #8c847a;`)}>beforeDiscover · afterDiscover · afterRender · afterCompare · afterRun · onError</code>
          </div>
          <div style={s('display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px;')}>
            {plugins.map((p) => (
              <div key={p.name} style={s('border-top: 2px solid #e8862e; padding-top: 14px;')}>
                <div style={s(`font-family: ${MONO}; font-size: 13px; color: #f5f1ea; margin-bottom: 6px; font-weight: 500;`)}>{p.name}</div>
                <div style={s('font-size: 12.5px; line-height: 1.5; color: #8c847a;')}>{p.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ HONEST ============ */}
      <section style={s('max-width: 1200px; margin: 0 auto; padding: 20px 28px 84px;')}>
        <p style={eyebrow('')}>// NO MAGIC, JUST HONEST</p>
        <h2 style={s('font-size: 38px; letter-spacing: -0.03em; font-weight: 700; color: #f5f1ea; margin: 0 0 14px;')}>We'll tell you what it isn't.</h2>
        <p style={s('font-size: 16px; color: #b8b0a6; margin: 0 0 44px; max-width: 600px;')}>Skeptical engineers built this for skeptical engineers. No silver bullets — here's exactly where the edges are.</p>
        <div style={s('display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;')}>
          {honest.map((h) => (
            <div key={h.label} className="fg-card-hover" style={s('border: 1px solid #2a2622; background: #131210; padding: 28px 24px;')}>
              <div style={s(`font-family: ${MONO}; font-size: 12px; color: ${h.color}; margin-bottom: 16px;`)}>{h.label}</div>
              <p style={s('font-size: 14.5px; line-height: 1.6; color: #b8b0a6; margin: 0;')}>{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section style={s('border-top: 1px solid #211e1b; background: #100f0e;')}>
        <div style={s('max-width: 1200px; margin: 0 auto; padding: 90px 28px; text-align: center;')}>
          <span style={s('display: inline-block; margin-bottom: 28px;')}>
            <Shield w={44} h={52} notch="#100f0e" line={2.5} />
          </span>
          <h2 style={s('font-size: 44px; letter-spacing: -0.035em; font-weight: 700; color: #f5f1ea; margin: 0 0 16px;')}>Ship with confidence.</h2>
          <p style={s('font-size: 17px; color: #b8b0a6; margin: 0 auto 34px; max-width: 480px; line-height: 1.55;')}>Free forever. No per-screenshot pricing cliff, no dashboard lock-in. Install it and run your first check in two minutes.</p>
          <div style={s('display: inline-flex; align-items: stretch; border: 1px solid #322d28; background: #161412; margin-bottom: 24px;')}>
            <span style={s(`font-family: ${MONO}; font-size: 14px; color: #e6e0d6; padding: 14px 20px; white-space: nowrap;`)}>
              <span style={s('color: #7c746b;')}>$ </span>npx frontguard init --ci
            </span>
            <button onClick={() => copyInit('npx frontguard init --ci')} className="fg-btn-ghost" style={s(`font-family: ${MONO}; font-size: 12px; color: #b8b0a6; background: #1f1c19; border: none; border-left: 1px solid #322d28; padding: 0 18px; cursor: pointer;`)}>
              {initLabel}
            </button>
          </div>
          <div style={s('display: flex; gap: 14px; justify-content: center;')}>
            <Link to="/docs" className="fg-btn-primary" style={s(`background: #e8862e; color: #0d0c0b; font-family: ${MONO}; font-weight: 700; font-size: 14px; padding: 14px 28px; text-decoration: none;`)}>Read the docs →</Link>
            <a href="https://github.com/ravidsrk/frontguard" className="fg-btn-ghost" style={s(`border: 1px solid #322d28; color: #f5f1ea; font-family: ${MONO}; font-weight: 500; font-size: 14px; padding: 14px 28px; text-decoration: none;`)}>★ Star on GitHub</a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
