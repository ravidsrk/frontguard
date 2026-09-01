/* eslint-disable */
// Docs article content. Each article body is authored as the exact inline-styled
// markup from the source design and rendered via dangerouslySetInnerHTML, so the
// docs read identically to the rest of the site while the chrome (sidebar, TOC,
// prev/next) stays in React. Edit an article by editing its `html` string.

export type Article = {
  id: string
  label: string
  section: string
  toc: string[]
  html: string
}

const code = (label: string, body: string) => `
  <div style="background: #121110; border: 1px solid #2a2622; margin-bottom: 30px;">
    <div style="border-bottom: 1px solid #211e1b; background: #161412; padding: 9px 16px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #564f48;">${label}</div>
    <pre style="margin: 0; padding: 18px 20px; font-family: 'JetBrains Mono', monospace; font-size: 13px; line-height: 1.85; color: #d8d0c5; overflow-x: auto;">${body}</pre>
  </div>`

const h1 = (t: string) =>
  `<h1 style="font-size: 42px; letter-spacing: -0.035em; font-weight: 700; color: #f5f1ea; margin: 0 0 18px; line-height: 1.05;">${t}</h1>`
const h2 = (t: string) =>
  `<h2 style="font-size: 26px; letter-spacing: -0.02em; font-weight: 600; color: #f5f1ea; margin: 0 0 16px;">${t}</h2>`
const h2b = (t: string) =>
  `<h2 style="font-size: 24px; letter-spacing: -0.02em; font-weight: 600; color: #f5f1ea; margin: 0 0 14px;">${t}</h2>`
const lead = (t: string) =>
  `<p style="font-size: 17px; line-height: 1.65; color: #c8c0b6; margin: 0 0 30px;">${t}</p>`
const p = (t: string) =>
  `<p style="font-size: 16px; line-height: 1.65; color: #c8c0b6; margin: 0 0 18px;">${t}</p>`
const ic = (t: string) =>
  `<code style="font-family: 'JetBrains Mono', monospace; font-size: 14px; color: #e8862e; background: #1a130b; padding: 2px 6px;">${t}</code>`
const callout = (label: string, body: string) => `
  <div style="border: 1px solid #3a2a18; background: #1a130b; padding: 18px 20px; margin-bottom: 40px; display: flex; gap: 14px;">
    <span style="font-family: 'JetBrains Mono', monospace; color: #e8862e; font-size: 15px;">▍</span>
    <div>
      ${label ? `<div style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #e8862e; margin-bottom: 5px; letter-spacing: 0.03em;">${label}</div>` : ''}
      <p style="margin: 0; font-size: 14px; line-height: 1.55; color: #c8c0b6;">${body}</p>
    </div>
  </div>`

// rows: [col1, col2, ...] cells already styled by header template
const table2 = (rows: [string, string][]) => `
  <div style="border: 1px solid #2a2622; margin-bottom: 40px;">
    ${rows
      .map(
        ([a, b]) => `<div style="display: grid; grid-template-columns: 280px 1fr; gap: 18px; padding: 14px 20px; border-bottom: 1px solid #211e1b; align-items: baseline;">
      <code style="font-family: 'JetBrains Mono', monospace; font-size: 12.5px; color: #e8862e;">${a}</code>
      <span style="font-size: 13.5px; color: #b8b0a6; line-height: 1.5;">${b}</span>
    </div>`,
      )
      .join('')}
  </div>`

const stageRow = (num: string, title: string, desc: string) =>
  `<div style="background: #0d0c0b; padding: 16px 20px; display: grid; grid-template-columns: 70px 120px 1fr; gap: 18px; align-items: center;">
    <span style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #564f48;">${num}</span>
    <span style="font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #e8862e; font-weight: 500;">${title}</span>
    <span style="font-size: 14px; color: #b8b0a6; line-height: 1.5;">${desc}</span>
  </div>`

const C = { g: '#98c379', k: '#c678dd', cm: '#564f48', n: '#e8862e', y: '#5b8def' }

/* ---------------- INTRODUCTION ---------------- */
const introHtml = `
${h1('Introduction')}
<p style="font-size: 17px; line-height: 1.65; color: #c8c0b6; margin: 0 0 18px;">Frontguard is an MIT-licensed visual regression CLI. It renders configured pages, compares screenshots against reviewed baselines, and can optionally ask your selected AI provider for a confidence-scored classification and explanation.</p>
<p style="font-size: 17px; line-height: 1.65; color: #c8c0b6; margin: 0 0 18px;">The deterministic path is local pixel comparison with inspectable image and HTML artifacts. Model output is optional assistance, not an autonomous approval.</p>
<p style="font-size: 17px; line-height: 1.65; color: #c8c0b6; margin: 0 0 34px;">The CLI runs without a Frontguard account. Hosted cloud, MCP, GitHub App, and Docker Compose onboarding remain pre-release.</p>
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 40px;">
  <div style="border: 1px solid #2a2622; background: #131210; padding: 22px;">
    <div style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #4fb477; margin-bottom: 10px;">DETECT</div>
    <p style="margin: 0; font-size: 14px; line-height: 1.55; color: #b8b0a6;">Pixel comparison across configured viewports and browsers, with masks, thresholds, and configurable multi-render consensus.</p>
  </div>
  <div style="border: 1px solid #2a2622; background: #131210; padding: 22px;">
    <div style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #e8862e; margin-bottom: 10px;">UNDERSTAND</div>
    <p style="margin: 0; font-size: 14px; line-height: 1.55; color: #b8b0a6;">Optional model-assisted analysis classifies changed screenshots and returns an explanation for human review.</p>
  </div>
