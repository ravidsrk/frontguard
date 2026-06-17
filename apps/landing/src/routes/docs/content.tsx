import type { ReactNode } from 'react';
import { Card } from '../../components/ui';
import {
  Body,
  Lead,
  H2,
  H3,
  Code,
  Strong,
  Callout,
  GridList,
  GridRow,
  DefTable,
  DefRow,
  MonoKey,
  MonoDim,
  Terminal,
  Kw,
  Str,
  Num,
  Cmt,
  Blu,
  Prompt,
} from './primitives';

/**
 * Per-page docs content, ported faithfully from
 * `docs/design-extract/source/Docs.dc.html` (`renderVals` data + the per-page
 * `sc-if` templates). Each page is an optional lead paragraph plus an ordered
 * list of sections; the section `id`/`label` pairs are the single source of
 * truth for both the in-page anchors and the right-rail TOC, so the two can
 * never drift. Keyed by the docs slug in `lib/docs.ts`.
 */

export interface DocSection {
  id: string;
  label: string;
  node: ReactNode;
}

export interface DocContent {
  lead?: ReactNode;
  sections: DocSection[];
}

/* ---- design data (verbatim from renderVals) ---- */

const STAGES = [
  { num: '01', title: 'Discover', desc: 'Crawl, filesystem scan, or config — finds every route automatically.' },
  { num: '02', title: 'Filter', desc: 'Dependency graph renders only pages affected by your changed files.' },
  { num: '03', title: 'Render', desc: 'Playwright captures each route × viewport × browser, anti-flake.' },
  { num: '04', title: 'Diff', desc: 'pixelmatch fast gate, then DOM + computed-style comparison.' },
  { num: '05', title: 'Analyze', desc: 'AI vision classifies, explains the root cause, scores confidence.' },
  { num: '06', title: 'Report', desc: 'Console, JSON, HTML, and a GitHub PR comment with visual diffs.' },
];

const FRAMEWORKS = ['Next.js', 'Remix', 'SvelteKit', 'Nuxt', 'Astro'];

const ENV_VARS = [
  { name: 'FRONTGUARD_OPENAI_KEY', desc: 'OpenAI API key for AI analysis (optional).' },
  { name: 'FRONTGUARD_ANTHROPIC_KEY', desc: 'Anthropic API key for AI analysis (alternative).' },
  { name: 'GITHUB_TOKEN', desc: 'GitHub token for posting PR comments. Provided automatically in Actions.' },
  { name: 'FRONTGUARD_DEBUG', desc: 'Set to 1 for full stack traces on errors.' },
];

const QUICK_STEPS = [
  { n: '1', title: 'Initialize', desc: 'Auto-detect your framework and scaffold a config (plus a GitHub Action with --ci).', cmd: 'npx frontguard init --ci' },
  { n: '2', title: 'Check your environment', desc: 'Verify Node, Playwright, browsers and git are ready.', cmd: 'npx frontguard doctor' },
  { n: '3', title: 'Run', desc: 'First run captures baselines; subsequent runs diff against them.', cmd: 'npx frontguard run --url http://localhost:3000' },
  { n: '4', title: 'Accept changes', desc: 'After an intentional redesign, accept the current screenshots as new baselines.', cmd: 'npx frontguard update-baselines' },
];

const STATUSES = [
  { glyph: '✓', label: 'PASS', desc: 'within threshold', cls: 'text-pass' },
  { glyph: '⚠', label: 'WARNING', desc: 'minor diff', cls: 'text-warning' },
  { glyph: '✘', label: 'REGRESSION', desc: 'exceeds threshold', cls: 'text-regression' },
  { glyph: '★', label: 'NEW', desc: 'no baseline yet', cls: 'text-new' },
];

const COMMANDS = [
  { cmd: 'frontguard run', desc: 'Run the visual regression pipeline (default command).' },
  { cmd: 'frontguard init [--ci]', desc: 'Detect framework and scaffold config (and a GitHub Action).' },
  { cmd: 'frontguard doctor', desc: 'Diagnose environment readiness before a run.' },
  { cmd: 'frontguard monitor', desc: 'Run visual checks against live production URLs.' },
  { cmd: 'frontguard update-baselines', desc: 'Accept the current screenshots as new baselines.' },
  { cmd: 'frontguard plugin <cmd>', desc: 'install · uninstall · list plugins from npm.' },
];

const RUN_FLAGS = [
  { flag: '-u, --url <url>', desc: 'Base URL to test', def: 'config' },
  { flag: '-r, --routes', desc: 'Comma-separated routes to test', def: 'auto' },
  { flag: '-v, --viewports', desc: 'Comma-separated viewport widths', def: '375,768,1440' },
  { flag: '-b, --browsers', desc: 'chromium, firefox, webkit', def: 'chromium' },
  { flag: '-o, --output', desc: 'Output format: console, json', def: 'console' },
  { flag: '-t, --threshold', desc: 'Pixel diff threshold (0–100)', def: '0.1' },
];

const CORE_OPTS = [
  { opt: 'baseUrl', desc: 'Required. Base URL of the app under test', def: '—' },
  { opt: 'routes', desc: 'Explicit routes — strings or per-route objects', def: '—' },
  { opt: 'discover', desc: 'Auto-discovery configuration', def: '—' },
  { opt: 'viewports', desc: 'Viewport widths in pixels', def: '[375,768,1440]' },
  { opt: 'browsers', desc: 'chromium · firefox · webkit', def: "['chromium']" },
  { opt: 'threshold', desc: 'Max allowed pixel diff as a fraction', def: '0.1' },
];