</div>
${callout('PREREQUISITES', 'Node.js 20+ and npm 9+. AI analysis is optional; pixel comparison runs locally without a key.')}
${h2('The pipeline')}
<p style="font-size: 16px; line-height: 1.65; color: #c8c0b6; margin: 0 0 22px;">Frontguard runs a six-stage pipeline. One page failing does not stop the remaining comparisons. AI runs only for changed screenshots when a provider is configured.</p>
<div style="display: grid; gap: 1px; background: #211e1b; border: 1px solid #211e1b; margin-bottom: 40px;">
  ${stageRow('01', 'Discover', 'Crawl, filesystem scan, or config — finds every route automatically.')}
  ${stageRow('02', 'Filter', 'Dependency graph renders only pages affected by your changed files.')}
  ${stageRow('03', 'Render', 'Playwright captures each route × viewport × browser, with configurable consensus.')}
  ${stageRow('04', 'Diff', 'Pixel comparison with an SSIM fallback.')}
  ${stageRow('05', 'Analyze', 'Optional BYOK analysis classifies, explains, and scores confidence.')}
  ${stageRow('06', 'Report', 'Console, JSON, and HTML artifacts with visual evidence.')}
</div>`

/* ---------------- INSTALLATION ---------------- */
const installHtml = `
${h1('Installation')}
${lead(`Install the CLI from npm, then initialize a config. The ${ic('--ci')} flag also scaffolds a GitHub Actions workflow.`)}
${h2b('Install the CLI')}
${code(
  'terminal',
  `<span style="color: #564f48;"># install the CLI</span>
<span style="color: #7c746b;">$</span> npm install @frontguard/cli

<span style="color: #564f48;"># initialize config (auto-detects your framework, --ci adds a GitHub Action)</span>
<span style="color: #7c746b;">$</span> npx -p @frontguard/cli frontguard init --ci

<span style="color: #564f48;"># verify your environment is ready</span>
<span style="color: #7c746b;">$</span> npx -p @frontguard/cli frontguard doctor`,
)}
${h2b('Framework detection')}
${p(`${ic('frontguard init')} auto-detects your framework and writes sensible defaults — including a filesystem route source where one exists.`)}
<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 40px;">
  ${['Next.js', 'Remix', 'SvelteKit', 'Nuxt', 'Astro']
    .map(
      (fw) =>
        `<span style="font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #d8d0c5; border: 1px solid #2a2622; background: #131210; padding: 8px 14px;">${fw}</span>`,
    )
    .join('')}
</div>
${h2b('Environment variables')}
${table2([
  ['FRONTGUARD_OPENAI_KEY', 'OpenAI API key for AI analysis (optional).'],
  ['FRONTGUARD_ANTHROPIC_KEY', 'Anthropic API key for AI analysis (alternative).'],
  ['GITHUB_TOKEN', 'Used by the source PR reporter; public Action behavior still needs external validation.'],
  ['FRONTGUARD_DEBUG', 'Set to 1 for full stack traces on errors.'],
])}`

/* ---------------- QUICK START ---------------- */
const quickStep = (n: string, title: string, desc: string, cmd: string) =>
  `<div style="background: #0d0c0b; padding: 20px 22px; display: grid; grid-template-columns: 40px 1fr; gap: 18px; align-items: start;">
    <span style="font-family: 'JetBrains Mono', monospace; font-size: 18px; color: #e8862e; font-weight: 700;">${n}</span>
    <div>
      <div style="font-size: 16px; color: #f5f1ea; font-weight: 600; margin-bottom: 6px;">${title}</div>
      <p style="font-size: 14px; line-height: 1.55; color: #b8b0a6; margin: 0 0 10px;">${desc}</p>
      <code style="display: block; font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #d8d0c5; background: #131210; border: 1px solid #2a2622; padding: 10px 14px;"><span style="color: #7c746b;">$ </span>${cmd}</code>
    </div>
  </div>`
const statusCard = (glyph: string, hex: string, label: string, desc: string) =>
  `<div style="border: 1px solid #2a2622; background: #131210; padding: 14px 18px; display: flex; align-items: center; gap: 14px;">
    <span style="font-family: 'JetBrains Mono', monospace; font-size: 18px; color: ${hex};">${glyph}</span>
    <div><span style="font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #f5f1ea;">${label}</span><span style="font-size: 13px; color: #8c847a;"> — ${desc}</span></div>
  </div>`
const quickHtml = `
${h1('Quick start')}
${lead('Start the app, review and accept initial captures explicitly, then run comparisons against them.')}
<div style="display: grid; gap: 1px; background: #211e1b; border: 1px solid #211e1b; margin-bottom: 30px;">
  ${quickStep('1', 'Initialize', 'Auto-detect your framework and scaffold a config (plus a GitHub Action with --ci).', 'npx -p @frontguard/cli frontguard init --ci')}
  ${quickStep('2', 'Start the app', 'In a separate app terminal, use the project’s dev-server command (npm run dev is one example), leave it running, and wait for the configured baseUrl.', 'npm run dev')}
  ${quickStep('3', 'Check your environment', 'In a Frontguard terminal, verify Node, Playwright, browsers and git.', 'npx -p @frontguard/cli frontguard doctor')}
  ${quickStep('4', 'Accept initial captures', 'Review the app, then explicitly accept its screenshots.', 'npx -p @frontguard/cli frontguard update-baselines')}
  ${quickStep('5', 'Publish baselines', 'Push the orphan branch before CI comparisons.', 'git push origin frontguard-baselines')}
  ${quickStep('6', 'Run comparisons', 'Later runs use the generated config and report changes without modifying accepted baselines.', 'npx -p @frontguard/cli frontguard run')}
</div>
<h2 style="font-size: 24px; letter-spacing: -0.02em; font-weight: 600; color: #f5f1ea; margin: 40px 0 16px;">Reading the output</h2>
${p('Every route × viewport gets a status. Regressions and unaccepted new screenshots exit 1; no comparisons or a tool error exit 2.')}
<div style="background: #121110; border: 1px solid #2a2622; margin-bottom: 24px;">
  <div style="border-bottom: 1px solid #211e1b; background: #161412; padding: 9px 16px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #564f48;">frontguard run</div>
  <pre style="margin: 0; padding: 18px 20px; font-family: 'JetBrains Mono', monospace; font-size: 13px; line-height: 1.85; color: #b8b0a6; overflow-x: auto;"><span style="color: #4fb477;">  ✓ /</span>           375 768 1440  <span style="color: #4fb477;">PASS</span>
<span style="color: #4fb477;">  ✓ /pricing</span>    375 768 1440  <span style="color: #4fb477;">PASS</span>
<span style="color: #e8862e;">  ⚠ /checkout</span>   375 768 1440  <span style="color: #e8862e;">WARNING</span>
<span style="color: #e5484d;">  ✘ /dashboard</span>  375 768 1440  <span style="color: #e5484d;">REGRESSION</span>
<span style="color: #5b8def;">  ★ /settings</span>   375 768 1440  <span style="color: #5b8def;">NEW</span>

<span style="color: #e5484d;">1 regression</span> · <span style="color: #e8862e;">1 warning</span> · <span style="color: #4fb477;">9 passed</span> · <span style="color: #5b8def;">1 new</span></pre>
</div>
<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 40px;">
  ${statusCard('✓', '#4fb477', 'PASS', 'within threshold')}
  ${statusCard('⚠', '#e8862e', 'WARNING', 'minor diff')}
  ${statusCard('✘', '#e5484d', 'REGRESSION', 'exceeds threshold')}
  ${statusCard('★', '#5b8def', 'NEW', 'no baseline yet')}
</div>`

/* ---------------- CLI COMMANDS ---------------- */
const flagRow = (flag: string, desc: string, def: string) =>
  `<div style="display: grid; grid-template-columns: 220px 1fr 110px; gap: 14px; padding: 12px 20px; border-bottom: 1px solid #211e1b; align-items: baseline;">
    <code style="font-family: 'JetBrains Mono', monospace; font-size: 12.5px; color: #e8862e;">${flag}</code>
    <span style="font-size: 13.5px; color: #b8b0a6; line-height: 1.5;">${desc}</span>
    <code style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #8c847a;">${def}</code>
  </div>`
const cliHtml = `
${h1('CLI Commands')}
${lead(`Frontguard provides ${ic('run')}, ${ic('init')}, ${ic('doctor')}, ${ic('monitor')}, ${ic('update-baselines')}, the fix-pattern commands, and the ${ic('plugin')} subcommands.`)}
<div style="border: 1px solid #2a2622; margin-bottom: 36px;">
  ${[
    ['frontguard run', 'Run the visual regression pipeline (default command).'],
    ['frontguard init [--ci]', 'Detect framework and scaffold config (and a GitHub Action).'],
    ['frontguard doctor', 'Diagnose environment readiness before a run.'],
    ['frontguard monitor', 'Run visual checks against live production URLs.'],
    ['frontguard update-baselines', 'Accept the current screenshots as new baselines.'],
    ['frontguard plugin &lt;cmd&gt;', 'install · uninstall · list plugins from npm.'],
  ]
    .map(
      ([a, b]) => `<div style="display: grid; grid-template-columns: 270px 1fr; gap: 18px; padding: 15px 20px; border-bottom: 1px solid #211e1b; align-items: baseline;">
    <code style="font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #e8862e;">${a}</code>
    <span style="font-size: 14px; color: #b8b0a6; line-height: 1.5;">${b}</span>
  </div>`,
    )
    .join('')}
</div>
${h2('frontguard run')}
${p('The default command. Runs the full discover → render → diff → analyze → report pipeline.')}
<div style="border: 1px solid #2a2622; margin-bottom: 24px;">
  <div style="display: grid; grid-template-columns: 220px 1fr 110px; gap: 14px; padding: 12px 20px; background: #161412; border-bottom: 1px solid #211e1b; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #564f48; letter-spacing: 0.04em;">
    <span>FLAG</span><span>DESCRIPTION</span><span>DEFAULT</span>
  </div>
  ${flagRow('-u, --url &lt;url&gt;', 'Base URL to test', 'config')}
  ${flagRow('-r, --routes', 'Comma-separated routes to test', 'auto')}
  ${flagRow('-v, --viewports', 'Comma-separated viewport widths', '375,768,1440')}
  ${flagRow('-b, --browsers', 'chromium, firefox, webkit', 'chromium')}
  ${flagRow('-o, --output', 'Output format: console, json', 'console')}
  ${flagRow('-t, --threshold &lt;ratio&gt;', 'Changed-pixel ratio (0–1; 0.01 = 1%)', '0.1')}
</div>
<h3 style="font-size: 17px; font-weight: 600; color: #f5f1ea; margin: 28px 0 12px;">Exit codes</h3>
<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 36px;">
  <div style="border: 1px solid #1f3a28; background: #0e1410; padding: 16px;"><code style="font-family: 'JetBrains Mono', monospace; font-size: 18px; color: #4fb477;">0</code><p style="margin: 8px 0 0; font-size: 13px; color: #8c847a; line-height: 1.5;">All passed or warnings only</p></div>
  <div style="border: 1px solid #3a1f1f; background: #170f0e; padding: 16px;"><code style="font-family: 'JetBrains Mono', monospace; font-size: 18px; color: #e5484d;">1</code><p style="margin: 8px 0 0; font-size: 13px; color: #8c847a; line-height: 1.5;">Regressions or unaccepted new screenshots</p></div>
  <div style="border: 1px solid #2a2622; background: #131210; padding: 16px;"><code style="font-family: 'JetBrains Mono', monospace; font-size: 18px; color: #e8862e;">2</code><p style="margin: 8px 0 0; font-size: 13px; color: #8c847a; line-height: 1.5;">No comparisons or any tool error</p></div>