const ANTI_FLAKE = [
  { opt: 'antiFlakeRenders', desc: 'Renders per page for flake detection (recommended: 2–3).' },
  { opt: 'freezeTime', desc: 'Freeze Date.now() during render to stabilize timestamps.' },
  { opt: 'ssimFallback', desc: 'Use SSIM perceptual diff for borderline results.' },
  { opt: 'renderRetries', desc: 'Per-page retry count on render failure.' },
];

const ACTION_INPUTS = [
  { input: 'url', req: 'No', desc: 'Base URL to test (auto-detected from preview deploys if omitted).' },
  { input: 'routes', req: 'No', desc: 'Comma-separated routes (auto-discovered by default).' },
  { input: 'viewports', req: 'No', desc: 'Comma-separated viewport widths. Default 375,768,1440.' },
  { input: 'threshold', req: 'No', desc: 'Pixel diff threshold percentage. Default 0.1.' },
  { input: 'ai-provider', req: 'No', desc: 'openai or anthropic.' },
  { input: 'update-baselines', req: 'No', desc: 'Accept current as new baselines. Default false.' },
];

const ACTION_STEPS = [
  'Setup Node.js 20.',
  'Install Frontguard — npm install -g @frontguard/cli@latest.',
  'Install browsers — npx playwright install --with-deps.',
  'Detect preview URL from Vercel, Netlify, Cloudflare, Railway, Render.',
  'Run the full pipeline with your configuration.',
  'Upload the HTML report as a build artifact.',
];

const FIX_STEPS = [
  'Apply the generated CSS patch in a sandbox.',
  'Re-render the page with the patch injected.',
  'Re-compare the result against the baseline.',
  'Mark ✅ Verified if within threshold, ⚠️ Unverified otherwise.',
];

const PLUGIN_LIST = [
  { name: 'Figma', desc: 'Design-to-code comparison, token extraction, component mapping.' },
  { name: 'Performance Budgets', desc: 'LCP / CLS / TTFB thresholds correlated with the visual diff.' },
  { name: 'Accessibility', desc: 'axe-core WCAG audits — contrast, alt text, focus — in one pass.' },
  { name: 'Third-Party Scripts', desc: 'Flags ad / analytics / widget origins that appear or vanish.' },
  { name: 'Monitor', desc: 'Production visual monitoring, threshold alerting, history.' },
];

const TRUST_STATS = [
  { stat: '395', label: 'tests across 26 test files in the core CLI' },
  { stat: '10', label: 'synthetic ground-truth cases with known classifications' },
  { stat: 'PR-level', label: 'real-world validation against live GitHub pull requests' },
];

/* ---- shared rendered fragments ---- */

/** The four-status legend grid (inlined, not a component, to keep this module
 *  data-only for react-refresh). */
const statusCards = (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {STATUSES.map((s) => (
      <div
        key={s.label}
        className="flex items-center gap-3.5 border border-border-card bg-panel px-[18px] py-3.5"
      >
        <span aria-hidden="true" className={['font-mono text-[18px]', s.cls].join(' ')}>
          {s.glyph}
        </span>
        <div>
          <span className="font-mono text-[13px] text-ink-hi">{s.label}</span>
          <span className="text-[13px] text-ink-soft"> — {s.desc}</span>
        </div>
      </div>
    ))}
  </div>
);

/* ---- the registry ---- */