</div>
${h2('frontguard monitor')}
${p('Runs visual checks against live production URLs instead of a local dev server. Supports one-off checks, daemon polling, and webhook alerts.')}
${code(
  'terminal',
  `<span style="color: #564f48;"># one-off check</span>
<span style="color: #7c746b;">$</span> frontguard monitor --url https://example.com --threshold 0.02

<span style="color: #564f48;"># daemon mode — check every 15 minutes, alert Slack</span>
<span style="color: #7c746b;">$</span> frontguard monitor --url https://example.com --interval 15 --webhook \$SLACK_WEBHOOK`,
)}`

/* ---------------- CONFIGURATION ---------------- */
const configHtml = `
${h1('Configuration')}
${lead(`Frontguard is configured via ${ic('frontguard.config.ts')} in your project root. Run ${ic('frontguard init')} to generate a starter.`)}
<div style="background: #121110; border: 1px solid #2a2622; margin-bottom: 40px;">
  <div style="border-bottom: 1px solid #211e1b; background: #161412; padding: 9px 16px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #564f48;">frontguard.config.ts</div>
  <pre style="margin: 0; padding: 18px 20px; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 1.8; color: #b8b0a6; overflow-x: auto;"><span style="color: ${C.k};">export default</span> {
  version: <span style="color: ${C.n};">1</span>,
  baseUrl: <span style="color: ${C.g};">'http://localhost:3000'</span>,

  <span style="color: ${C.cm};">// auto-discover routes (zero config)</span>
  discover: { startUrl: <span style="color: ${C.g};">'/'</span>, maxDepth: <span style="color: ${C.n};">3</span>, exclude: [<span style="color: ${C.g};">'/admin/*'</span>] },

  viewports: [<span style="color: ${C.n};">375</span>, <span style="color: ${C.n};">768</span>, <span style="color: ${C.n};">1440</span>],
  browsers: [<span style="color: ${C.g};">'chromium'</span>],
  threshold: <span style="color: ${C.n};">0.1</span>, <span style="color: ${C.cm};">// 10% changed pixels</span>

  <span style="color: ${C.cm};">// AI analysis (optional, BYOK)</span>
  ai: { provider: <span style="color: ${C.g};">'openai'</span>, model: <span style="color: ${C.g};">'gpt-4o'</span> },

  <span style="color: ${C.cm};">// anti-flake</span>
  antiFlakeRenders: <span style="color: ${C.n};">2</span>,
  freezeTime: <span style="color: ${C.k};">true</span>,

  ignore: [{ selector: <span style="color: ${C.g};">'.dynamic-timestamp'</span> }],
};</pre>
</div>
${h2b('Core options')}
<div style="border: 1px solid #2a2622; margin-bottom: 36px;">
  <div style="display: grid; grid-template-columns: 150px 1fr 110px; gap: 14px; padding: 12px 20px; background: #161412; border-bottom: 1px solid #211e1b; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #564f48; letter-spacing: 0.04em;"><span>OPTION</span><span>DESCRIPTION</span><span>DEFAULT</span></div>
  ${[
    ['baseUrl', 'Required. Base URL of the app under test', '—'],
    ['routes', 'Explicit routes — strings or per-route objects', '—'],
    ['discover', 'Auto-discovery configuration', '—'],
    ['viewports', 'Viewport widths in pixels', '[375,768,1440]'],
    ['browsers', 'chromium · firefox · webkit', "['chromium']"],
    ['threshold', 'Max allowed pixel diff as a fraction', '0.1'],
  ]
    .map(
      ([a, b, c]) => `<div style="display: grid; grid-template-columns: 150px 1fr 110px; gap: 14px; padding: 12px 20px; border-bottom: 1px solid #211e1b; align-items: baseline;">
    <code style="font-family: 'JetBrains Mono', monospace; font-size: 12.5px; color: #e8862e;">${a}</code>
    <span style="font-size: 13.5px; color: #b8b0a6; line-height: 1.5;">${b}</span>
    <code style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #8c847a;">${c}</code>
  </div>`,
    )
    .join('')}
</div>
${h2b('Per-route overrides')}
${p(`Different pages need different sensitivity. Any entry in ${ic('routes')} can be an object instead of a plain string.`)}
<div style="background: #121110; border: 1px solid #2a2622; margin-bottom: 36px;">
  <pre style="margin: 0; padding: 18px 20px; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 1.8; color: #b8b0a6; overflow-x: auto;">routes: [
  <span style="color: ${C.g};">'/'</span>,                                          <span style="color: ${C.cm};">// global threshold</span>
  { path: <span style="color: ${C.g};">'/checkout'</span>, threshold: <span style="color: ${C.n};">0.001</span> },      <span style="color: ${C.cm};">// strict — 0.1%</span>
  { path: <span style="color: ${C.g};">'/blog/*'</span>, threshold: <span style="color: ${C.n};">0.05</span> },         <span style="color: ${C.cm};">// lenient — 5%</span>
  { path: <span style="color: ${C.g};">'/gallery'</span>, viewport: [<span style="color: ${C.n};">1440</span>] },       <span style="color: ${C.cm};">// desktop only</span>
]</pre>
</div>
${h2b('Anti-flake options')}
${table2([
  ['antiFlakeRenders', 'Renders per page for flake detection (recommended: 2–3).'],
  ['freezeTime', 'Freeze Date.now() during render to stabilize timestamps.'],
  ['ssimFallback', 'Use SSIM perceptual diff for borderline results.'],
  ['renderRetries', 'Per-page retry count on render failure.'],
])}
${callout('', `Set <code style="font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #e8862e;">antiFlakeRenders: 2</code> to capture each page twice. If both renders differ from the baseline the diff is real; if only one does, it's a flake and gets ignored.`)}`

/* ---------------- PLAYWRIGHT ---------------- */
const playwrightHtml = `
${h1('Playwright plugin')}
${lead(`Already have a Playwright suite? Drop visual assertions straight into your existing tests with ${ic('@frontguard/playwright')} — no separate run, baselines managed for you.`)}
${code(
  'tests/visual.spec.ts',
  `<span style="color: ${C.k};">import</span> { visualTest } <span style="color: ${C.k};">from</span> <span style="color: ${C.g};">'@frontguard/playwright'</span>;

test(<span style="color: ${C.g};">'checkout page'</span>, <span style="color: ${C.k};">async</span> ({ page }) => {
  <span style="color: ${C.k};">await</span> page.goto(<span style="color: ${C.g};">'/checkout'</span>);

  <span style="color: ${C.cm};">// capture + diff against baseline, with AI analysis</span>
  <span style="color: ${C.k};">const</span> result = <span style="color: ${C.k};">await</span> visualTest(page, <span style="color: ${C.g};">'checkout'</span>, {
    ai: { provider: <span style="color: ${C.g};">'openai'</span>, model: <span style="color: ${C.g};">'gpt-4o'</span> },
  });

  expect(result.passed).toBe(<span style="color: ${C.k};">true</span>);
});`,
)}
${p(`Or enable AI with defaults — ${ic('ai: true')} uses OpenAI. Update baselines by setting ${ic('FRONTGUARD_UPDATE=1')}.`)}
${callout('', "The plugin reuses your test's already-rendered page — no second browser launch — so it adds visual coverage with almost no extra runtime.")}`

/* ---------------- GITHUB ACTIONS ---------------- */
const cicdHtml = `
${h1('GitHub Actions')}
${lead('The repository includes a pre-release GitHub Action manifest that auto-detects common preview URLs, runs the pipeline, and uploads the HTML report. The public v0 consumer path and source PR reporter still require external release validation.')}
${h2b('Quick setup')}
<div style="background: #121110; border: 1px solid #2a2622; margin-bottom: 34px;">
  <div style="border-bottom: 1px solid #211e1b; background: #161412; padding: 9px 16px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #564f48;">.github/workflows/visual-regression.yml</div>
  <pre style="margin: 0; padding: 18px 20px; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 1.8; color: #b8b0a6; overflow-x: auto;"><span style="color: ${C.y};">name</span>: Visual Regression Tests
<span style="color: ${C.y};">on</span>:
  <span style="color: ${C.y};">pull_request</span>:
    <span style="color: ${C.y};">branches</span>: [main]

<span style="color: ${C.y};">jobs</span>:
  <span style="color: ${C.y};">visual-test</span>:
    <span style="color: ${C.y};">runs-on</span>: ubuntu-latest
    <span style="color: ${C.y};">steps</span>:
      - <span style="color: ${C.y};">uses</span>: actions/checkout@v4
      - <span style="color: ${C.y};">name</span>: Run Frontguard
        <span style="color: ${C.y};">uses</span>: ravidsrk/frontguard@v0
        <span style="color: ${C.y};">with</span>:
          <span style="color: ${C.y};">url</span>: <span style="color: ${C.g};">\${{ env.PREVIEW_URL }}</span>  <span style="color: ${C.cm};"># or let it auto-detect</span>
        <span style="color: ${C.y};">env</span>:
          <span style="color: ${C.y};">FRONTGUARD_OPENAI_KEY</span>: <span style="color: ${C.g};">\${{ secrets.FRONTGUARD_OPENAI_KEY }}</span></pre>
</div>
${h2b('Action inputs')}
<div style="border: 1px solid #2a2622; margin-bottom: 36px;">
  <div style="display: grid; grid-template-columns: 170px 110px 1fr; gap: 14px; padding: 12px 20px; background: #161412; border-bottom: 1px solid #211e1b; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #564f48; letter-spacing: 0.04em;"><span>INPUT</span><span>REQUIRED</span><span>DESCRIPTION</span></div>
  ${[
    ['url', 'No', 'Base URL to test (auto-detected from preview deploys if omitted).'],
    ['routes', 'No', 'Comma-separated routes (auto-discovered by default).'],
    ['viewports', 'No', 'Comma-separated viewport widths. Default 375,768,1440.'],
    ['browsers', 'No', 'Comma-separated browsers. Default chromium.'],
    ['threshold', 'No', 'Changed-pixel ratio (0–1; 0.01 = 1%). Uses config or 0.1 when omitted.'],
    ['config', 'No', 'Path to frontguard.config.ts.'],
    ['update-baselines', 'No', 'Accept current as new baselines. Default false.'],
    ['github-token', 'No', 'GitHub token for PR comments. Defaults to github.token.'],
  ]
    .map(
      ([a, b, c]) => `<div style="display: grid; grid-template-columns: 170px 110px 1fr; gap: 14px; padding: 12px 20px; border-bottom: 1px solid #211e1b; align-items: baseline;">
    <code style="font-family: 'JetBrains Mono', monospace; font-size: 12.5px; color: #e8862e;">${a}</code>
    <span style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #8c847a;">${b}</span>
    <span style="font-size: 13.5px; color: #b8b0a6; line-height: 1.5;">${c}</span>
  </div>`,
    )
    .join('')}