export const DOC_CONTENT: Record<string, DocContent> = {
  introduction: {
    sections: [
      {
        id: 'overview',
        label: 'Overview',
        node: (
          <div id="overview" className="flex scroll-mt-24 flex-col gap-[18px]">
            <Lead>
              Frontguard is an AI-powered visual regression testing tool for frontend teams. It
              renders every page in your app, compares it against approved baselines, and uses AI
              vision to classify each diff as a <Strong>regression</Strong>, an{' '}
              <Strong>intentional change</Strong>, or a <Strong>content update</Strong> — then
              explains why and suggests a verified fix.
            </Lead>
            <Lead>
              The goal is simple: a red run should mean something. Pixel-diff tools fire on non-bugs
              so often that teams stop trusting them — so Frontguard's job is to tell a real
              regression apart from noise, not just count changed pixels.
            </Lead>
            <Lead>
              It's CLI-first, MIT licensed, and fully self-hostable. No per-screenshot pricing, no
              dashboard lock-in. Bring your own AI key.
            </Lead>
          </div>
        ),
      },
      {
        id: 'detect-understand',
        label: 'Detect / Understand',
        node: (
          <div id="detect-understand" className="grid scroll-mt-24 grid-cols-1 gap-3.5 sm:grid-cols-2">
            <Card hoverLift className="p-[22px]">
              <div className="mb-2.5 font-mono text-[12px] text-pass">DETECT</div>
              <p className="text-[14px] leading-[1.55] text-ink-mid">
                Pixel diff + DOM and computed-style diff across every viewport and browser.
                Anti-flake multi-render kills false positives.
              </p>
            </Card>
            <Card hoverLift className="p-[22px]">
              <div className="mb-2.5 font-mono text-[12px] text-amber">UNDERSTAND</div>
              <p className="text-[14px] leading-[1.55] text-ink-mid">
                AI vision classifies each diff, maps it to the exact code change, and explains the
                root cause in plain language.
              </p>
            </Card>
          </div>
        ),
      },
      {
        id: 'prerequisites',
        label: 'Prerequisites',
        node: (
          <div id="prerequisites" className="scroll-mt-24">
            <Callout label="Prerequisites">
              Node.js 20+ and npm 9+. AI analysis is optional — pixel and DOM diff run locally
              without any key.
            </Callout>
          </div>
        ),
      },
      {
        id: 'the-pipeline',
        label: 'The pipeline',
        node: (
          <div className="flex flex-col gap-5">
            <H2 id="the-pipeline" size={26}>
              The pipeline
            </H2>
            <Body>
              Frontguard runs a six-stage pipeline. Each stage is independent with error boundaries —
              one page failing doesn't kill the run. A fast pixel gate means ~90% of pages never
              reach the AI.
            </Body>
            <GridList>
              {STAGES.map((s) => (
                <GridRow key={s.num} cols="56px 110px 1fr">
                  <span className="font-mono text-[12px] text-ink-faint">{s.num}</span>
                  <span className="font-mono text-[13px] font-medium text-amber">{s.title}</span>
                  <span className="text-[14px] leading-[1.5] text-ink-mid">{s.desc}</span>
                </GridRow>
              ))}
            </GridList>
          </div>
        ),
      },
    ],
  },

  installation: {
    lead: (
      <Lead>
        Install the CLI from npm, then initialize a config. The <Code>--ci</Code> flag also scaffolds
        a GitHub Actions workflow.
      </Lead>
    ),
    sections: [
      {
        id: 'install-the-cli',
        label: 'Install the CLI',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="install-the-cli">Install the CLI</H2>
            <Terminal filename="terminal">
              <Cmt># install the CLI</Cmt>
              {'\n'}
              <Prompt />npm install @frontguard/cli{'\n'}
              {'\n'}
              <Cmt># initialize config (auto-detects your framework, --ci adds a GitHub Action)</Cmt>
              {'\n'}
              <Prompt />npx frontguard init --ci{'\n'}
              {'\n'}
              <Cmt># verify your environment is ready</Cmt>
              {'\n'}
              <Prompt />npx frontguard doctor
            </Terminal>
          </div>
        ),
      },
      {
        id: 'framework-detection',
        label: 'Framework detection',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="framework-detection">Framework detection</H2>
            <Body>
              <Code>frontguard init</Code> auto-detects your framework and writes sensible defaults —
              including a filesystem route source where one exists.
            </Body>
            <div className="flex flex-wrap gap-2">
              {FRAMEWORKS.map((fw) => (
                <span
                  key={fw}
                  className="border border-border-card bg-panel px-3.5 py-2 font-mono text-[13px] text-ink-bright2"
                >
                  {fw}
                </span>
              ))}
            </div>
          </div>
        ),
      },
      {
        id: 'environment-variables',
        label: 'Environment variables',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="environment-variables">Environment variables</H2>
            <DefTable>
              {ENV_VARS.map((e) => (
                <DefRow key={e.name} cols="minmax(180px,280px) 1fr">
                  <MonoKey>{e.name}</MonoKey>
                  <span className="text-[13.5px] leading-[1.5] text-ink-mid">{e.desc}</span>
                </DefRow>
              ))}
            </DefTable>
          </div>
        ),
      },
    ],
  },

  'quick-start': {
    lead: (
      <Lead>
        Run your first visual check in two minutes. The first run captures baselines; every
        subsequent run diffs against them.
      </Lead>
    ),
    sections: [
      {
        id: 'first-run',
        label: 'First run',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="first-run">First run</H2>
            <GridList>
              {QUICK_STEPS.map((q) => (
                <GridRow key={q.n} cols="40px 1fr">
                  <span className="self-start font-mono text-[18px] font-bold text-amber">{q.n}</span>
                  <div>
                    <div className="mb-1.5 text-[16px] font-semibold text-ink-hi">{q.title}</div>
                    <p className="mb-2.5 text-[14px] leading-[1.55] text-ink-mid">{q.desc}</p>
                    <code className="block border border-border-card bg-panel px-3.5 py-2.5 font-mono text-[13px] text-ink-bright2">
                      <Prompt />
                      {q.cmd}
                    </code>
                  </div>
                </GridRow>
              ))}
            </GridList>
          </div>
        ),
      },
      {
        id: 'reading-the-output',
        label: 'Reading the output',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="reading-the-output">Reading the output</H2>
            <Body>
              Every route × viewport gets a status. Regressions exit non-zero, so the run fails CI.
            </Body>
            <Terminal filename="frontguard run">
              <span className="text-pass">{'  ✓ /'}</span>           375 768 1440  <span className="text-pass">PASS</span>
              {'\n'}
              <span className="text-pass">{'  ✓ /pricing'}</span>    375 768 1440  <span className="text-pass">PASS</span>
              {'\n'}
              <span className="text-warning">{'  ⚠ /checkout'}</span>   375 768 1440  <span className="text-warning">WARNING</span>
              {'\n'}
              <span className="text-regression">{'  ✘ /dashboard'}</span>  375 768 1440  <span className="text-regression">REGRESSION</span>
              {'\n'}
              <span className="text-new">{'  ★ /settings'}</span>   375 768 1440  <span className="text-new">NEW</span>
              {'\n'}
              {'\n'}
              <span className="text-regression">1 regression</span> · <span className="text-warning">1 warning</span> · <span className="text-pass">9 passed</span> · <span className="text-new">1 new</span>
            </Terminal>
          </div>
        ),
      },
      {
        id: 'status-legend',
        label: 'Status legend',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="status-legend">Status legend</H2>
            {statusCards}
          </div>
        ),
      },
    ],
  },

  cli: {
    lead: (
      <Lead>
        Frontguard provides <Code>run</Code>, <Code>init</Code>, <Code>doctor</Code>,{' '}
        <Code>monitor</Code>, <Code>update-baselines</Code>, the fix-pattern commands, and the{' '}
        <Code>plugin</Code> subcommands.
      </Lead>
    ),
    sections: [
      {
        id: 'command-list',
        label: 'Command list',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="command-list">Command list</H2>
            <DefTable>
              {COMMANDS.map((c) => (
                <DefRow key={c.cmd} cols="minmax(160px,270px) 1fr">
                  <code className="font-mono text-[13px] text-amber">{c.cmd}</code>
                  <span className="text-[14px] leading-[1.5] text-ink-mid">{c.desc}</span>
                </DefRow>
              ))}
            </DefTable>
          </div>
        ),
      },
      {
        id: 'frontguard-run',
        label: 'frontguard run',
        node: (
          <div className="flex flex-col gap-4">
            <H2 id="frontguard-run" size={26}>
              frontguard run
            </H2>
            <Body>
              The default command. Runs the full discover → render → diff → analyze → report pipeline.
            </Body>
            <DefTable>
              <DefRow cols="minmax(140px,220px) 1fr 90px" header>
                <span>Flag</span>
                <span>Description</span>
                <span>Default</span>
              </DefRow>
              {RUN_FLAGS.map((f) => (
                <DefRow key={f.flag} cols="minmax(140px,220px) 1fr 90px">
                  <MonoKey>{f.flag}</MonoKey>
                  <span className="text-[13.5px] leading-[1.5] text-ink-mid">{f.desc}</span>
                  <MonoDim>{f.def}</MonoDim>
                </DefRow>
              ))}
            </DefTable>
            <H3 id="exit-codes">Exit codes</H3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="border border-pass-brd bg-pass-bg p-4">
                <code className="font-mono text-[18px] text-pass">0</code>
                <p className="mt-2 text-[13px] leading-[1.5] text-ink-soft">
                  All passed (or only warnings / new pages)
                </p>
              </div>
              <div className="border border-regression-brd bg-regression-bg p-4">
                <code className="font-mono text-[18px] text-regression">1</code>
                <p className="mt-2 text-[13px] leading-[1.5] text-ink-soft">Regressions detected</p>
              </div>
              <div className="border border-border-card bg-panel p-4">
                <code className="font-mono text-[18px] text-amber">2</code>
                <p className="mt-2 text-[13px] leading-[1.5] text-ink-soft">
                  Pipeline errors (but no regressions)
                </p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'frontguard-monitor',
        label: 'frontguard monitor',
        node: (
          <div className="flex flex-col gap-4">
            <H2 id="frontguard-monitor" size={26}>
              frontguard monitor
            </H2>
            <Body>
              Runs visual checks against live production URLs instead of a local dev server. Supports
              one-off checks, daemon polling, and webhook alerts.
            </Body>
            <Terminal filename="terminal">
              <Cmt># one-off check</Cmt>
              {'\n'}
              <Prompt />frontguard monitor --url https://example.com --threshold 2{'\n'}
              {'\n'}
              <Cmt># daemon mode — check every 15 minutes, alert Slack</Cmt>
              {'\n'}
              <Prompt />frontguard monitor --url https://example.com --interval 15 --webhook $SLACK_WEBHOOK
            </Terminal>
          </div>
        ),
      },
    ],
  },

  configuration: {
    lead: (
      <Lead>
        Frontguard is configured via <Code>frontguard.config.ts</Code> in your project root. Run{' '}
        <Code>frontguard init</Code> to generate a starter.
      </Lead>
    ),
    sections: [
      {
        id: 'full-example',
        label: 'Full example',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="full-example">Full example</H2>
            <Terminal filename="frontguard.config.ts">
              <Kw>export default</Kw> {'{'}
              {'\n'}
              {'  '}version: <Num>1</Num>,{'\n'}
              {'  '}baseUrl: <Str>'http://localhost:3000'</Str>,{'\n'}
              {'\n'}
              {'  '}
              <Cmt>// auto-discover routes (zero config)</Cmt>
              {'\n'}
              {'  '}discover: {'{'} startUrl: <Str>'/'</Str>, maxDepth: <Num>3</Num>, exclude: [
              <Str>'/admin/*'</Str>] {'}'},{'\n'}
              {'\n'}
              {'  '}viewports: [<Num>375</Num>, <Num>768</Num>, <Num>1440</Num>],{'\n'}
              {'  '}browsers: [<Str>'chromium'</Str>],{'\n'}
              {'  '}threshold: <Num>0.1</Num>,{'\n'}
              {'\n'}
              {'  '}
              <Cmt>// AI analysis (optional, BYOK)</Cmt>
              {'\n'}
              {'  '}ai: {'{'} provider: <Str>'openai'</Str>, model: <Str>'gpt-4o'</Str> {'}'},{'\n'}
              {'\n'}
              {'  '}
              <Cmt>// anti-flake</Cmt>
              {'\n'}
              {'  '}antiFlakeRenders: <Num>2</Num>,{'\n'}
              {'  '}freezeTime: <Kw>true</Kw>,{'\n'}
              {'\n'}
              {'  '}ignore: [{'{'} selector: <Str>'.dynamic-timestamp'</Str> {'}'}],{'\n'}
              {'}'};
            </Terminal>
          </div>
        ),
      },
      {
        id: 'core-options',
        label: 'Core options',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="core-options">Core options</H2>
            <DefTable>
              <DefRow cols="minmax(110px,150px) 1fr 90px" header>
                <span>Option</span>
                <span>Description</span>
                <span>Default</span>
              </DefRow>
              {CORE_OPTS.map((o) => (
                <DefRow key={o.opt} cols="minmax(110px,150px) 1fr 90px">
                  <MonoKey>{o.opt}</MonoKey>
                  <span className="text-[13.5px] leading-[1.5] text-ink-mid">{o.desc}</span>
                  <MonoDim>{o.def}</MonoDim>
                </DefRow>
              ))}
            </DefTable>
          </div>
        ),
      },
      {
        id: 'per-route-overrides',
        label: 'Per-route overrides',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="per-route-overrides">Per-route overrides</H2>
            <Body>
              Different pages need different sensitivity. Any entry in <Code>routes</Code> can be an
              object instead of a plain string.
            </Body>
            <Terminal filename="frontguard.config.ts">
              routes: [{'\n'}
              {'  '}
              <Str>'/'</Str>, <Cmt>// global threshold</Cmt>
              {'\n'}
              {'  '}
              {'{'} path: <Str>'/checkout'</Str>, threshold: <Num>0.001</Num> {'}'},{' '}
              <Cmt>// strict — 0.1%</Cmt>
              {'\n'}
              {'  '}
              {'{'} path: <Str>'/blog/*'</Str>, threshold: <Num>0.05</Num> {'}'},{' '}
              <Cmt>// lenient — 5%</Cmt>
              {'\n'}
              {'  '}
              {'{'} path: <Str>'/gallery'</Str>, viewport: [<Num>1440</Num>] {'}'},{' '}
              <Cmt>// desktop only</Cmt>
              {'\n'}]
            </Terminal>
          </div>
        ),
      },
      {
        id: 'anti-flake',
        label: 'Anti-flake',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="anti-flake">Anti-flake options</H2>
            <DefTable>
              {ANTI_FLAKE.map((a) => (
                <DefRow key={a.opt} cols="minmax(140px,170px) 1fr">
                  <MonoKey>{a.opt}</MonoKey>
                  <span className="text-[13.5px] leading-[1.5] text-ink-mid">{a.desc}</span>
                </DefRow>
              ))}
            </DefTable>
            <Callout>
              Set <Code>antiFlakeRenders: 2</Code> to capture each page twice. If both renders differ
              from the baseline the diff is real; if only one does, it's a flake and gets ignored.
            </Callout>
          </div>
        ),
      },
    ],
  },

  playwright: {
    lead: (
      <Lead>
        Already have a Playwright suite? Drop visual assertions straight into your existing tests
        with <Code>@frontguard/playwright</Code> — no separate run, baselines managed for you.
      </Lead>
    ),
    sections: [
      {
        id: 'setup',
        label: 'Setup',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="setup">Setup</H2>
            <Terminal filename="tests/visual.spec.ts">
              <Kw>import</Kw> {'{'} visualTest {'}'} <Kw>from</Kw> <Str>'@frontguard/playwright'</Str>;
              {'\n'}
              {'\n'}
              test(<Str>'checkout page'</Str>, <Kw>async</Kw> ({'{'} page {'}'}) ={'>'} {'{'}
              {'\n'}
              {'  '}
              <Kw>await</Kw> page.goto(<Str>'/checkout'</Str>);{'\n'}
              {'\n'}
              {'  '}
              <Cmt>// capture + diff against baseline, with AI analysis</Cmt>
              {'\n'}
              {'  '}
              <Kw>const</Kw> result = <Kw>await</Kw> visualTest(page, <Str>'checkout'</Str>, {'{'}
              {'\n'}
              {'    '}ai: {'{'} provider: <Str>'openai'</Str>, model: <Str>'gpt-4o'</Str> {'}'},{'\n'}
              {'  '}
              {'}'});{'\n'}
              {'\n'}
              {'  '}expect(result.passed).toBe(<Kw>true</Kw>);{'\n'}
              {'}'});
            </Terminal>
          </div>
        ),
      },
      {
        id: 'visualtest-api',
        label: 'visualTest API',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="visualtest-api">visualTest API</H2>
            <Body>
              Or enable AI with defaults — <Code>ai: true</Code> uses OpenAI. Update baselines by
              setting <Code>FRONTGUARD_UPDATE=1</Code>.
            </Body>
          </div>
        ),
      },
      {
        id: 'updating-baselines',
        label: 'Updating baselines',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="updating-baselines">Updating baselines</H2>
            <Callout>
              The plugin reuses your test's already-rendered page — no second browser launch — so it
              adds visual coverage with almost no extra runtime.
            </Callout>
          </div>
        ),
      },
    ],
  },

  'github-actions': {
    lead: (
      <Lead>
        Frontguard provides an official GitHub Action. It auto-detects preview URLs from Vercel,
        Netlify, Cloudflare, Railway and Render, runs the pipeline, and posts a PR comment with
        before/after/diff thumbnails.
      </Lead>
    ),
    sections: [
      {
        id: 'quick-setup',
        label: 'Quick setup',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="quick-setup">Quick setup</H2>
            <Terminal filename=".github/workflows/visual-regression.yml">
              <Blu>name</Blu>: Visual Regression Tests{'\n'}
              <Blu>on</Blu>:{'\n'}
              {'  '}
              <Blu>pull_request</Blu>:{'\n'}
              {'    '}
              <Blu>branches</Blu>: [main]{'\n'}
              {'\n'}
              <Blu>jobs</Blu>:{'\n'}
              {'  '}
              <Blu>visual-test</Blu>:{'\n'}
              {'    '}
              <Blu>runs-on</Blu>: ubuntu-latest{'\n'}
              {'    '}
              <Blu>steps</Blu>:{'\n'}
              {'      '}- <Blu>uses</Blu>: actions/checkout@v4{'\n'}
              {'      '}- <Blu>name</Blu>: Run Frontguard{'\n'}
              {'        '}
              <Blu>uses</Blu>: ravidsrk/frontguard@main{'\n'}
              {'        '}
              <Blu>with</Blu>:{'\n'}
              {'          '}
              <Blu>url</Blu>: <Str>{'${{ env.PREVIEW_URL }}'}</Str> <Cmt># or let it auto-detect</Cmt>
              {'\n'}
              {'        '}
              <Blu>env</Blu>:{'\n'}
              {'          '}
              <Blu>FRONTGUARD_OPENAI_KEY</Blu>: <Str>{'${{ secrets.FRONTGUARD_OPENAI_KEY }}'}</Str>
            </Terminal>
          </div>
        ),
      },
      {
        id: 'action-inputs',
        label: 'Action inputs',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="action-inputs">Action inputs</H2>
            <DefTable>
              <DefRow cols="minmax(120px,170px) 90px 1fr" header>
                <span>Input</span>
                <span>Required</span>
                <span>Description</span>
              </DefRow>
              {ACTION_INPUTS.map((i) => (
                <DefRow key={i.input} cols="minmax(120px,170px) 90px 1fr">
                  <MonoKey>{i.input}</MonoKey>
                  <MonoDim>{i.req}</MonoDim>
                  <span className="text-[13.5px] leading-[1.5] text-ink-mid">{i.desc}</span>
                </DefRow>
              ))}
            </DefTable>
          </div>
        ),
      },
      {
        id: 'what-it-does',
        label: 'What it does',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="what-it-does">What the action does</H2>
            <GridList>
              {ACTION_STEPS.map((desc, i) => (
                <GridRow key={desc} cols="40px 1fr">
                  <span className="font-mono text-[13px] text-amber">{i + 1}</span>
                  <span className="text-[14px] leading-[1.5] text-ink-mid">{desc}</span>
                </GridRow>
              ))}
            </GridList>
          </div>
        ),
      },
    ],
  },

  'ai-analysis': {
    lead: (
      <Lead>
        Frontguard's AI analysis goes beyond "pixels differ" — it explains <Strong>why</Strong> a
        change happened, classifies it, and suggests fixes. Instead of a red-highlighted diff, you
        get a human-readable explanation.
      </Lead>
    ),
    sections: [
      {
        id: 'classification',
        label: 'Classification',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="classification">Classification</H2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="border border-regression-brd bg-regression-bg p-[18px]">
                <div className="mb-2 font-mono text-[12px] text-regression">regression</div>
                <p className="text-[13.5px] leading-[1.5] text-ink-mid">
                  Unintentional visual break — something is wrong.
                </p>
              </div>
              <div className="border border-pass-brd bg-pass-bg p-[18px]">
                <div className="mb-2 font-mono text-[12px] text-pass">intentional</div>
                <p className="text-[13.5px] leading-[1.5] text-ink-mid">
                  Deliberate design change — looks correct.
                </p>
              </div>
              <div className="border border-border-card bg-panel p-[18px]">
                <div className="mb-2 font-mono text-[12px] text-new">content_update</div>
                <p className="text-[13.5px] leading-[1.5] text-ink-mid">
                  Dynamic content changed (text, images) — not a code issue.
                </p>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'providers',
        label: 'Providers',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="providers">Supported providers</H2>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div className="border border-border-card bg-panel px-[22px] py-5">
                <div className="mb-3 font-mono text-[13px] text-ink-hi">OpenAI</div>
                <code className="mb-3.5 block font-mono text-[12px] text-ink-bright2">
                  <span className="text-ink-muted">export </span>FRONTGUARD_OPENAI_KEY=sk-…
                </code>
                <div className="text-[13px] leading-[1.7] text-ink-soft">
                  <span className="font-mono text-amber">gpt-4o</span> — best accuracy
                  <br />
                  <span className="font-mono text-amber">gpt-4o-mini</span> — faster, lower cost
                </div>
              </div>
              <div className="border border-border-card bg-panel px-[22px] py-5">
                <div className="mb-3 font-mono text-[13px] text-ink-hi">Anthropic</div>
                <code className="mb-3.5 block font-mono text-[12px] text-ink-bright2">
                  <span className="text-ink-muted">export </span>FRONTGUARD_ANTHROPIC_KEY=sk-ant-…
                </code>
                <div className="text-[13px] leading-[1.7] text-ink-soft">
                  <span className="font-mono text-amber">claude-sonnet-4</span> — best accuracy
                  <br />
                  <span className="font-mono text-amber">claude-3-5-haiku</span> — faster, lower cost
                </div>
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'cost-optimization',
        label: 'Cost optimization',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="cost-optimization">Cost optimization</H2>
            <Body>
              AI only runs on pages with a detected diff — the pixel fast-gate catches 90%+ as
              passing, so they never hit the API.
            </Body>
            <ul className="flex flex-col gap-3">
              {[
                'Use a cheap model (gpt-4o-mini / haiku) for triage, full models for PR-blocking checks',
                'Limit AI to the primary viewport if cost is a concern',
                'Screenshots are downscaled to ≤800px before the API call',
              ].map((item) => (
                <li key={item} className="flex gap-3 text-[14.5px] leading-[1.5] text-ink-bright">
                  <span aria-hidden="true" className="font-mono text-pass">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ),
      },
      {
        id: 'byok',
        label: 'BYOK',
        node: (
          <div id="byok" className="scroll-mt-24">
            <Callout label="BYOK — bring your own key">
              Frontguard never stores, proxies, or logs your API keys. They're read from env vars at
              runtime, passed directly to provider SDKs, and redacted from all output.
            </Callout>
          </div>
        ),
      },
    ],
  },

  'ai-fixes': {
    lead: (
      <Lead>
        Every competitor stops at "here's what changed." Frontguard goes further: here's a fix, and
        it re-rendered the page with the fix applied to confirm it works. Over time it learns which
        fixes you accept and reuses them.
      </Lead>
    ),
    sections: [
      {
        id: 'sandbox-verification',
        label: 'Sandbox verification',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="sandbox-verification">Verifying fixes in a sandbox</H2>
            <Body>
              A suggested fix is only useful if it works. With <Code>verifyFixes: true</Code>,
              Frontguard applies the patch, re-renders, and re-compares:
            </Body>
            <GridList>
              {FIX_STEPS.map((desc, i) => (
                <GridRow key={desc} cols="36px 1fr">
                  <span className="font-mono text-[13px] text-amber">{i + 1}</span>
                  <span className="text-[14px] leading-[1.5] text-ink-mid">{desc}</span>
                </GridRow>
              ))}
            </GridList>
            <Terminal filename="frontguard.config.ts">
              generateFixes: <Kw>true</Kw>,{'\n'}
              verifyFixes: <Kw>true</Kw>,{'\n'}
              fixSandbox: <Str>'local'</Str>, <Cmt>// 'local' | 'daytona'</Cmt>
            </Terminal>
          </div>
        ),
      },
      {
        id: 'fix-pattern-database',
        label: 'Fix-pattern database',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="fix-pattern-database">The fix-pattern database</H2>
            <Body>
              Frontguard keeps a local SQLite store of the fixes you accept and reject. The more you
              accept, the more often it reuses a known-good pattern instead of asking the AI again.
            </Body>
            <Terminal>
              <Prompt />frontguard accept-fix {'<id>'} <Cmt># positive training signal</Cmt>
              {'\n'}
              <Prompt />frontguard reject-fix {'<id>'} <Cmt># negative signal</Cmt>
              {'\n'}
              <Prompt />frontguard export-patterns {'>'} fix-patterns.json
            </Terminal>
          </div>
        ),
      },
      {
        id: 'learning-loop',
        label: 'Learning loop',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="learning-loop">Learning loop</H2>
            <Body>
              A pattern is reused once it has been accepted ≥3 times with no rejections — so a
              one-off accept never overrides the model. Verified fixes are recorded as accepted
              automatically.
            </Body>
          </div>
        ),
      },
    ],
  },

  'custom-plugins': {
    lead: (
      <Lead>
        Frontguard ships a plugin architecture that lets you extend every stage of the pipeline
        through six lifecycle hooks. Five plugins are built in; writing your own is a plain object.
      </Lead>
    ),
    sections: [
      {
        id: 'built-in-plugins',
        label: 'Built-in plugins',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="built-in-plugins">Built-in plugins</H2>
            <div className="grid grid-cols-1 gap-px border border-border-faint bg-border-faint sm:grid-cols-2">
              {PLUGIN_LIST.map((p) => (
                <div key={p.name} className="bg-canvas px-5 py-[18px]">
                  <div className="mb-1.5 font-mono text-[13px] text-ink-hi">{p.name}</div>
                  <div className="text-[13.5px] leading-[1.5] text-ink-soft">{p.desc}</div>
                </div>
              ))}
            </div>
          </div>
        ),
      },
      {
        id: 'lifecycle-hooks',
        label: 'Lifecycle hooks',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="lifecycle-hooks">Lifecycle hooks</H2>
            <Body>
              Hooks are called in order. All are optional — implement only what you need. Hooks that
              return a value replace the input for the next plugin in the chain.
            </Body>
            <div className="overflow-x-auto border border-border-card bg-surface-term px-5 py-[18px] font-mono text-[12.5px] leading-[1.7] text-ink-bright2">
              setup → beforeDiscover → afterDiscover → beforeRender →<br />
              afterRender → afterCompare → afterRun → teardown
            </div>
            <p className="text-[14px] leading-[1.6] text-ink-soft">
              Plugins are called in registration order; <Code>teardown</Code> runs LIFO. Plugin names
              must be unique.
            </p>
          </div>
        ),
      },
      {
        id: 'example-slack',
        label: 'Example: Slack',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="example-slack">Example: a Slack plugin</H2>
            <Terminal filename="plugins/slack.ts">
              <Kw>export function</Kw> slackPlugin(webhookUrl: <Blu>string</Blu>): FrontguardPlugin {'{'}
              {'\n'}
              {'  '}
              <Kw>return</Kw> {'{'}
              {'\n'}
              {'    '}name: <Str>'slack'</Str>,{'\n'}
              {'    '}
              <Kw>async</Kw> afterRun(result, ctx) {'{'}
              {'\n'}
              {'      '}
              <Kw>if</Kw> (result.summary.regressions === <Num>0</Num>) <Kw>return</Kw>;{'\n'}
              {'      '}
              <Kw>await</Kw> fetch(webhookUrl, {'{'}
              {'\n'}
              {'        '}method: <Str>'POST'</Str>,{'\n'}
              {'        '}body: JSON.stringify({'{'} text: <Str>{'`🔴 ${result.summary.regressions} regression(s)`'}</Str> {'}'}),
              {'\n'}
              {'      '}
              {'}'});{'\n'}
              {'    '}
              {'}'},{'\n'}
              {'  '}
              {'}'};{'\n'}
              {'}'}
            </Terminal>
          </div>
        ),
      },
    ],
  },

  'self-hosting': {
    lead: (
      <Lead>
        The CLI is fully self-contained — it needs nothing but Node, a browser, and your repo.
        Baselines live in Git; reports are local files. Run it anywhere you run CI.
      </Lead>
    ),
    sections: [
      {
        id: 'git-native-baselines',
        label: 'Git-native baselines',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="git-native-baselines">Git-native baselines</H2>
            <Body>
              Baselines are stored in a Git orphan branch (<Code>frontguard-baselines</Code>) by
              default. This keeps baseline images out of your main branch history while still being
              version-controlled. The manifest tracks which routes, viewports and browsers were
              captured and when.
            </Body>
          </div>
        ),
      },
      {
        id: 'docker',
        label: 'Docker',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="docker">Docker</H2>
            <Body>
              An official image bundles Node, Playwright and the browsers, so there's nothing to
              install in CI.
            </Body>
            <Terminal filename="terminal">
              <Prompt />docker run --rm -v $PWD:/app \{'\n'}
              {'    '}-e FRONTGUARD_OPENAI_KEY=$OPENAI_KEY \{'\n'}
              {'    '}ghcr.io/ravidsrk/frontguard run --url https://staging.example.com
            </Terminal>
          </div>
        ),
      },
      {
        id: 'cloud-platform',
        label: 'Cloud platform',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="cloud-platform">Optional cloud platform</H2>
            <Body>
              For teams that want a hosted dashboard, baseline approvals, monitoring schedules and
              usage metering, the cloud platform runs on Cloudflare Workers + D1 + R2 and is
              self-deployable. The CLI never depends on it.
            </Body>
            <Callout>
              No per-screenshot pricing, no vendor lock-in. Everything that runs in the hosted
              product is open source and can run on your own infrastructure.
            </Callout>
          </div>
        ),
      },
    ],
  },

  validation: {
    lead: (
      <Lead>
        Frontguard's value depends on the AI correctly classifying visual changes. Accuracy is
        measured with two validation harnesses and tracked over time — not asserted.
      </Lead>
    ),
    sections: [
      {
        id: 'accuracy-stats',
        label: 'Accuracy stats',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="accuracy-stats">Accuracy stats</H2>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
              {TRUST_STATS.map((t) => (
                <div key={t.stat} className="border border-border-card bg-panel px-[22px] py-6">
                  <div className="font-mono text-[32px] font-bold text-amber">{t.stat}</div>
                  <div className="mt-2 text-[13.5px] leading-[1.5] text-ink-soft">{t.label}</div>
                </div>
              ))}
            </div>
          </div>
        ),
      },
      {
        id: 'synthetic',
        label: 'Synthetic',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="synthetic">Synthetic validation</H2>
            <Body>
              Ten programmatic before/after pairs with known ground truth, run against your own key:
            </Body>
            <Terminal>
              <Prompt />npx tsx scripts/validate-ai.ts
            </Terminal>
          </div>
        ),
      },
      {
        id: 'real-world',
        label: 'Real-world',
        node: (
          <div className="flex flex-col gap-3.5">
            <H2 id="real-world">Real-world validation</H2>
            <Body>
              Validates against actual GitHub PRs through the full clone → render → diff → analyze
              pipeline:
            </Body>
            <Terminal>
              <Prompt />npx tsx scripts/validate-ai-real.ts --repo shadcn-ui/ui --pr 1234
            </Terminal>
          </div>
        ),
      },
    ],
  },
};

export function getDocContent(slug: string): DocContent | undefined {
  return DOC_CONTENT[slug];
}