</div>
${h2b('What the action does')}
<div style="display: grid; gap: 1px; background: #211e1b; border: 1px solid #211e1b; margin-bottom: 40px;">
  ${[
    ['1', 'Setup Node.js 20.'],
    ['2', 'Install the exact Frontguard CLI version bundled by the Action.'],
    ['3', 'Install browsers through the exact CLI package version bundled by the Action.'],
    ['4', 'Detect preview URL from Vercel, Netlify, Cloudflare, Railway, Render.'],
    ['5', 'Run the full pipeline with your configuration.'],
    ['6', 'Upload the HTML report as a build artifact.'],
  ]
    .map(
      ([n, d]) => `<div style="background: #0d0c0b; padding: 14px 20px; display: grid; grid-template-columns: 40px 1fr; gap: 16px; align-items: center;">
    <span style="font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #e8862e;">${n}</span>
    <span style="font-size: 14px; color: #b8b0a6; line-height: 1.5;">${d}</span>
  </div>`,
    )
    .join('')}
</div>`

/* ---------------- AI ANALYSIS ---------------- */
const aiAnalysisHtml = `
${h1('AI Analysis')}
${lead(`Frontguard's AI analysis goes beyond "pixels differ" — it explains <strong style="color: #f5f1ea; font-weight: 600;">why</strong> a change happened, classifies it, and suggests fixes. Instead of a red-highlighted diff, you get a human-readable explanation.`)}
${h2b('Classification')}
<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 32px;">
  <div style="border: 1px solid #3a1f1f; background: #170f0e; padding: 18px;"><div style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #e5484d; margin-bottom: 8px;">regression</div><p style="margin: 0; font-size: 13.5px; color: #b8b0a6; line-height: 1.5;">Unintentional visual break — something is wrong.</p></div>
  <div style="border: 1px solid #1f3a28; background: #0e1410; padding: 18px;"><div style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #4fb477; margin-bottom: 8px;">intentional</div><p style="margin: 0; font-size: 13.5px; color: #b8b0a6; line-height: 1.5;">Deliberate design change — looks correct.</p></div>
  <div style="border: 1px solid #2a2622; background: #131210; padding: 18px;"><div style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #5b8def; margin-bottom: 8px;">content_update</div><p style="margin: 0; font-size: 13.5px; color: #b8b0a6; line-height: 1.5;">Dynamic content changed (text, images) — not a code issue.</p></div>
</div>
${p('An intentional classification at 0.8 confidence or higher automatically downgrades a regression to a warning. Inspect the model output before relying on that CI result.')}
${h2b('Supported providers')}
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 32px;">
  <div style="border: 1px solid #2a2622; background: #131210; padding: 20px 22px;">
    <div style="font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #f5f1ea; margin-bottom: 12px;">OpenAI</div>
    <code style="display: block; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #d8d0c5; margin-bottom: 14px;"><span style="color: #7c746b;">export </span>FRONTGUARD_OPENAI_KEY=sk-…</code>
    <div style="font-size: 13px; color: #8c847a; line-height: 1.7;">Select the model explicitly in configuration; Frontguard has not published a comparative accuracy benchmark.</div>
  </div>
  <div style="border: 1px solid #2a2622; background: #131210; padding: 20px 22px;">
    <div style="font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #f5f1ea; margin-bottom: 12px;">Anthropic</div>
    <code style="display: block; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #d8d0c5; margin-bottom: 14px;"><span style="color: #7c746b;">export </span>FRONTGUARD_ANTHROPIC_KEY=sk-ant-…</code>
    <div style="font-size: 13px; color: #8c847a; line-height: 1.7;">Select the model explicitly in configuration; Frontguard has not published a comparative accuracy benchmark.</div>
  </div>
</div>
${h2b('Cost controls')}
${p('AI is optional and runs only on detected changes. Frontguard has not published a measured percentage of pages that avoid the provider call.')}
<ul style="list-style: none; padding: 0; margin: 0 0 32px; display: grid; gap: 12px;">
  ${[
    'Use a cheap model (gpt-4o-mini / haiku) for triage, full models for PR-blocking checks',
    'Limit AI to the primary viewport if cost is a concern',
    'Screenshots are downscaled to ≤800px before the API call',
  ]
    .map(
      (li) =>
        `<li style="display: flex; gap: 12px; font-size: 14.5px; color: #c8c0b6; line-height: 1.5;"><span style="color: #4fb477; font-family: 'JetBrains Mono', monospace;">✓</span>${li}</li>`,
    )
    .join('')}
</ul>
${callout('BYOK — BRING YOUR OWN KEY', 'Frontguard never stores, proxies, or logs your API keys. They\'re read from env vars at runtime, passed directly to provider SDKs, and redacted from all output.')}`

/* ---------------- AI FIXES ---------------- */
const aiFixesHtml = `
${h1('AI Fixes &amp; the fix-pattern database')}
${lead(`CSS suggestion generation and sandbox verification are experimental, separate opt-ins. Unverified suggestions remain labeled, and a verification result is not a correctness guarantee.`)}
${h2b('Verifying fixes in a sandbox')}
${p(`A suggested fix is only useful if it works. With ${ic('verifyFixes: true')}, Frontguard applies the patch, re-renders, and re-compares:`)}
<div style="display: grid; gap: 1px; background: #211e1b; border: 1px solid #211e1b; margin-bottom: 30px;">
  ${[
    ['1', 'Apply the generated CSS patch in a sandbox.'],
    ['2', 'Re-render the page with the patch injected.'],
    ['3', 'Re-compare the result against the baseline.'],
    ['4', 'Mark ✅ Verified if within threshold, ⚠️ Unverified otherwise.'],
  ]
    .map(
      ([n, d]) => `<div style="background: #0d0c0b; padding: 14px 20px; display: grid; grid-template-columns: 36px 1fr; gap: 16px; align-items: center;">
    <span style="font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #e8862e;">${n}</span>
    <span style="font-size: 14px; color: #b8b0a6; line-height: 1.5;">${d}</span>
  </div>`,
    )
    .join('')}
</div>
<div style="background: #121110; border: 1px solid #2a2622; margin-bottom: 36px;">
  <div style="border-bottom: 1px solid #211e1b; background: #161412; padding: 9px 16px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #564f48;">frontguard.config.ts</div>
  <pre style="margin: 0; padding: 18px 20px; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 1.8; color: #b8b0a6; overflow-x: auto;">generateFixes: <span style="color: ${C.k};">true</span>,
verifyFixes: <span style="color: ${C.k};">true</span>,
fixSandbox: <span style="color: ${C.g};">'local'</span>, <span style="color: ${C.cm};">// 'local' | 'daytona'</span></pre>
</div>
${h2b('The fix-pattern database')}
${p('Frontguard keeps a local SQLite store of the fixes you accept and reject. The more you accept, the more often it reuses a known-good pattern instead of asking the AI again.')}
<div style="background: #121110; border: 1px solid #2a2622; margin-bottom: 24px;">
  <pre style="margin: 0; padding: 18px 20px; font-family: 'JetBrains Mono', monospace; font-size: 13px; line-height: 1.85; color: #d8d0c5; overflow-x: auto;"><span style="color: #7c746b;">$</span> frontguard accept-fix &lt;id&gt;   <span style="color: #564f48;"># positive training signal</span>
<span style="color: #7c746b;">$</span> frontguard reject-fix &lt;id&gt;   <span style="color: #564f48;"># negative signal</span>
<span style="color: #7c746b;">$</span> frontguard export-patterns &gt; fix-patterns.json</pre>
</div>
<p style="font-size: 16px; line-height: 1.65; color: #c8c0b6; margin: 0 0 40px;">A pattern is reused once it has been accepted ≥3 times with no rejections. A verified fix is automatically recorded as an accepted local signal when the database is available; that does not update screenshot baselines or replace patch review.</p>`

/* ---------------- CUSTOM PLUGINS ---------------- */
const pluginsHtml = `
${h1('Custom Plugins')}
${lead('Frontguard ships a plugin architecture with nine lifecycle hooks. Five plugins are built in; writing your own is a plain object.')}
${h2b('Built-in plugins')}
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #211e1b; border: 1px solid #211e1b; margin-bottom: 36px;">
  ${[
    ['Figma', 'Design-to-code comparison, token extraction, component mapping.'],
    ['Performance Budgets', 'LCP / CLS / TTFB thresholds correlated with the visual diff.'],
    ['Accessibility', 'axe-core WCAG audits — contrast, alt text, focus — in one pass.'],
    ['Third-Party Scripts', 'Flags ad / analytics / widget origins that appear or vanish.'],
    ['Monitor', 'Production visual monitoring, threshold alerting, history.'],
  ]
    .map(
      ([n, d]) => `<div style="background: #0d0c0b; padding: 18px 20px;">
    <div style="font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #f5f1ea; margin-bottom: 6px;">${n}</div>
    <div style="font-size: 13.5px; line-height: 1.5; color: #8c847a;">${d}</div>
  </div>`,
    )
    .join('')}
</div>
${h2b('Lifecycle hooks')}
${p('Seven hooks run at pipeline stages, bracketed by setup and teardown. Hooks that transform pipeline data pass that result to the next plugin; onError may suppress an error by returning true.')}
<div style="background: #121110; border: 1px solid #2a2622; margin-bottom: 16px; padding: 18px 20px; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; color: #d8d0c5; line-height: 1.7; overflow-x: auto;">setup → beforeDiscover → afterDiscover → beforeRender → afterRender → afterCompare → afterRun → onError → teardown</div>
<p style="font-size: 14px; line-height: 1.6; color: #8c847a; margin: 0 0 32px;">Plugins run in registration order. Plugin names must be unique, and behavior should be tested against the pinned CLI version.</p>
${h2b('Example: a Slack plugin')}
${code(
  'plugins/slack.ts',
  `<span style="color: ${C.k};">export function</span> slackPlugin(webhookUrl: <span style="color: ${C.y};">string</span>): FrontguardPlugin {
  <span style="color: ${C.k};">return</span> {
    name: <span style="color: ${C.g};">'slack'</span>,
    <span style="color: ${C.k};">async</span> afterRun(result, ctx) {
      <span style="color: ${C.k};">if</span> (result.summary.regressions === <span style="color: ${C.n};">0</span>) <span style="color: ${C.k};">return</span>;
      <span style="color: ${C.k};">await</span> fetch(webhookUrl, {
        method: <span style="color: ${C.g};">'POST'</span>,
        body: JSON.stringify({ text: <span style="color: ${C.g};">\`🔴 \${result.summary.regressions} regression(s)\`</span> }),
      });
    },
  };
}`,
)}`

/* ---------------- SELF-HOSTING ---------------- */
const selfhostHtml = `
${h1('Self-hosting')}
${lead('The CLI is fully self-contained — it needs nothing but Node, a browser, and your repo. Baselines live in Git; reports are local files. Run it anywhere you run CI.')}
${h2b('Git-native baselines')}
${p(`Baselines are stored in a Git orphan branch (${ic('frontguard-baselines')}) by default. This keeps baseline images out of your main branch history while still being version-controlled. The manifest tracks which routes, viewports and browsers were captured and when.`)}
${h2b('Docker')}
${p('The renderer is currently repository-source-only. From a clean clone, prepare the local npm tarball that the Dockerfile requires before building the pinned image; no public image or cross-host byte-equivalence result is published.')}
${code(
  'terminal',
  `<span style="color: #7c746b;">$</span> npm ci
<span style="color: #7c746b;">$</span> npm run build --workspace=packages/cli
<span style="color: #7c746b;">$</span> npm pack ./packages/cli --pack-destination packages/cli/docker
<span style="color: #7c746b;">$</span> mv packages/cli/docker/frontguard-cli-*.tgz packages/cli/docker/frontguard-cli.tgz
<span style="color: #7c746b;">$</span> docker build --platform linux/amd64 -t frontguard/render:0.2.3 packages/cli/docker`,
)}
${p('After the image is built, invoke it from a configured project. A container cannot reach a host app through localhost, so this staging example overrides baseUrl deliberately.')}
${code('configured project terminal', `<span style="color: #7c746b;">$</span> npx -p @frontguard/cli frontguard run --docker --url https://staging.example.com`)}
${h2b('Optional cloud platform')}
${p('Cloudflare Workers, D1, and R2 source is included for development, but its Compose path is not a verified clean-checkout deployment and there is no supported hosted or self-host quick start today. The CLI never depends on it.')}
${callout('', 'Do not use the pre-release cloud for production data until deployment, migrations, retention, recovery, and tenant isolation have been independently verified.')}`

/* ---------------- VALIDATION ---------------- */
const resultsHtml = `
${h1('Validation &amp; results')}
${lead(`The published validation run measured local route execution with AI disabled. It is not evidence of model accuracy or cross-OS equivalence.`)}
<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 36px;">
  ${[
    ['39 / 43', 'route rechecks completed in the published harness'],
    ['2 / 5', 'fixture repositories booted successfully'],
    ['AI OFF', 'classifier accuracy was not measured'],
  ]
    .map(
      ([stat, label]) => `<div style="border: 1px solid #2a2622; background: #131210; padding: 24px 22px;">
    <div style="font-family: 'JetBrains Mono', monospace; font-size: 32px; font-weight: 700; color: #e8862e;">${stat}</div>
    <div style="font-size: 13.5px; color: #8c847a; margin-top: 8px; line-height: 1.5;">${label}</div>
  </div>`,
    )
    .join('')}
</div>
${h2b('Current evidence')}
${p('Review the recorded commands, failures, and environment in the checked-in validation result:')}
<div style="background: #121110; border: 1px solid #2a2622; margin-bottom: 28px;">
  <pre style="margin: 0; padding: 16px 20px; font-family: 'JetBrains Mono', monospace; font-size: 13px; line-height: 1.8; color: #d8d0c5; overflow-x: auto;">validation/results-v0.2.md</pre>
</div>
${callout('LIMIT', 'The run used one macOS host and did not seed AI classifications. Treat model accuracy and cross-host consistency as unvalidated.')}`

export const articles: Article[] = [
  { id: 'intro', label: 'Introduction', section: 'Getting Started', toc: ['Overview', 'Detect / Understand', 'Prerequisites', 'The pipeline'], html: introHtml },
  { id: 'install', label: 'Installation', section: 'Getting Started', toc: ['Install the CLI', 'Framework detection', 'Environment variables'], html: installHtml },
  { id: 'quick', label: 'Quick start', section: 'Getting Started', toc: ['First run', 'Reading the output', 'Status legend'], html: quickHtml },
  { id: 'cli', label: 'CLI Commands', section: 'Reference', toc: ['Command list', 'frontguard run', 'Exit codes', 'frontguard monitor'], html: cliHtml },
  { id: 'config', label: 'Configuration', section: 'Reference', toc: ['Full example', 'Core options', 'Per-route overrides', 'Anti-flake'], html: configHtml },
  { id: 'playwright', label: 'Playwright plugin', section: 'Reference', toc: ['Setup', 'visualTest API', 'Updating baselines'], html: playwrightHtml },
  { id: 'cicd', label: 'GitHub Actions', section: 'CI / CD', toc: ['Quick setup', 'Action inputs', 'What it does'], html: cicdHtml },
  { id: 'aiAnalysis', label: 'AI Analysis', section: 'Guides', toc: ['Classification', 'Providers', 'Cost optimization', 'BYOK'], html: aiAnalysisHtml },
  { id: 'aiFixes', label: 'AI Fixes', section: 'Guides', toc: ['Sandbox verification', 'Fix-pattern database', 'Learning loop'], html: aiFixesHtml },
  { id: 'plugins', label: 'Custom Plugins', section: 'Guides', toc: ['Built-in plugins', 'Lifecycle hooks', 'Example: Slack'], html: pluginsHtml },
  { id: 'selfhost', label: 'Self-hosting', section: 'Deployment', toc: ['Git-native baselines', 'Docker', 'Cloud platform'], html: selfhostHtml },
  { id: 'results', label: 'Validation & results', section: 'Trust', toc: ['Accuracy stats', 'Synthetic', 'Real-world'], html: resultsHtml },
]

export const navGroups: { label: string; ids: string[] }[] = [
  { label: 'GETTING STARTED', ids: ['intro', 'install', 'quick'] },
  { label: 'REFERENCE', ids: ['cli', 'config', 'playwright'] },
  { label: 'CI / CD', ids: ['cicd'] },
  { label: 'GUIDES', ids: ['aiAnalysis', 'aiFixes', 'plugins'] },
  { label: 'DEPLOYMENT', ids: ['selfhost'] },
  { label: 'TRUST', ids: ['results'] },
]
