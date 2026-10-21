// Developer-focused documentation store for Frontguard (/docs).
// Keeps all 37 article slugs, navigation groups, and verified contract boundaries intact
// while providing copy-ready code examples, parameter tables, and practical recipes.

export type Article = {
  id: string
  label: string
  section: string
  toc: string[]
  html: string
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

const MONO = "'JetBrains Mono', monospace"

const h1 = (text: string) =>
  `<h1 style="font-size: 40px; letter-spacing: -0.035em; font-weight: 700; color: #f5f1ea; margin: 0 0 16px; line-height: 1.08;">${text}</h1>`

const lead = (text: string) =>
  `<p style="font-size: 17.5px; line-height: 1.65; color: #e2dbd1; margin: 0 0 24px; font-weight: 400;">${text}</p>`

const h2 = (text: string) =>
  `<h2 id="${slugifyHeading(text)}" style="scroll-margin-top: 84px; font-size: 24px; letter-spacing: -0.02em; font-weight: 600; color: #f5f1ea; margin: 44px 0 16px; padding-bottom: 10px; border-bottom: 1px solid #211e1b;">${text}</h2>`

const h3 = (text: string) =>
  `<h3 style="font-size: 17px; letter-spacing: -0.01em; font-weight: 600; color: #f5f1ea; margin: 28px 0 10px;">${text}</h3>`

const p = (text: string) =>
  `<p style="font-size: 15.5px; line-height: 1.7; color: #c8c0b6; margin: 0 0 16px;">${text}</p>`

const ic = (text: string) =>
  `<code style="font-family: ${MONO}; font-size: 13px; color: #f5f1ea; background: #191714; border: 1px solid #2c2723; padding: 2px 6px; border-radius: 3px;">${text}</code>`

const a = (href: string, text: string) =>
  `<a href="${href}" style="color: #e8862e; text-decoration: underline; text-underline-offset: 3px;">${text}</a>`

const code = (label: string, body: string) =>
  `<div style="background: #11100e; border: 1px solid #2a2622; border-radius: 6px; overflow: hidden; margin-bottom: 24px;"><div style="border-bottom: 1px solid #211e1b; background: #161412; padding: 8px 16px; font-family: ${MONO}; font-size: 12px; color: #a89f94; letter-spacing: 0.03em;">${label}</div><pre style="margin: 0; padding: 16px 20px; font-family: ${MONO}; font-size: 13px; line-height: 1.75; color: #e6dfd5; overflow-x: auto;">${body}</pre></div>`

const note = (label: string, body: string) =>
  `<div style="background: #1a130b; border: 1px solid rgba(232,134,46,0.38); border-radius: 4px; margin-bottom: 24px; padding: 16px 18px;"><p style="font-size: 14.5px; line-height: 1.65; color: #e6e0d6; margin: 0;"><strong style="font-family: ${MONO}; font-size: 12px; letter-spacing: 0.04em; color: #e8862e; margin-right: 6px;">${label}</strong> ${body}</p></div>`

const tip = (label: string, body: string) =>
  `<div style="background: #0f1d15; border: 1px solid rgba(79,180,119,0.38); border-radius: 4px; margin-bottom: 24px; padding: 16px 18px;"><p style="font-size: 14.5px; line-height: 1.65; color: #dcefe3; margin: 0;"><strong style="font-family: ${MONO}; font-size: 12px; letter-spacing: 0.04em; color: #4fb477; margin-right: 6px;">${label}</strong> ${body}</p></div>`

const list = (items: string[]) =>
  `<ul style="font-size: 15.5px; line-height: 1.7; color: #c8c0b6; margin: 0 0 24px; padding-left: 22px;">${items.map((item) => `<li style="margin-bottom: 8px;">${item}</li>`).join('')}</ul>`

const table = (headers: string[], rows: string[][]) =>
  `<div style="overflow-x: auto; margin: 0 0 28px;"><table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; border: 1px solid #2a2622; background: #121110;"><thead><tr style="background: #171513; border-bottom: 1px solid #2a2622;">${headers.map((h) => `<th style="padding: 11px 14px; font-family: ${MONO}; font-size: 12px; color: #e8862e; font-weight: 600; letter-spacing: 0.04em; white-space: nowrap;">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((row, idx) => `<tr style="border-bottom: ${idx === rows.length - 1 ? 'none' : '1px solid #1f1c19'};">${row.map((cell, cIdx) => `<td style="padding: 11px 14px; color: ${cIdx === 0 ? '#f5f1ea' : '#c8c0b6'}; font-family: ${cIdx === 0 ? MONO : 'inherit'}; font-size: ${cIdx === 0 ? '12.5px' : '14px'}; line-height: 1.55; vertical-align: top;">${cIdx === 0 && !cell.includes('<code') ? `<code style="font-family: inherit; font-size: inherit; color: inherit; background: transparent; border: none; padding: 0;">${cell}</code>` : cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`

const steps = (items: { title: string; body: string }[]) =>
  `<div style="display: grid; gap: 16px; margin: 0 0 28px;">${items
    .map(
      (item, i) =>
        `<div style="border: 1px solid #26221e; background: #121110; border-radius: 6px; padding: 18px 20px;"><div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;"><span style="font-family: ${MONO}; font-size: 12px; font-weight: 700; color: #0d0c0b; background: #e8862e; padding: 2px 8px; border-radius: 3px;">STEP 0${i + 1}</span><span style="font-size: 16px; font-weight: 600; color: #f5f1ea;">${item.title}</span></div><div style="font-size: 15px; line-height: 1.65; color: #c8c0b6;">${item.body}</div></div>`,
    )
    .join('')}</div>`

const cards = (
  items: { tag: string; title: string; desc: string; href?: string; cta?: string }[],
) =>
  `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; margin: 0 0 28px;">${items
    .map(
      (c) =>
        `<div style="border: 1px solid #2a2622; background: #131210; border-radius: 6px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between;"><div><div style="font-family: ${MONO}; font-size: 12px; color: #e8862e; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 6px;">${c.tag}</div><div style="font-size: 16px; font-weight: 600; color: #f5f1ea; margin-bottom: 8px;">${c.title}</div><p style="font-size: 13.5px; line-height: 1.55; color: #c8c0b6; margin: 0 0 12px;">${c.desc}</p></div>${c.href ? `<div><a href="${c.href}" style="font-family: ${MONO}; font-size: 12px; color: #e8862e; text-decoration: none;">${c.cta ?? 'Read guide →'}</a></div>` : ''}</div>`,
    )
    .join('')}</div>`

const makeArticle = (
  id: string,
  label: string,
  section: string,
  toc: string[],
  body: string,
  title = label,
): Article => ({ id, label, section, toc, html: `${h1(title)}${body}` })

const localCliNotice = note(
  'SUPPORTED PATH.',
  'The local MIT-licensed CLI runs without a Frontguard account. Hosted and marketplace surfaces remain pre-release.',
)

const cloudNotice = note(
  'CLOUD API URL REQUIRED.',
  'There is no working hosted default or supported production self-host quick start. Use cloud-dependent source only with a deployment you operate and have independently verified.',
)

const integrationNotice = note(
  'PRE-RELEASE.',
  'This repository contains integration source, not a verified marketplace or hosted customer journey. Do not rely on it for production delivery.',
)

const comparisonNotice = note(
  'SCOPE.',
  'This comparison describes the implemented local CLI. Frontguard hosted review, billing, and team workflows are not generally available.',
)

export const articles: Article[] = [
  // ==========================================================================
  // 1. GETTING STARTED: index
  // ==========================================================================
  makeArticle(
    'index',
    'Getting Started',
    'Getting started',
    ['Supported path', 'Choose your workflow', 'Quick start', 'Baseline contract'],
    `${localCliNotice}${lead(
      'Frontguard is a local-first visual regression testing toolkit for frontend teams. It renders your web pages or Storybook components in real browsers, compares pixels and perceptual similarity (SSIM, Chroma-SSIM, CW-SSIM) against reviewed baselines stored on a dedicated git orphan branch, and writes an interactive offline HTML workbench.',
    )}${h2('Supported path')}${p(
      'Frontguard renders configured pages, compares screenshots against reviewed baselines, and writes console, JSON, and HTML evidence. Optional model-assisted analysis runs only when you configure a provider.',
    )}${table(
      ['Stage', 'What Runs Locally', 'Output / Artifact'],
      [
        [
          '1. Discover',
          'Reads explicit routes from frontguard.config.ts, crawls your live app sitemap, or queries Storybook /index.json.',
          'Normalized route × viewport × browser matrix',
        ],
        [
          '2. Render',
          'Launches a bounded Playwright worker pool with optional anti-flake controls (waitForStability, freezeTime, seedRandom, blockUrls, redactSensitive).',
          'Deterministic PNG captures + DOM bounding boxes',
        ],
        [
          '3. Compare',
          'Runs Pixelmatch with anti-aliasing filters plus Luminance SSIM, Chroma-SSIM (YCbCr), and Wavelet CW-SSIM.',
          '8-connected spatial diff clusters mapped to DOM selectors (cluster.targetSelector)',
        ],
        [
          '4. Analyze (Optional)',
          'If BYOK AI is configured (OpenAI, Anthropic, Gemini, or custom baseUrl), classifies diffs and optionally tests candidate CSS patches in a sandbox.',
          'Advisory classification, confidence score, and verified/unverified patch status',
        ],
        [
          '5. Report & Store',
          'Stores approved baselines on the frontguard-baselines git orphan branch and writes local inspection artifacts.',
          'Console summary, frontguard-report/report.html (4-mode workbench), and JSON output',
        ],
      ],
    )}${h2('Choose your workflow')}${cards([
      {
        tag: 'WORKFLOW 01 · FULL-APP CLI',
        title: '@frontguard/cli',
        desc: 'Crawl or list routes in frontguard.config.ts, capture multi-viewport baselines onto the frontguard-baselines git orphan branch, and gate PRs in CI.',
        href: '/docs/quick-start',
        cta: 'CLI Quick Start →',
      },
      {
        tag: 'WORKFLOW 02 · IN-TEST ASSERTIONS',
        title: '@frontguard/playwright',
        desc: 'Drop visualTest(page, name, options) directly inside your existing Playwright .spec.ts tests after complex login flows, form fills, or modal interactions.',
        href: '/docs/playwright/index',
        cta: 'Playwright Guide →',
      },
      {
        tag: 'WORKFLOW 03 · CODING AGENTS',
        title: '@frontguard/mcp',
        desc: 'Connect Claude Code, Cursor, or Windsurf to your local frontguard-report/report.json over stdio JSON-RPC to inspect diff clusters and DOM selectors.',
        href: '/docs/integrations/mcp',
        cta: 'MCP Server Guide →',
      },
    ])}${h2('Quick start')}${p(
      'Run these four steps in any Node.js 22+ git repository to initialize Frontguard, capture reviewed baselines, and run your first comparison:',
    )}${code(
      'terminal - setup',
      `$ npx -p @frontguard/cli frontguard init --ci`,
    )}${p(
      "In a separate app terminal, use your project's dev-server command and leave it running. The command below is one example; wait for the baseUrl generated in frontguard.config.ts to respond.",
    )}${code('app terminal - leave running', `$ npm run dev`)}${p(
      'Then use a Frontguard terminal; these commands read baseUrl from the generated config.',
    )}${code(
      'Frontguard terminal',
      `$ npx -p @frontguard/cli frontguard doctor
$ npx -p @frontguard/cli frontguard update-baselines --confirm-baselines
$ git push origin frontguard-baselines
$ npx -p @frontguard/cli frontguard run`,
    )}${h2('Baseline contract')}${p(
      'Ordinary runs never accept CLI screenshots. Review captures first, then use frontguard update-baselines --confirm-baselines explicitly. Unaccepted new pages and regressions exit non-zero.',
    )}${table(
      ['Exit Code', 'Meaning', 'When It Happens'],
      [
        ['0', 'Passed / Warning', 'All route comparisons matched within threshold (or produced non-blocking warnings).'],
        ['1', 'Regression / Unaccepted New Page', 'One or more routes exceeded threshold or had no accepted baseline on frontguard-baselines.'],
        ['2', 'Tool / Configuration Error', 'Target server unreachable, invalid config, missing browser binary, or zero routes discovered.'],
      ],
    )}`,
    'Frontguard',
  ),

  // ==========================================================================
  // 2. GETTING STARTED: installation
  // ==========================================================================
  makeArticle(
    'installation',
    'Installation',
    'Getting started',
    ['CLI', 'Playwright package', 'Prerequisites', 'Verify with doctor'],
    `${localCliNotice}${lead(
      'Use Node.js 22 or newer. Install the package that matches the workflow you intend to run: @frontguard/cli for standalone route/Storybook pipelines, or @frontguard/playwright for assertions inside existing Playwright test suites.',
    )}${h2('CLI')}${p(
      'Install @frontguard/cli as a devDependency in your project and install the Playwright Chromium browser binary used for headless rendering:',
    )}${code(
      'terminal',
      `$ npm install -D @frontguard/cli
$ npm install -D @frontguard/playwright
$ npx -p @frontguard/cli playwright install --with-deps chromium
$ npx -p @frontguard/cli frontguard doctor`,
    )}${tip(
      'LINUX vs MACOS.',
      'The --with-deps flag installs required shared libraries on Ubuntu/Debian CI runners. On macOS, Playwright prints a benign note and installs the Chromium binary cleanly.',
    )}${h2('Playwright package')}${p(
      'The CLI and Playwright package use different baseline stores and acceptance behavior; do not treat them as interchangeable.',
    )}${table(
      ['Package', 'Primary Use Case', 'Default Baseline Location', 'How Baselines Are Updated'],
      [
        [
          '@frontguard/cli',
          'Standalone multi-route & multi-viewport visual regression runner with HTML workbench, git orphan storage, and plugins.',
          'frontguard-baselines git orphan branch',
          'Explicitly run frontguard update-baselines --confirm-baselines (ordinary runs never overwrite baselines).',
        ],
        [
          '@frontguard/playwright',
          'In-test visualTest(page, name) helper called inside existing @playwright/test spec files.',
          '__visual_baselines__/ directory in your working tree',
          'Creates missing baseline on first run (isNewBaseline: true); update existing baselines with FRONTGUARD_UPDATE=1.',
        ],
        [
          '@frontguard/mcp',
          '7-tool Model Context Protocol server for Claude Code, Cursor, and Windsurf.',
          'Reads ./frontguard-report/report.json locally',
          'MCP promotion is refused in local-report mode. A human runs frontguard update-baselines --confirm-baselines. Cloud approveRun is not a production path.',
        ],
      ],
    )}${h2('Prerequisites')}${list([
      '<strong>Node.js 22+</strong>: Required by the CLI runtime and worker pool.',
      '<strong>Git repository</strong>: Required when storing baselines on the ' +
        ic('frontguard-baselines') +
        ' orphan branch. Ensure your working tree is clean before running ' +
        ic('frontguard update-baselines --confirm-baselines') +
        ' for the first time.',
      '<strong>Playwright Chromium</strong>: Installed once per machine or CI cache via ' +
        ic('npx -p @frontguard/cli playwright install --with-deps chromium') +
        '.',
    ])}${h2('Verify with doctor')}${p(
      'Run frontguard doctor at any time to verify your Node.js runtime, Playwright browser binaries, frontguard.config.ts syntax, and git repository state:',
    )}${code(
      'terminal',
      `$ npx -p @frontguard/cli frontguard doctor

  frontguard doctor
  ✓ Node.js v22.x (>= 22.0.0)
  ✓ Playwright Chromium installed
  ✓ Config valid (frontguard.config.ts)
  ✓ Git repository clean (origin remote configured)`,
    )}`,
  ),

  // ==========================================================================
  // 3. GETTING STARTED: quick-start
  // ==========================================================================
  makeArticle(
    'quick-start',
    'Quick Start',
    'Getting started',
    ['Initialize', 'Accept baselines', 'Compare', 'Inspect the HTML workbench'],
    `${lead(
      'Initialize first, then run the app and Frontguard in separate terminals. This five-step walkthrough sets up deterministic visual regression testing in any web project.',
    )}${h2('Initialize')}${steps([
      {
        title: 'Generate frontguard.config.ts',
        body: 'Run init at the root of your git repository. Frontguard detects your framework (Next.js, Remix, Nuxt, SvelteKit, Astro, Vite) and writes a starter frontguard.config.ts and .gitignore entry.',
      },
      {
        title: 'Review configured routes & commit',
        body: 'Open frontguard.config.ts and confirm the routes array matches real pages in your app. Commit frontguard.config.ts and .gitignore so your git working tree is clean before creating the frontguard-baselines orphan branch.',
      },
    ])}${code(
      'terminal - setup',
      `$ npx -p @frontguard/cli frontguard init
$ git add frontguard.config.ts .gitignore && git commit -m "Add Frontguard"`,
    )}${h2('Accept baselines')}${p(
      "In the app terminal, use your project's dev-server command and leave it running. The command below is one example; wait for the generated config baseUrl to respond.",
    )}${code('app terminal - leave running', `$ npm run dev`)}${p(
      'In the Frontguard terminal, use the generated config rather than overriding its URL. Run doctor, capture initial baselines with update-baselines, and push the orphan branch if CI will compare against it:',
    )}${code(
      'Frontguard terminal',
      `$ npx -p @frontguard/cli frontguard doctor
$ npx -p @frontguard/cli frontguard update-baselines --confirm-baselines
$ git push origin frontguard-baselines
$ npx -p @frontguard/cli frontguard run`,
    )}${h2('Compare')}${p(
      'Exit code 0 means comparisons passed or warned, 1 means regressions or unaccepted new screenshots, and 2 means no comparisons or a tool error.',
    )}${p(
      'To test how Frontguard catches a real regression, change a button color or heading margin in your app while npm run dev is running, then re-run frontguard run:',
    )}${code(
      'terminal - catching a regression',
      `$ npx -p @frontguard/cli frontguard run

  ✘ /pricing @ 1440px (chromium): 1.84% changed (SSIM: 0.942, Chroma-SSIM: 0.610)
    Cluster #1: (100, 200) 120×40px -> targetSelector: [data-testid="upgrade-btn"]
  Report written to ./frontguard-report/report.html (exit code 1)`,
    )}${h2('Inspect the HTML workbench')}${p(
      'Open ./frontguard-report/report.html in a browser. To serve it over HTTP, run python3 -m http.server 8080 --directory ./frontguard-report and visit http://localhost:8080/report.html. Keep the images/ directory alongside report.html when moving or sharing the report; the HTML normally links to those PNG files.',
    )}${table(
      ['Shortcut', 'Action', 'Practical Use'],
      [
        ['1 / 2 / 3 / 4', 'Switch comparison view mode', 'Toggle Side-by-Side (1), Interactive Swipe Curtain (2), Onion Skin Opacity (3), or Diff Focus (4).'],
        ['b', 'Toggle spatial cluster bounding boxes', 'Highlights 8-connected diff clusters and displays their grounded DOM selector (targetSelector).'],
        ['j / k', 'Next / Previous route', 'Step rapidly through failed and warned routes without touching the mouse.'],
        ['/', 'Focus route search & status filter', 'Filter by route path (/pricing), viewport (375px), or status (Regressions, Warnings, Passed).'],
      ],
    )}`,
  ),

  // ==========================================================================
  // 4. REFERENCE: cli/index
  // ==========================================================================
  makeArticle(
    'cli/index',
    'CLI Overview',
    'Reference',
    ['Pipeline', 'Artifacts', 'Baseline storage', 'Next step'],
    `${lead(
      'The CLI discovers routes, renders configured browser and viewport combinations, compares pixels, optionally requests model assistance, and writes reports.',
    )}${h2('Pipeline')}${p(
      'When you execute frontguard run, the CLI orchestrates five deterministic stages in-process:',
    )}${steps([
      {
        title: 'Route & Story Discovery',
        body: 'Combines explicit routes in frontguard.config.ts, automatic crawling from discover.startUrl (up to maxDepth), and Storybook story index discovery (storybook.url). When smartRender: true is enabled, the dependency graph filters routes to those affected by modified source files. A deleted file, a public or static asset, an image or font with no import edge, an unresolved relative import, or a truncated graph renders every route and says why.',
      },
      {
        title: 'Hermetic Browser Rendering',
        body: 'Spawns a bounded Playwright worker pool across configured browsers (chromium, firefox, webkit) and viewports (e.g., 375, 768, 1440). Applies optional anti-flake controls (freezeTime, seedRandom, blockUrls, waitForStability, redactSensitive) and executes per-route actions before capturing the PNG and live DOM element bounding boxes.',
      },
      {
        title: 'Perceptual Diff & Spatial Clustering',
        body: 'Runs Pixelmatch with YIQ anti-aliasing detection alongside structural similarity (SSIM), Chroma-SSIM (YCbCr color shift sensitivity), and complex wavelet CW-SSIM (subpixel shift tolerance). Connected diff pixels are grouped into 8-connected bounding boxes and intersected with DOM rects to report cluster.targetSelector.',
      },
      {
        title: 'Optional BYOK Vision Triage & Fix Sandbox',
        body: 'When ai is configured, sends cropped Set-of-Mark evidence to OpenAI, Anthropic, Google Gemini, or a custom OpenAI-compatible baseUrl. If generateFixes and verifyFixes are enabled, tests candidate CSS patches in an isolated Playwright or Daytona sandbox.',
      },
      {
        title: 'Artifact Emission & Exit Gate',
        body: 'Writes the interactive HTML workbench, optional JSON/JUnit reports, and exits with a deterministic status code (0, 1, or 2).',
      },
    ])}${h2('Artifacts')}${list([
      'Baselines live on the frontguard-baselines orphan branch.',
      'JSON mode writes machine-readable output to stdout.',
      'The HTML report keeps baseline, current, and diff evidence on disk.',
    ])}${table(
      ['Artifact / Mode', 'Flag / Config', 'Contents & Purpose'],
      [
        [
          'Console Summary',
          'Default (stdout)',
          'Per-route pass/warn/fail table, diff ratios, SSIM scores, cluster selectors, and AI explanations.',
        ],
        [
          'Interactive HTML Workbench',
          'frontguard-report/report.html',
          'Self-contained offline viewer with Side-by-Side, Swipe Curtain, Onion Skin, Diff Focus, and cluster overlays.',
        ],
        [
          'Machine-Readable JSON',
          '--output json',
          'Complete structured run telemetry emitted to stdout (pipe to ./frontguard-result.json or consume via @frontguard/mcp).',
        ],
      ],
    )}${h2('Baseline storage')}${p(
      'Instead of committing megabytes of PNG screenshots onto your main branch or requiring a paid SaaS bucket, Frontguard commits approved baselines to an isolated git orphan branch named frontguard-baselines. Unchanged screenshots are deduplicated by SHA-256 hash so git history stays lean.',
    )}${h2('Next step')}${p(
      'Continue with ' +
        a('/docs/cli/commands', 'CLI Commands') +
        ' for the supported command and exit-code contract, or ' +
        a('/docs/cli/configuration', 'Configuration') +
        ' for full frontguard.config.ts recipes.',
    )}`,
  ),

  // ==========================================================================
  // 5. REFERENCE: cli/commands
  // ==========================================================================
  makeArticle(
    'cli/commands',
    'CLI Commands',
    'Reference',
    ['Commands', 'Run flags reference', 'Threshold units', 'Exit codes', 'Monitoring'],
    `${lead(
      'The supported command surface includes run, init, update-baselines, doctor, guide, monitor, fix-pattern commands, and plugin subcommands.',
    )}${h2('Commands')}${table(
      ['Command', 'Description', 'Common Example'],
      [
        [
          'frontguard run',
          'Render configured routes/viewports and compare against accepted baselines on frontguard-baselines.',
          'frontguard run --wait-for-stability --redact-sensitive',
        ],
        [
          'frontguard update-baselines --confirm-baselines',
          'Capture current renders and commit them as accepted baselines on the frontguard-baselines orphan branch.',
          'frontguard update-baselines --confirm-baselines --url http://localhost:3000',
        ],
        [
          'frontguard init [--ci] [--yes]',
          'Detect framework, generate frontguard.config.ts, and optionally scaffold a comparison-only GitHub Actions workflow.',
          'frontguard init --ci --yes',
        ],
        [
          'frontguard doctor',
          'Diagnose Node.js version, Playwright browser binaries, configuration schema, and git working tree cleanliness.',
          'frontguard doctor',
        ],
        [
          'frontguard guide [topic] [--json]',
          'Print offline developer & coding-agent reference guides (setup, diffing, mcp, playwright, ci).',
          'frontguard guide diffing --json',
        ],
        [
          'frontguard monitor',
          'Poll or run a one-shot visual check against a live production/staging URL and record history under .frontguard/monitor-history.',
          'frontguard monitor --url https://example.com --threshold 0.05 --once',
        ],
        [
          'frontguard accept-fix &lt;id&gt;',
          'Record a candidate CSS fix as accepted in the local .frontguard/fix-patterns.json database.',
          'frontguard accept-fix 1',
        ],
        [
          'frontguard reject-fix &lt;id&gt;',
          'Record a candidate CSS fix as rejected (negative signal in .frontguard/fix-patterns.json).',
          'frontguard reject-fix 1',
        ],
        [
          'frontguard export-patterns',
          'Export the local fix-pattern database as JSON for sharing across repositories.',
          'frontguard export-patterns > patterns.json',
        ],
        [
          'frontguard plugin &lt;subcmd&gt;',
          'Install, uninstall, or list Frontguard lifecycle plugins (install, uninstall, list).',
          'frontguard plugin list',
        ],
      ],
    )}${code(
      'terminal',
      `$ frontguard run --url http://localhost:3000 --threshold 0.01 --wait-for-stability --redact-sensitive --color-scheme dark --freeze-time [timestamp] --seed-random [seed] --block-urls &lt;patterns...&gt;
$ frontguard update-baselines --confirm-baselines --url http://localhost:3000
$ frontguard doctor
$ frontguard guide [topic] --json
$ frontguard monitor --url https://example.com --threshold 0.05
$ frontguard monitor --history`,
    )}${h2('Run flags reference')}${p(
      'Use frontguard guide [topic] (topics: setup, diffing, mcp, playwright, ci) with --json for offline CLI and coding-agent reference output. Capture and anti-flake flags include --wait-for-stability for multi-frame render convergence, --redact-sensitive to mask sensitive inputs and scrub DOM snapshots before capture, --color-scheme &lt;scheme&gt; (light or dark) to emulate prefers-color-scheme, --freeze-time [timestamp] (epoch ms or ISO 8601 date string), --seed-random [seed] for deterministic Math.random() seeding, and --block-urls &lt;patterns...&gt; to abort third-party analytics or ad requests.',
    )}${table(
      ['Flag', 'Type / Values', 'Description'],
      [
        ['--url &lt;url&gt;', 'string', 'Override baseUrl from frontguard.config.ts (useful for staging or preview URLs).'],
        ['--threshold &lt;ratio&gt;', 'number (0-1)', 'Maximum allowed changed-pixel ratio (e.g., 0.01 = 1%).'],
        ['--viewports &lt;list&gt;', 'numbers', 'Override viewport widths with one comma-separated list (e.g., --viewports 375,768,1440).'],
        ['--browsers &lt;list&gt;', 'chromium | firefox | webkit', 'Browsers to render across.'],
        ['--color-scheme &lt;scheme&gt;', 'light | dark', 'Emulate prefers-color-scheme before rendering. Compares against the same baseline file as the default scheme until named capture modes exist, and warns when the stored scheme differs. The warning does not change the exit code.'],
        ['--wait-for-stability', 'boolean', 'Poll consecutive animation frames until pixel variance converges (< 0.05%) before capture.'],
        ['--redact-sensitive', 'boolean', 'Mask password/email/tel inputs and [data-frontguard-redact] elements and scrub DOM snapshots prior to capture.'],
        ['--freeze-time [timestamp]', 'boolean | number | ISO string', 'Lock page.clock and Date.now() to a fixed epoch ms or ISO 8601 timestamp (e.g., 2026-01-01T00:00:00Z).'],
        ['--seed-random [seed]', 'boolean | number', 'Inject a deterministic Mulberry32 PRNG overriding Math.random() (default seed: 42).'],
        ['--block-urls &lt;patterns...&gt;', 'string[]', 'Abort matching third-party network requests (ads, analytics, live chat widgets) during page load.'],
        ['--output &lt;format&gt;', 'console | json', 'Emit human-readable console output or structured JSON to stdout.'],
        ['--docker', 'boolean', 'Execute rendering inside the local frontguard/render Docker container.'],
      ],
    )}${h2('Threshold units')}${p(
      'Changed-pixel ratio (0-1; 0.01 = 1%). Legacy values over 1 are deprecated. The monitor alert threshold uses the same ratio convention: 0.05 = 5%.',
    )}${h2('Exit codes')}${list([
      '0: comparisons passed or produced warnings only.',
      '1: regressions or unaccepted new screenshots.',
      '2: no comparisons or any tool error; errors take precedence over regressions.',
    ])}${h2('Monitoring')}${p(
      'The local monitor command records run history under .frontguard/monitor-history by default. Webhook delivery is best-effort; no managed cloud scheduler is generally available.',
    )}`,
  ),

  // ==========================================================================
  // 6. REFERENCE: cli/configuration
  // ==========================================================================
  makeArticle(
    'cli/configuration',
    'Configuration',
    'Reference',
    ['Minimal configuration', 'Configuration reference', 'Practical recipes', 'Optional controls'],
    `${lead(
      'Configuration lives in frontguard.config.ts at your project root. Threshold values are fractions from 0 to 1 (for example, 0.01 = 1% changed pixels).',
    )}${h2('Minimal configuration')}${p(
      'Below is a production-ready frontguard.config.ts combining explicit routes, pre-capture UI actions, multi-viewport rendering, deterministic anti-flake gates, and optional BYOK AI:',
    )}${code(
      'frontguard.config.ts',
      `export default {
  version: 1,
  baseUrl: 'http://localhost:3000',
  routes: [
    '/',
    {
      path: '/pricing',
      threshold: 0.005, // Stricter 0.5% threshold on pricing page
      actions: [
        { type: 'waitForSelector', selector: '[data-ready]' },
        { type: 'click', selector: '[data-billing="annual"]' },
      ],
    },
  ],
  viewports: [375, 768, 1440],
  browsers: ['chromium'],
  colorScheme: 'dark',
  waitForStability: true,
  redactSensitive: true,
  freezeTime: '2026-01-01T00:00:00Z',
  seedRandom: 42,
  blockUrls: ['*google-analytics.com*', '*intercom.io*'],
  threshold: 0.01,
  ai: {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    // Or provider: 'openai' ('gpt-4.1-mini', 'gpt-4o') with optional baseUrl for OpenRouter / Ollama / vLLM,
    // or provider: 'anthropic' ('claude-sonnet-4-20250514')
  },
  ignore: [
    { selector: '.live- visitor-counter' },
  ],
  smartRender: true,
  workers: 4,
  pageTimeout: 30000,
  maxHeight: 5000,
  outputDir: './frontguard-report',
}`,
    )}${h2('Configuration reference')}${table(
      ['Property', 'Type', 'Default', 'Description'],
      [
        ['version', '1', '1', 'Config schema version (required).'],
        ['baseUrl', 'string', "'http://localhost:3000'", 'Root URL of the application under test.'],
        ['routes', 'Array&lt;string | RouteConfig&gt;', 'undefined', 'Explicit route paths or route objects with custom actions, viewports, and threshold overrides.'],
        ['discover', '{ startUrl, maxDepth, exclude }', 'undefined', 'Zero-config route crawler settings when routes is omitted.'],
        ['storybook', '{ url, stories?, exclude? }', 'undefined', 'Discover and render stories from a running Storybook 7/8 server.'],
        ['viewports', 'number[]', '[375, 768, 1440]', 'Viewport widths in CSS pixels.'],
        ['browsers', "Array&lt;'chromium'|'firefox'|'webkit'&gt;", "['chromium']", 'Playwright browser engines to test.'],
        ['threshold', 'number (0-1)', '0.1', 'Changed-pixel ratio threshold (0.01 = 1%). Lower for stricter layout checks.'],
        ['ssimThreshold', 'number (0-1)', '0.98', 'SSIM fallback cutoff when ssimFallback is enabled.'],
        ['colorScheme', "'light' | 'dark'", 'undefined', 'Emulate prefers-color-scheme during capture. Uses the same baseline file as the default scheme until named capture modes exist, and warns when the stored scheme differs. The warning does not change the exit code.'],
        ['waitForStability', 'boolean', 'false', 'Wait for consecutive animation frames to converge before taking the screenshot.'],
        ['redactSensitive', 'boolean', 'false', 'Mask password/email/tel inputs and [data-frontguard-redact] nodes and scrub DOM snapshots.'],
        ['freezeTime', 'boolean | number | string', 'undefined', 'Freeze page.clock and Date.now() to a fixed epoch ms or ISO 8601 date string.'],
        ['seedRandom', 'boolean | number', 'undefined', 'Override Math.random() with a seeded Mulberry32 PRNG.'],
        ['blockUrls', 'string[]', '[]', 'Abort third-party URLs matching glob/substring patterns before capture.'],
        ['ignore', 'Array&lt;{ selector: string }&gt;', '[]', 'Hide or mask volatile DOM elements (e.g., live tickers, video players) during capture.'],
        ['ai', '{ provider, model?, baseUrl? }', 'undefined', 'Optional BYOK vision triage (openai, anthropic, gemini).'],
        ['plugins', 'FrontguardPlugin[]', '[]', 'Registered 9-hook lifecycle plugins (accessibility, performance budgets, script inventory, custom).'],
        ['outputDir', 'string', "'./frontguard-report'", 'Directory for HTML and images. JSON output is written to stdout; redirect it to save a file.'],
      ],
    )}${h2('Practical recipes')}${h3('Recipe 1: Interacting with Modals, Tabs & Auth Forms Before Capture')}${p(
      'Each entry in routes can specify an actions array executed sequentially by Playwright before stability checks and screenshot capture:',
    )}${code(
      'frontguard.config.ts: per-route actions',
      `routes: [
  {
    path: '/settings',
    actions: [
      { type: 'fill', selector: 'input[name="search"]', value: 'billing' },
      { type: 'click', selector: '[data-testid="open-api-key-modal"]' },
      { type: 'waitForSelector', selector: '[role="dialog"]' },
      { type: 'wait', ms: 150 },
    ],
  },
]`,
    )}${h3('Recipe 2: Eliminating Third-Party & Time-Based Flake')}${p(
      'Combine freezeTime, seedRandom, blockUrls, and ignore selectors so charts, relative timestamps ("2 minutes ago"), and analytics banners render identically on every run:',
    )}${code(
      'frontguard.config.ts: hermetic anti-flake setup',
      `export default {
  version: 1,
  baseUrl: 'http://localhost:3000',
  waitForStability: true,
  freezeTime: '2026-01-01T00:00:00Z',
  seedRandom: 42,
  blockUrls: [
    '*googletagmanager.com*',
    '*intercom.io*',
    '*segment.com*',
    '*doubleclick.net*',
  ],
  ignore: [
    { selector: '[data-testid="live- latency-sparkline"]' },
  ],
}`,
    )}${h2('Optional controls')}${p(
      'Optional controls include colorScheme (light or dark), waitForStability for multi-frame layout convergence, redactSensitive for masking password/email/token fields and scrubbing DOM snapshots, freezeTime (boolean, epoch ms number, or ISO 8601 date string), seedRandom (boolean or numeric PRNG seed), blockUrls (URL glob or substring patterns to abort before rendering), per-route actions (click, hover, fill, press, waitForSelector, wait), masks, region-scoped Chroma-SSIM (YCbCr) and CW-SSIM cluster similarity with spatial cluster.targetSelector DOM attribution, configurable multi-render consensus, telemetry opt-in, and multi-provider BYOK analysis (openai, anthropic, gemini, or custom baseUrl / FRONTGUARD_OPENAI_BASE_URL). Verify an option against the installed package version before adding it.',
    )}`,
  ),

  // ==========================================================================
  // 7. REFERENCE: playwright/index
  // ==========================================================================
  makeArticle(
    'playwright/index',
    'Playwright Plugin',
    'Reference',
    ['Behavior', 'Example', 'Baseline model', 'When to use Playwright vs CLI'],
    `${note(
      'SEPARATE BASELINE MODEL.',
      'The Playwright package stores files in __visual_baselines__ by default. Unlike ordinary CLI runs, visualTest creates a missing baseline and reports isNewBaseline: true.',
    )}${lead(
      '@frontguard/playwright lets you run perceptual visual regression assertions directly inside your existing @playwright/test suites: right after complex multi-step user journeys, authenticated session setups, or mocked network responses.',
    )}${h2('Behavior')}${p(
      'When you call visualTest(page, name, options) inside a Playwright test, Frontguard captures the page (or a specific component via selector), applies any requested anti-flake overrides (freezeTime, seedRandom, blockUrls, waitForStable, redactSensitive), and compares the capture against __visual_baselines__/&lt;name&gt;-baseline.png using Pixelmatch + SSIM + 8-connected spatial diff clustering.',
    )}${h2('Example')}${code(
      'visual.spec.ts',
      `import { test, expect } from '@playwright/test'
import { visualTest } from '@frontguard/playwright'

test('home', async ({ page }) =&gt; {
  await page.goto('/')
  const result = await visualTest(page, 'home')
  expect(result.passed).toBe(true)
})`,
    )}${h2('Baseline model')}${p(
      'Set FRONTGUARD_UPDATE=1 or pass update: true to replace Playwright-package baselines deliberately. Commit those baseline files according to your repository policy.',
    )}${code(
      'terminal: updating Playwright baselines',
      `# First run creates missing baselines in __visual_baselines__/ (isNewBaseline: true)
$ npx playwright test

# When a UI change is intentional, refresh baselines explicitly:
$ FRONTGUARD_UPDATE=1 npx playwright test`,
    )}${h2('When to use Playwright vs CLI')}${table(
      ['Scenario', 'Recommended Package', 'Why'],
      [
        [
          'Testing 10–100+ public or sitemap routes across 3 viewports',
          '@frontguard/cli',
          'Auto-discovers routes, runs a parallel worker pool, stores baselines on the frontguard-baselines orphan branch, and generates the 4-mode HTML workbench.',
        ],
        [
          'Testing complex stateful flows (checkout wizard, drag-and-drop, mocked GraphQL errors) already written in Playwright',
          '@frontguard/playwright',
          'Reuses your existing Playwright Page fixture, auth storageState, and page.route() mocks without duplicating setup in frontguard.config.ts.',
        ],
      ],
    )}`,
  ),

  // ==========================================================================
  // 8. REFERENCE: playwright/setup
  // ==========================================================================
  makeArticle(
    'playwright/setup',
    'Setup & Installation',
    'Reference',
    ['Install', 'Configure', 'Practical test recipes', 'Review'],
    `${lead(
      'Add @frontguard/playwright to any existing @playwright/test project in two commands and start asserting component and full-page visual stability.',
    )}${h2('Install')}${code(
      'terminal',
      `$ npm install -D @playwright/test @frontguard/playwright`,
    )}${h2('Configure')}${p(
      'Call visualTest after navigation. The package reuses the current Playwright page, captures a PNG, and writes baseline/current/diff files under the configured baselineDir.',
    )}${p(
      'Add actual and diff outputs to your .gitignore while committing accepted baseline PNGs so teammates and CI compare against the same reference images:',
    )}${code(
      '.gitignore',
      `# Commit __visual_baselines__/*-baseline.png, ignore transient failure artifacts:
__visual_baselines__/*-actual.png
__visual_baselines__/*-diff.png`,
    )}${h2('Practical test recipes')}${h3('Recipe 1: Component-Scoped Visual Assertion with Anti-Flake Locks')}${code(
      'tests/pricing-card.spec.ts',
      `import { test, expect } from '@playwright/test'
import { visualTest } from '@frontguard/playwright'

test('annual pricing card matches baseline without third-party noise', async ({ page }) =&gt; {
  await page.goto('/pricing')
  await page.getByRole('tab', { name: 'Annual' }).click()

  const result = await visualTest(page, 'pricing-annual-card', {
    selector: '[data-testid="pro-tier-card"]',
    threshold: 0.005,
    waitForStable: true,
    freezeTime: '2026-01-01T00:00:00Z',
    seedRandom: 42,
    blockUrls: ['*intercom.io*', '*googletagmanager.com*'],
    redactSensitive: true,
    captureAriaSnapshot: true,
  })

  expect(result.passed).toBe(true)
})`,
    )}${h2('Review')}${p(
      'A newly created Playwright baseline passes with isNewBaseline: true, so review and commit it rather than assuming an independent approval occurred.',
    )}`,
  ),

  // ==========================================================================
  // 9. REFERENCE: playwright/api
  // ==========================================================================
  makeArticle(
    'playwright/api',
    'API Reference',
    'Reference',
    ['Signature', 'Options', 'Result', 'Inspecting spatial clusters in tests'],
    `${lead(
      'Complete TypeScript API reference for visualTest(page, name, options), VisualTestOptions, and VisualTestResult in @frontguard/playwright.',
    )}${h2('Signature')}${code(
      'typescript',
      `visualTest(
  page: Page,
  name: string,
  options?: VisualTestOptions,
): Promise&lt;VisualTestResult&gt;`,
    )}${h2('Options')}${p(
      'Options include threshold, selector (component-scoped locator capture), fullPage, mask, maskRegions, redactSensitive, waitForStable, freezeTime (boolean, epoch ms number, or ISO 8601 date string), seedRandom (boolean or numeric PRNG seed), blockUrls (URL patterns to block during capture), captureAriaSnapshot (captures Playwright ARIA tree snapshot), optional AI (openai, anthropic, gemini, or custom baseUrl), baselineDir, and update. Threshold is the fraction of pixels that may differ (0-1).',
    )}${table(
      ['Option', 'Type', 'Default', 'Description'],
      [
        ['threshold', 'number (0-1)', '0.01', 'Fraction of pixels allowed to differ before passed becomes false (0.01 = 1%).'],
        ['selector', 'string', 'undefined', 'CSS selector to capture a specific component instead of the full viewport.'],
        ['fullPage', 'boolean', 'true', 'Capture the full scrollable page height (ignored when selector is set).'],
        ['waitForStable', 'boolean | { maxAttempts?: number, intervalMs?: number }', 'false', 'Wait for fonts, then compare consecutive captures using threshold. Defaults: maxAttempts 3, intervalMs 80.'],
        ['redactSensitive', 'boolean', 'false', 'Mask password/email/tel inputs and [data-frontguard-redact] elements before capture.'],
        ['freezeTime', 'boolean | number | string', 'undefined', 'Freeze page.clock and Date.now() via epoch ms or ISO 8601 string (e.g., "2026-01-01T00:00:00Z").'],
        ['seedRandom', 'boolean | number', 'undefined', 'Override Math.random() with a deterministic Mulberry32 PRNG (true uses seed 42).'],
        ['blockUrls', 'string[]', 'undefined', 'Abort matching network requests via page.route() during capture and clean up afterward.'],
        ['captureAriaSnapshot', 'boolean', 'false', 'Capture an accessibility ARIA role/label tree snapshot onto result.ariaSnapshot.'],
        ['mask', 'string[]', 'undefined', 'CSS selectors to cover with solid neutral boxes before screenshot capture.'],
        ['maskRegions', 'Array&lt;{ x, y, width, height }&gt;', 'undefined', 'Explicit pixel bounding boxes to mask out of comparison.'],
        ['ai', "boolean | { provider: 'openai'|'anthropic'|'gemini', model?, baseUrl? }", 'false', 'Run optional BYOK vision analysis when a diff exceeds threshold.'],
        ['baselineDir', 'string', "'__visual_baselines__'", 'Directory where baseline, actual, and diff PNGs are stored.'],
        ['update', 'boolean', 'process.env.FRONTGUARD_UPDATE === "1"', 'Overwrite the existing baseline PNG with the current capture.'],
      ],
    )}${h2('Result')}${p(
      'The result includes passed, diffPercentage, baselinePath, currentPath, optional diffPath, boolean settled when waitForStable is enabled, clusters with bbox/rawDiffPixels/targetSelector, optional ariaSnapshot and AI output, SSIM, and isNewBaseline. Compare the returned result in your test; the function does not call a Playwright assertion for you.',
    )}${table(
      ['Field', 'Type', 'Description'],
      [
        ['passed', 'boolean', 'True if diffPercentage <= threshold (or if a new baseline was created).'],
        ['diffPercentage', 'number (0-1)', 'Ratio of changed pixels to total pixels (0.015 = 1.5%).'],
        ['ssim', 'number (0-1)', 'Structural similarity score between baseline and current image (1.0 = identical).'],
        ['isNewBaseline', 'boolean', 'True when no prior baseline existed and a new baseline PNG was written.'],
        ['baselinePath', 'string', 'File path to the baseline PNG.'],
        ['currentPath', 'string', 'File path to the current PNG.'],
        ['diffPath', 'string | undefined', 'File path to the diff PNG when one was written.'],
        ['clusters', 'PlaywrightDiffCluster[]', '8-connected spatial diff regions: { id, bbox: { x, y, width, height }, rawDiffPixels, targetSelector? }.'],
        ['settled', 'boolean | undefined', 'Whether captures converged within maxAttempts; present when waitForStable is enabled.'],
        ['blockedRequestsCount', 'number', 'Number of network requests aborted by blockUrls.'],
        ['ariaSnapshot', 'string', 'Playwright ARIA tree YAML/text snapshot when captureAriaSnapshot: true.'],
        ['ai', '{ classification: string, severity: string, explanation: string } | undefined', 'Optional vision model triage result when ai is enabled and a diff occurred.'],
      ],
    )}${h2('Inspecting spatial clusters in tests')}${code(
      'tests/checkout-regression.spec.ts',
      `import { test, expect } from '@playwright/test'
import { visualTest } from '@frontguard/playwright'

test('checkout summary layout stays locked', async ({ page }) =&gt; {
  await page.goto('/checkout')
  const result = await visualTest(page, 'checkout-summary', {
    waitForStable: true,
    captureAriaSnapshot: true,
  })

  if (!result.passed &amp;&amp; result.clusters?.length) {
    console.error('Regressed DOM selectors:', result.clusters.map((c) =&gt; c.targetSelector))
  }
  expect(result.passed).toBe(true)
})`,
    )}`,
  ),

  // ==========================================================================
  // 10. CI/CD: ci-cd/index
  // ==========================================================================
  makeArticle(
    'ci-cd/index',
    'CI/CD Overview',
    'CI/CD',
    ['Supported path', 'Two-lane governance', 'Output', 'Action status'],
    `${lead(
      'Run the CLI in any Node-based CI environment after the target application or preview URL is reachable. Keep ordinary pull-request jobs comparison-only and update baselines in a separate, explicit workflow.',
    )}${h2('Supported path')}${p(
      'Frontguard is designed around a strict separation between comparing screenshots on a Pull Request and promoting new baselines:',
    )}${h2('Two-lane governance')}${table(
      ['Workflow Lane', 'Trigger', 'Git Permissions', 'What It Runs'],
      [
        [
          'Lane 1: PR Visual Gate (Comparison-Only)',
          'pull_request',
          'contents: read',
          'Fetches origin/frontguard-baselines, boots the app (or points --url at a preview deployment), runs frontguard run, and uploads ./frontguard-report/ as a downloadable CI artifact. Never mutates baselines.',
        ],
        [
          'Lane 2: Explicit Baseline Promotion',
          'workflow_dispatch (manual) or local developer terminal',
          'contents: write',
          'Runs frontguard update-baselines --confirm-baselines after human review and pushes the updated manifest and deduplicated PNGs to origin/frontguard-baselines.',
        ],
      ],
    )}${h2('Output')}${p(
      'JSON is emitted to stdout only. Redirect it to ./frontguard-result.json if another step needs a file. The HTML report is written under the configured output directory.',
    )}${code(
      'ci step: saving JSON and HTML artifacts',
      `# Run comparison and tee JSON output while preserving exit code:
$ npx -p @frontguard/cli frontguard run --output json &gt; ./frontguard-result.json`,
    )}${h2('Action status')}${p(
      'PR comments need a GitHub token and may be text-only unless an imageUpload backend is configured. The public composite Action still needs an external consumer smoke test.',
    )}`,
  ),

  // ==========================================================================
  // 11. CI/CD: ci-cd/github-actions
  // ==========================================================================
  makeArticle(
    'ci-cd/github-actions',
    'GitHub Actions',
    'CI/CD',
    ['Release status', 'Permissions', 'Baseline updates'],
    `${note(
      'PRE-RELEASE ACTION.',
      'The external consumer smoke is pending, so there is no public copy-ready Action workflow yet. Use the generated CLI workflow until publication, tag advancement, and both smoke controls pass.',
    )}${lead(
      'For production repositories today, use the direct CLI workflow generated by frontguard init --ci (documented in the GitHub Actions guide). This page documents the repository-root composite action.yml contract and its permissions.',
    )}${h2('Release status')}${p(
      'The repo-root action.yml is the future marketplace consumer shim. It requires contents: write only when update-baselines is true; PR reporting requires pull-requests: write. Default actions/checkout fetch-depth: 1 does not retrieve the frontguard-baselines orphan branch; the Action fetches that ref before comparing.',
    )}${h2('Permissions')}${table(
      ['Permission Scope', 'When Required', 'Reason'],
      [
        ['contents: read', 'Every Pull Request comparison run', 'Reads repository code and fetches origin/frontguard-baselines for comparison.'],
        ['contents: write', 'Explicit baseline update runs only', 'Required when pushing newly accepted screenshots to the frontguard-baselines orphan branch.'],
        ['pull-requests: write', 'Optional PR summary comments', 'Allows posting or updating the markdown diff summary table on the Pull Request.'],
      ],
    )}${h2('Baseline updates')}${p(
      'Updated baselines still require the workflow to push frontguard-baselines in explicit update mode. Do not infer that the public v0 ref has passed this journey until the external smoke test is recorded. merge_group never writes baselines, even when allow-baseline-writes is true, and the Action renders every route for that event.',
    )}${p(
      'Use on: [pull_request, merge_group] with an identical job name. A workflow-level paths: filter on a required check leaves the queue pending. Queue runs compare against the shared latest baseline until #306. Capture the PR head SHA and check out with fetch-depth: 0, which is the history smartFilter needs for git diff base...HEAD.',
    )}${p(
      'For a copy-ready GitHub Actions workflow using the published CLI today, see ' +
        a('/docs/guides/github-actions', 'Guides: GitHub Actions') +
        '.',
    )}`,
  ),

  // ==========================================================================
  // 12. GUIDES: guides/ai-analysis
  // ==========================================================================
  makeArticle(
    'guides/ai-analysis',
    'AI Analysis',
    'Guides',
    ['Scope', 'Providers', 'Configuration examples', 'Evidence limits'],
    `${note(
      'OPTIONAL BYOK.',
      'Model-assisted analysis is not required for local pixel comparison. Screenshot evidence is sent directly to the provider account you configure.',
    )}${lead(
      'When a route exceeds your pixel or SSIM threshold, Frontguard can send cropped visual evidence (baseline, current, diff, and spatial cluster selectors) to your configured vision model to classify the change and explain what shifted.',
    )}${h2('Scope')}${p(
      'Changed screenshots can be classified as regression, intentional, or content_update with a confidence score and explanation. AI analysis runs on every diff above threshold to explain visual changes, classify severity, and suggest candidate CSS fixes. AI annotations are advisory and never silently override pass/fail exit codes.',
    )}${h2('Providers')}${p(
      "Supported providers include OpenAI (provider: 'openai', models such as 'gpt-4.1-mini' or 'gpt-4o', env FRONTGUARD_OPENAI_KEY), Anthropic (provider: 'anthropic', model 'claude-sonnet-4-20250514', env FRONTGUARD_ANTHROPIC_KEY), Google Gemini (provider: 'gemini', model 'gemini-2.5-flash', env FRONTGUARD_GEMINI_KEY), and OpenAI-compatible custom endpoints via baseUrl or FRONTGUARD_OPENAI_BASE_URL for OpenRouter, Ollama, and vLLM.",
    )}${table(
      ['Provider', 'Config provider', 'Default / Recommended Model', 'Environment Variable'],
      [
        ['Google Gemini', "'gemini'", "'gemini-2.5-flash'", 'FRONTGUARD_GEMINI_KEY (or GEMINI_API_KEY)'],
        ['OpenAI', "'openai'", "'gpt-4.1-mini' or 'gpt-4o'", 'FRONTGUARD_OPENAI_KEY (or OPENAI_API_KEY)'],
        ['Anthropic', "'anthropic'", "'claude-sonnet-4-20250514'", 'FRONTGUARD_ANTHROPIC_KEY (or ANTHROPIC_API_KEY)'],
        ['OpenRouter / Ollama / vLLM', "'openai' + baseUrl", 'Any vision-capable model ID', 'FRONTGUARD_OPENAI_KEY + FRONTGUARD_OPENAI_BASE_URL'],
      ],
    )}${h2('Configuration examples')}${code(
      'frontguard.config.ts',
      `export default {
  version: 1,
  baseUrl: 'http://localhost:3000',
  redactSensitive: true, // Always mask PII before sending crops to an external LLM
  ai: {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    // Or provider: 'openai', model: 'gpt-4.1-mini' | 'gpt-4o', baseUrl: 'https://openrouter.ai/api/v1'
    // Or provider: 'anthropic', model: 'claude-sonnet-4-20250514'
  },
}`,
    )}${code(
      'frontguard.config.ts: Local Ollama / OpenRouter via custom baseUrl',
      `export default {
  version: 1,
  baseUrl: 'http://localhost:3000',
  ai: {
    provider: 'openai',
    model: 'llama3.2-vision',
    baseUrl: 'http://localhost:11434/v1', // Runs 100% locally via Ollama
  },
}`,
    )}${h2('Evidence limits')}${p(
      'Frontguard has not published a model precision/recall benchmark. The current validation run had AI disabled, so it cannot support an accuracy claim.',
    )}`,
  ),

  // ==========================================================================
  // 13. GUIDES: guides/ai-fixes
  // ==========================================================================
  makeArticle(
    'guides/ai-fixes',
    'AI Fixes & the Fix-Pattern Database',
    'Guides',
    ['Experimental status', 'Verification', 'Fix-pattern CLI workflow', 'Human review'],
    `${note(
      'EXPERIMENTAL.',
      'Suggestion generation and sandbox verification are separate opt-ins. Suggestions can exist without verification.',
    )}${lead(
      'Frontguard can propose minimal CSS patches for detected layout regressions, test those candidate rules by injecting them into a live browser sandbox, and store accepted patterns locally in .frontguard/fix-patterns.json.',
    )}${h2('Experimental status')}${p(
      'By default, Frontguard only performs pixel and perceptual SSIM comparison. Enabling generateFixes asks the vision model for a targeted CSS rule grounded on the regressed cluster selector (cluster.targetSelector). Enabling verifyFixes opens a sandbox page, injects the candidate CSS rule, re-captures the screenshot, and re-runs the diff against your baseline.',
    )}${code(
      'frontguard.config.ts: enabling candidate fixes & sandbox verification',
      `export default {
  version: 1,
  baseUrl: 'http://localhost:3000',
  ai: {
    provider: 'openai',
    model: 'gpt-4.1-mini',
  },
  generateFixes: true, // Opt-in 1: generate candidate CSS patch
  verifyFixes: true,   // Opt-in 2: inject CSS in sandbox & re-compare against baseline
  fixSandbox: 'local', // Or 'daytona' with DAYTONA_API_KEY configured
}`,
    )}${h2('Verification')}${p(
      'With generateFixes and verifyFixes enabled, Frontguard can apply a CSS suggestion in a sandbox, re-render, and label the outcome Verified or Unverified. A verified result is automatically recorded as an accepted local fix-pattern signal when that database is available.',
    )}${h2('Fix-pattern CLI workflow')}${p(
      'You can curate the local fix-pattern store (.frontguard/fix-patterns.json) so recurring layout issues are matched locally before calling an external model:',
    )}${code(
      'terminal: managing local fix patterns',
      `# Mark suggestion #1 from the latest run as accepted:
$ npx -p @frontguard/cli frontguard accept-fix 1

# Mark suggestion #2 as unhelpful (negative signal):
$ npx -p @frontguard/cli frontguard reject-fix 2

# Export curated patterns to commit or share across projects:
$ npx -p @frontguard/cli frontguard export-patterns &gt; .frontguard/shared-patterns.json`,
    )}${h2('Human review')}${p(
      'That automatic record does not update screenshot baselines or guarantee correctness. Review every patch and run broader tests.',
    )}`,
  ),

  // ==========================================================================
  // 14. GUIDES: guides/accessibility
  // ==========================================================================
  makeArticle(
    'guides/accessibility',
    'Accessibility Audits',
    'Guides',
    ['Status', 'Use', 'Configuration & options', 'Limit'],
    `${note(
      'OPTIONAL PLUGIN.',
      'The accessibility plugin depends on @axe-core/playwright and reports automated findings alongside a run.',
    )}${lead(
      'Run automated axe-core accessibility checks alongside visual regression screenshots. The plugin audits captured route/viewport pairs in fresh Chromium pages after rendering.',
    )}${h2('Status')}${p(
      'Install the optional dependency and import the plugin from @frontguard/cli/plugins. Automated axe results do not establish WCAG conformance and do not replace keyboard or assistive-technology review.',
    )}${h2('Use')}${code(
      'terminal: install optional peer dependency',
      `$ npm install -D @axe-core/playwright@~4.13.0`,
    )}${code(
      'frontguard.config.ts: register the accessibility plugin',
      `import { createAccessibilityPlugin } from '@frontguard/cli/plugins'

export default {
  version: 1,
  baseUrl: 'http://localhost:3000',
  routes: ['/', '/pricing', '/checkout'],
  plugins: [
    createAccessibilityPlugin({
      impact: 'serious', // Report serious and critical violations
      failOnViolation: true,
    }),
  ],
}`,
    )}${h2('Configuration & options')}${table(
      ['Option', 'Type', 'Default', 'Description'],
      [
        ['impact', "'minor' | 'moderate' | 'serious' | 'critical'", "'minor'", 'Minimum severity to report. Set serious with failOnViolation to fail on serious and critical violations.'],
        ['rules', 'string[]', 'undefined', 'Optional allowlist of axe rule IDs, not selectors or WCAG tags.'],
        ['excludeRules', 'string[]', 'undefined', 'Optional denylist of axe rule IDs. Element selector exclusions are not supported. Unknown option keys produce a warning.'],
        ['failOnViolation', 'boolean', 'false', 'Fail on reported violations at or above impact; when impact is omitted the failure cutoff is serious.'],
      ],
    )}${h2('Limit')}${p(
      'Automated axe-core rules catch common contrast, missing label, and ARIA role errors, but cannot verify keyboard focus traps, screen-reader announcement order, or cognitive usability. Always pair automated checks with manual assistive-technology testing.',
    )}`,
  ),

  // ==========================================================================
  // 15. GUIDES: guides/performance-budgets
  // ==========================================================================
  makeArticle(
    'guides/performance-budgets',
    'Performance Budgets',
    'Guides',
    ['Experimental status', 'Collecting Web Vitals in afterRender', 'Current limit'],
    `${note(
      'EXPERIMENTAL.',
      'The plugin can collect and report selected metrics, but its failOnBudgetExceeded path is not a verified standalone CI gate in the current release.',
    )}${lead(
      'Report navigation timing, estimated LCP/CLS, resource transfer weight and request counts from captured routes. FCP is not a supported budget.',
    )}${h2('Experimental status')}${p(
      'Because Frontguard already boots Chromium and waits for network and frame convergence on every route, the performance budget plugin reads browser performance entries in the afterRender hook without launching a separate Lighthouse process.',
    )}${h2('Collecting Web Vitals in afterRender')}${code(
      'frontguard.config.ts: collecting route performance metrics',
      `import { createPerfBudgetPlugin } from '@frontguard/cli/plugins'

export default {
  version: 1,
  baseUrl: 'http://localhost:3000',
  routes: ['/', '/pricing', '/dashboard'],
  plugins: [
    createPerfBudgetPlugin({
      budgets: {
        lcp: 2500,
        cls: 0.1,
        ttfb: 600,
        maxPageWeight: 1500, // KB
      },
    }),
  ],
}`,
    )}${table(
      ['Metric', 'Budget Key', 'What It Measures'],
      [
        ['Largest Contentful Paint', 'lcp', 'Estimated largest-content paint time in milliseconds.'],
        ['Cumulative Layout Shift', 'cls', 'Unitless layout instability score accumulated during page load.'],
        ['Time to First Byte', 'ttfb', 'Response latency in ms for the document navigation request.'],
        ['Total Transfer Weight', 'maxPageWeight', 'Maximum total resource transfer weight in KB (1024 bytes).'],
        ['Request Count', 'maxRequests', 'Maximum number of resource requests.'],
      ],
    )}${h2('Current limit')}${p(
      'Use the plugin output as supplemental evidence. Keep an independently verified performance gate for release decisions until the plugin exit-code path has a failing-first acceptance test.',
    )}`,
  ),

  // ==========================================================================
  // 16. GUIDES: guides/third-party-scripts
  // ==========================================================================
  makeArticle(
    'guides/third-party-scripts',
    'Third-Party Script Monitoring',
    'Guides',
    ['Import', 'Behavior', 'Pairing with blockUrls', 'Limit'],
    `${note(
      'LOCAL PLUGIN.',
      'The plugin inventories third-party script origins and compares the stored inventory between runs.',
    )}${lead(
      'Track every external &lt;script src&gt; origin loaded across your routes and spot unexpected third-party marketing tags, chat widgets, or supply-chain drift alongside visual diffs.',
    )}${h2('Import')}${code(
      'frontguard.config.ts',
      `import { createThirdPartyScriptPlugin } from '@frontguard/cli/plugins'

export default {
  version: 1,
  baseUrl: 'http://localhost:3000',
  plugins: [createThirdPartyScriptPlugin()],
}`,
    )}${h2('Behavior')}${p(
      'During the afterRender hook on each route, the plugin inspects all script elements with external origins, normalizes their hostnames, and compares them against the previous inventory snapshot stored in your project. Newly introduced external script origins are highlighted in the run report.',
    )}${h2('Pairing with blockUrls')}${p(
      'When third-party scripts introduce visual flakiness (such as A/B testing flicker or floating customer-support bubbles), add their patterns to blockUrls in frontguard.config.ts so Playwright aborts them before screenshot capture:',
    )}${code(
      'frontguard.config.ts: blocking flaky third-party origins',
      `export default {
  version: 1,
  baseUrl: 'http://localhost:3000',
  blockUrls: [
    '*Widget.intercom.io*',
    '*cdn.segment.com*',
    '*optimize.google.com*',
  ],
  plugins: [createThirdPartyScriptPlugin()],
}`,
    )}${h2('Limit')}${p(
      'An origin change is evidence to review, not proof that a script is malicious or that it caused a layout regression.',
    )}`,
  ),

  // ==========================================================================
  // 17. GUIDES: guides/production-monitoring
  // ==========================================================================
  makeArticle(
    'guides/production-monitoring',
    'Production Monitoring',
    'Guides',
    ['Local CLI', 'Scheduled cron recipe', 'History', 'Hosted status'],
    `${note(
      'LOCAL ONLY.',
      'The implemented path is frontguard monitor run by your own process, cron, or CI. A managed cloud scheduler is not generally available.',
    )}${lead(
      'Use frontguard monitor to run synthetic visual checks against live production or staging URLs, record timestamped run history on disk, and dispatch webhook alerts when visual drift exceeds your threshold.',
    )}${h2('Local CLI')}${code(
      'terminal',
      `$ frontguard monitor --url https://example.com --threshold 0.05 --once
$ frontguard monitor --history`,
    )}${table(
      ['Flag', 'Default', 'Description'],
      [
        ['--url &lt;url&gt;', 'baseUrl from config', 'Live production or staging URL to monitor.'],
        ['--threshold &lt;ratio&gt;', '0.05 (5%)', 'Changed-pixel ratio required to trigger a monitor alert (0-1 scale).'],
        ['--once', 'false', 'Execute a single check and exit immediately (ideal for Kubernetes CronJobs or GitHub Actions schedule).'],
        ['--interval &lt;minutes&gt;', 'unset', 'Poll every N minutes. Without --interval or --watch, run once.'],
        ['--watch', 'false', 'Continuously poll; default interval is one minute unless --interval is provided.'],
        ['--webhook &lt;url&gt;', 'undefined', 'HTTP endpoint accepting Frontguard JSON alerts. Slack Incoming Webhooks require an adapter; see the Slack integration guide.'],
        ['--history', 'false', 'Print the local run history log stored under .frontguard/monitor-history.'],
      ],
    )}${h2('Scheduled cron recipe')}${p(
      'Because frontguard monitor --once exits non-zero when a production regression exceeds threshold, you can run it on a 15-minute or hourly schedule in GitHub Actions or any cron runner:',
    )}${code(
      '.github/workflows/prod-monitor.yml',
      `name: Production Visual Monitor
on:
  schedule:
    - cron: '0 * * * *' # Every hour
  workflow_dispatch:

jobs:
  monitor:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: git fetch origin frontguard-baselines:frontguard-baselines
      - run: npx -p @frontguard/cli playwright install --with-deps chromium
      - run: npx -p @frontguard/cli frontguard monitor --url https://example.com --threshold 0.05 --once`,
    )}${h2('History')}${p(
      'CLI monitor records run history under .frontguard/monitor-history by default. Webhook failures are reported but should not be treated as a durable paging system.',
    )}${h2('Hosted status')}${p(
      'Self-triggered cron or CI execution is the supported production monitoring workflow today.',
    )}`,
  ),

  // ==========================================================================
  // 18. GUIDES: guides/cloud-api
  // ==========================================================================
  makeArticle(
    'guides/cloud-api',
    'Cloud API',
    'Guides',
    ['Current status', 'Required URL', 'API endpoints overview', 'Production warning'],
    `${cloudNotice}${lead(
      'The repository includes the Hono + Cloudflare Workers + D1 + R2 source code under packages/cloud-api for engineering evaluation and contract testing.',
    )}${h2('Current status')}${p(
      'Cloudflare Worker, D1, and R2 source exists for development and contract evaluation. api.frontguard.dev is not a working hosted default.',
    )}${h2('Required URL')}${code(
      'environment',
      `FRONTGUARD_API_URL=https://your-frontguard-api.example.com
FRONTGUARD_API_KEY=fg_live_your_token_here`,
    )}${h2('API endpoints overview')}${p(
      'The OpenAPI 3.1 specification is published at /openapi.json and synchronized with packages/cloud-api/src/openapi.json:',
    )}${table(
      ['Method & Path', 'Auth', 'Purpose'],
      [
        ['GET /health', 'Public', 'Returns service health and D1 SQLite database connectivity status.'],
        ['POST /v1/runs', 'Bearer API Key', 'Ingests run metadata, route diff metrics, and spatial cluster records.'],
        ['GET /v1/runs/:id', 'Bearer API Key', 'Retrieves a specific run and its per-route comparison results.'],
        ['POST /v1/runs/:id/accept', 'Bearer API Key', 'Records run-level approval metadata in D1 (does not promote git screenshots).'],
        ['POST /v1/cas/check', 'Bearer API Key', 'Checks a batch of SHA-256 digests against R2 and returns existing vs missing hashes.'],
        ['PUT /v1/cas/blobs/:sha256', 'Bearer API Key', 'Verifies the SHA-256 digest of a PNG payload and stores it immutably in R2.'],
        ['GET /v1/cas/blobs/:sha256', 'Bearer API Key', 'Streams an immutable PNG blob from R2 with long-lived Cache-Control headers.'],
      ],
    )}${h2('Production warning')}${p(
      'Do not use the pre-release cloud for production data until deployment, migrations, retention, recovery, and tenant isolation are independently verified.',
    )}`,
  ),

  // ==========================================================================
  // 19. GUIDES: guides/custom-plugins
  // ==========================================================================
  makeArticle(
    'guides/custom-plugins',
    'Custom Plugins',
    'Guides',
    ['Interface', 'Lifecycle', 'Practical plugin examples', 'Compatibility'],
    `${lead(
      'Extend the CLI pipeline by selecting authentication storage state before rendering, transforming captured results, or sending a report after a run.',
    )}${h2('Interface')}${p(
      'Plugins are objects implementing FrontguardPlugin. Import that type from @frontguard/cli/plugins to check hook arguments and return values against your installed version.',
    )}${h2('Lifecycle')}${p(
      'Hooks run in registration order; teardown runs in reverse order. Hooks receive configuration or captured results, not a live Playwright Page.',
    )}${table(
      ['Hook Order', 'Hook Name', 'When It Fires & Practical Use'],
      [
        ['01', 'setup(ctx)', 'Validate options and initialize state before discovery.'],
        ['02', 'beforeDiscover(config)', 'Return the config to use for discovery.'],
        ['03', 'afterDiscover(routes, config)', 'Return the routes to render after filtering or adding entries.'],
        ['04', 'beforeRender({ routes, config })', 'Return { routes, config } to change capture configuration.'],
        ['05', 'afterRender(screenshots, ctx)', 'Receives ScreenshotResult[]. Return a replacement array or void.'],
        ['06', 'afterCompare(diffs, ctx)', 'Receives DiffResult[]. Return a replacement array or void.'],
        ['07', 'afterRun(result, ctx)', 'Receives RunResult, including result.summary, before reporting.'],
        ['08', 'onError(error, stage)', 'Handle a pipeline error; return true to suppress it.'],
        ['09', 'teardown()', 'Release resources at the end of the run.'],
      ],
    )}${h2('Practical plugin examples')}${h3('Example 1: Selecting authentication storage state')}${p(
      'Create a Playwright storage-state file using your application login flow first. It can contain cookies and localStorage. Return its path in the capture config:',
    )}${code(
      'frontguard.config.ts: selecting a saved session',
      `import type { FrontguardPlugin } from '@frontguard/cli/plugins'

const sessionPlugin: FrontguardPlugin = {
  name: 'use-review-session',
  beforeRender({ routes, config }) {
    return {
      routes,
      config: { ...config, auth: { storageState: './playwright/.auth/user.json' } },
    }
  },
}

export default {
  version: 1,
  baseUrl: 'http://localhost:3000',
  routes: ['/dashboard', '/billing'],
  plugins: [sessionPlugin],
}`,
    )}${h3('Example 2: Posting a JSON webhook summary')}${code(
      'frontguard.config.ts: custom webhook reporter plugin',
      `import type { FrontguardPlugin } from '@frontguard/cli/plugins'

const webhookPlugin: FrontguardPlugin = {
  name: 'custom-ci-webhook',
  async afterRun(result) {
    const { summary } = result
    if (summary.regressions &gt; 0 &amp;&amp; process.env.CI_ALERT_URL) {
      const response = await fetch(process.env.CI_ALERT_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          regressions: summary.regressions,
          totalComparisons: summary.total,
        }),
      })
      if (!response.ok) throw new Error('Alert delivery failed')
    }
  },
}

export default {
  version: 1,
  baseUrl: 'http://localhost:3000',
  plugins: [webhookPlugin],
}`,
    )}${h2('Compatibility')}${p(
      'Pin the CLI version and test your plugin against it. Destructuring afterRun({ summary }) is also valid because summary is a RunResult property. Each hook has a configurable timeout (30 seconds by default).',
    )}`,
  ),

  // ==========================================================================
  // 20. GUIDES: guides/create-plugin
  // ==========================================================================
  makeArticle(
    'guides/create-plugin',
    'Create & Publish a Plugin',
    'Guides',
    ['Current status', 'Authoring a typed plugin package', 'Safe workflow'],
    `${note(
      'TYPED PLUGIN.',
      'Build against the FrontguardPlugin interface from the CLI version you install.',
    )}${lead(
      'Write a TypeScript factory returning a FrontguardPlugin object. Frontguard does not operate a plugin registry or compatibility certification service.',
    )}${h2('Current status')}${p(
      'Use the public interfaces exported by your installed CLI, add tests in the plugin repository, and follow the npm publishing process you independently verify.',
    )}${h2('Authoring a typed plugin package')}${code(
      'src/index.ts: standalone plugin structure',
      `import type { FrontguardPlugin } from '@frontguard/cli/plugins'

export interface StorageStateOptions {
  path: string
}

export function createStorageStatePlugin(options: StorageStateOptions): FrontguardPlugin {
  return {
    name: 'frontguard-plugin-storage-state',
    beforeRender({ routes, config }) {
      return {
        routes,
        config: { ...config, auth: { storageState: options.path } },
      }
    },
  }
}`,
    )}${h2('Safe workflow')}${list([
      'Use beforeRender for capture configuration, afterRender for captured screenshot results, and afterRun for reporting.',
      'Clean up external handles or temporary files in teardown.',
      'Pin the peerDependency range for @frontguard/cli and test with representative route and result fixtures.',
    ])}`,
  ),

  // ==========================================================================
  // 21. GUIDES: guides/github-actions
  // ==========================================================================
  makeArticle(
    'guides/github-actions',
    'GitHub Actions',
    'Guides',
    ['Generated workflow', 'Complete PR workflow YAML', 'Baseline workflow', 'Composite Action'],
    `${lead(
      'Set up two-lane visual regression governance in GitHub Actions: a read-only Pull Request check that compares against origin/frontguard-baselines, and an explicit manual workflow for promoting new baselines.',
    )}${h2('Generated workflow')}${p(
      'frontguard init --ci generates a comparison-only workflow that invokes the CLI directly, uses contents: read, and uploads the HTML artifact. Configure FRONTGUARD_OPENAI_KEY or FRONTGUARD_ANTHROPIC_KEY only if optional analysis is enabled.',
    )}${p(
      'The generated workflow fetches origin/frontguard-baselines explicitly. Default actions/checkout fetch-depth: 1 only retrieves the triggering commit, so a CI user who omits that fetch gets an empty expected set.',
    )}${h2('Complete PR workflow YAML')}${code(
      '.github/workflows/frontguard.yml: Lane 1: Comparison-Only PR Gate',
      `name: Frontguard Visual Check
on:
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  visual-regression:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout PR branch
        uses: actions/checkout@v4
        with:
          fetch-depth: 1

      - name: Fetch accepted baselines branch
        run: git fetch origin frontguard-baselines:frontguard-baselines || true

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies &amp; Chromium
        run: |
          npm ci
          npx -p @frontguard/cli playwright install --with-deps chromium

      - name: Start application &amp; run Frontguard comparison
        run: |
          npm run build
          npm run start &amp;
          npx wait-on http://localhost:3000 --timeout 60000
          npx -p @frontguard/cli frontguard run --wait-for-stability --redact-sensitive

      - name: Upload HTML Visual Diff Workbench
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: frontguard-report
          path: frontguard-report/`,
    )}${h2('Baseline workflow')}${p(
      'Baseline acceptance belongs in a separate explicit workflow: run frontguard update-baselines --confirm-baselines, review the result, then push frontguard-baselines.',
    )}${code(
      '.github/workflows/frontguard-update-baselines.yml: Lane 2: Explicit Baseline Promotion',
      `name: Update Frontguard Baselines
on:
  workflow_dispatch:
    inputs:
      reason:
        description: 'Reason for promoting new visual baselines'
        required: true

permissions:
  contents: write

jobs:
  update-baselines:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: git fetch origin frontguard-baselines:frontguard-baselines || true
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: |
          npm ci
          npx -p @frontguard/cli playwright install --with-deps chromium
          npm run build
          npm run start &amp;
          npx wait-on http://localhost:3000 --timeout 60000
          npx -p @frontguard/cli frontguard update-baselines --confirm-baselines
          git push origin frontguard-baselines:frontguard-baselines`,
    )}${h2('Composite Action')}${p(
      'The generated workflow and the repository composite Action are separate surfaces. The public Action remains pre-release pending an external consumer smoke test.',
    )}${h2('Merge queue')}${p(
      'Register pull_request and merge_group on the same workflow with an identical job name. GitHub waits for that name before merging the queue.',
    )}${code(
      '.github/workflows/frontguard.yml: pull request and merge queue',
      `on: [pull_request, merge_group]

jobs:
  visual-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          # smartFilter diffs base...HEAD. fetch-depth: 1 does not contain
          # that base commit. Capture the PR head SHA so the checkout is the
          # pull request head, not an unexpected merge ref.
          fetch-depth: 0
          ref: \${{ github.event.pull_request.head.sha || github.event.merge_group.head_sha || github.sha }}`,
    )}${p(
      'A workflow-level paths: filter on that required check skips the job when the queue commit does not touch those paths, and the queue stays pending. Do not put paths: on a required Frontguard check.',
    )}${p(
      'Queue runs compare against the shared latest frontguard-baselines branch until #306. They do not auto-pass. update-baselines on merge_group exits 2 and pushes nothing, even when allow-baseline-writes is true. On merge_group the Action passes --all-routes and sets FRONTGUARD_DIFF_BASE from github.event.merge_group.base_sha when that SHA is present. A queued regression still exits 1 and is written to the job summary, because the payload has no pull request number.',
    )}`,
  ),

  // ==========================================================================
  // 22. GUIDES: guides/migrate-from-backstopjs
  // ==========================================================================
  makeArticle(
    'guides/migrate-from-backstopjs',
    'Migrate from BackstopJS',
    'Guides',
    ['Scope', 'Configuration mapping', 'Baseline migration', 'Thresholds'],
    `${note(
      'MANUAL MIGRATION.',
      'Frontguard does not claim a lossless one-command BackstopJS conversion.',
    )}${lead(
      'Translate BackstopJS scenarios, viewports, selectors, and percentage thresholds into a single typed frontguard.config.ts file.',
    )}${h2('Scope')}${list([
      'Map scenario URLs to routes and viewport widths.',
      'Convert misMatchThreshold percentages to Frontguard ratios by dividing by 100.',
      'Start the app, review captures, run frontguard update-baselines --confirm-baselines, and push frontguard-baselines.',
      'Keep both tools in CI until the new comparisons are independently reviewed.',
    ])}${h2('Configuration mapping')}${table(
      ['BackstopJS (backstop.json)', 'Frontguard (frontguard.config.ts)', 'Migration Notes'],
      [
        ['viewports: [{ label, width, height }]', 'viewports: [375, 768, 1440]', 'Specify widths in pixels (or { width, height } objects).'],
        ['scenarios[].url', 'baseUrl + routes: ["/pricing", ...]', 'Extract shared origin to baseUrl and list relative paths in routes.'],
        ['scenarios[].misMatchThreshold: 1.5', 'threshold: 0.015', 'Divide BackstopJS percentage (0–100) by 100 to get Frontguard ratio (0–1).'],
        ['scenarios[].hideSelectors / removeSelectors', 'ignore: [{ selector: ".ad-banner" }]', 'Masks volatile DOM elements before capture.'],
        ['scenarios[].readySelector / delay', 'actions: [{ type: "waitForSelector", selector }, { type: "wait", ms }]', 'Combine with waitForStability: true for automatic frame convergence.'],
        ['bitmaps_reference/', 'frontguard-baselines git orphan branch', 'Managed via frontguard update-baselines --confirm-baselines; keeps main branch free of PNG blobs.'],
      ],
    )}${code(
      'Before (backstop.json) vs After (frontguard.config.ts)',
      `// Before: backstop.json
// { "viewports": [{ "name": "desktop", "width": 1440, "height": 900 }],
//   "scenarios": [{ "label": "Pricing", "url": "http://localhost:3000/pricing",
//     "hideSelectors": [".chat-widget"], "misMatchThreshold": 1.0 }] }

// After: frontguard.config.ts
export default {
  version: 1,
  baseUrl: 'http://localhost:3000',
  viewports: [1440],
  routes: ['/pricing'],
  ignore: [{ selector: '.chat-widget' }],
  threshold: 0.01, // 1.0% divided by 100
  waitForStability: true,
}`,
    )}${h2('Baseline migration')}${p(
      'Because BackstopJS uses its own Puppeteer/Playwright viewport framing and reference directory structure, do not copy old bitmaps_reference PNGs directly. Instead, boot your application, run frontguard update-baselines --confirm-baselines once to establish fresh Chromium baselines, inspect them, and push frontguard-baselines.',
    )}${h2('Thresholds')}${p(
      'BackstopJS expresses misMatchThreshold on a 0–100 percentage scale (where 0.1 means 0.1%), whereas Frontguard uses a 0–1 ratio scale (where 0.001 means 0.1% and 0.01 means 1%). Always divide your BackstopJS threshold by 100.',
    )}`,
  ),

  // ==========================================================================
  // 23. GUIDES: guides/migrate-from-lost-pixel
  // ==========================================================================
  makeArticle(
    'guides/migrate-from-lost-pixel',
    'Migrate from Lost Pixel',
    'Guides',
    ['Scope', 'Configuration mapping', 'Baseline migration', 'Cutover'],
    `${note(
      'MANUAL MIGRATION.',
      'Frontguard does not import hosted review history or automatically approve Lost Pixel snapshots.',
    )}${lead(
      'Migrate pageShots and storybookShots from lostpixel.config.ts to Frontguard routes and Storybook discovery.',
    )}${h2('Scope')}${list([
      'Map page and Storybook captures to Frontguard routes.',
      'Configure viewports and thresholds explicitly.',
      'Review and accept new Frontguard baselines with update-baselines.',
      'Run both systems until your team accepts the new evidence and failure semantics.',
    ])}${h2('Configuration mapping')}${table(
      ['Lost Pixel (lostpixel.config.ts)', 'Frontguard (frontguard.config.ts)', 'Migration Notes'],
      [
        ['pageShots: { pages: [{ path, name }], baseUrl }', 'baseUrl + routes: ["/login", "/pricing"]', 'Pass route strings or route objects with custom actions/thresholds.'],
        ['storybookShots: { storybookUrl }', 'storybook: { url: "http://localhost:6006" }', 'Queries Storybook /index.json and renders each story in an isolated iframe.'],
        ['threshold: 0.01', 'threshold: 0.01', 'Both tools use a 0–1 pixel ratio scale. Frontguard also computes SSIM and Chroma-SSIM.'],
        ['waitBeforeScreenshot: 500', 'waitForStability: true', 'Replaces fixed sleep timers with multi-frame convergence polling.'],
        ['.lostpixel/baseline/', 'frontguard-baselines orphan branch', 'Stored on an isolated git orphan branch rather than main working tree.'],
      ],
    )}${code(
      'frontguard.config.ts: equivalent page + Storybook setup',
      `export default {
  version: 1,
  baseUrl: 'http://localhost:3000',
  routes: ['/', '/pricing', '/login'],
  storybook: {
    url: 'http://localhost:6006',
  },
  viewports: [375, 1440],
  threshold: 0.01,
  waitForStability: true,
}`,
    )}${h2('Baseline migration')}${p(
      'Start your application (and Storybook if configured), run frontguard update-baselines --confirm-baselines, inspect the generated captures, and push origin/frontguard-baselines.',
    )}${h2('Cutover')}${p(
      'Once your pull-request workflow passes cleanly against frontguard-baselines, remove the legacy Lost Pixel workflow and .lostpixel baseline directory.',
    )}`,
  ),

  // ==========================================================================
  // 24. INTEGRATIONS: integrations/mcp
  // ==========================================================================
  makeArticle(
    'integrations/mcp',
    'MCP server',
    'Integrations',
    ['Configuration', 'Tools', 'Agentic debugging workflow', 'Approval limit'],
    `${cloudNotice}${lead(
      '@frontguard/mcp gives coding agents structured access to local visual regression reports, DOM clusters and CSS patch validation. Reading local reports needs no cloud account or API key.',
    )}${h2('Configuration')}${p(
      'From your project directory, start the app and prepare reviewed baselines first. JSON output goes to stdout, so create the report directory and redirect it into the file MCP will read:',
    )}${code(
      'terminal: create the local JSON report',
      `mkdir -p frontguard-report
npx -p @frontguard/cli frontguard run --output json &gt; frontguard-report/report.json`,
    )}${p(
      'Exit 1 means the report contains regressions or unaccepted screenshots; exit 2 indicates an error to investigate. Run the MCP client from this project directory, or use an absolute FRONTGUARD_LOCAL_REPORT path.',
    )}${code(
      '.mcp.json: local report setup',
      `{
  "mcpServers": {
    "frontguard": {
      "command": "npx",
      "args": ["-y", "@frontguard/mcp"],
      "env": {
        "FRONTGUARD_LOCAL_REPORT": "./frontguard-report/report.json"
      }
    }
  }
}`,
    )}${p(
      'Cloud-dependent tools require an independently verified FRONTGUARD_API_URL deployment and FRONTGUARD_API_KEY; no working hosted default is supplied.',
    )}${h2('Tools')}${table(
      ['MCP Tool Name', 'Required Arguments', 'What It Returns to the Coding Agent'],
      [
        ['list_regressions', 'pr_id; optional repo, branch', 'Lists regressions and their diffId values. Use a PR number or a run ID returned by recent_runs; branch is currently reserved.'],
        ['inspect_diff_cluster_dom', 'diff_id; optional cluster_id', 'Returns captured DOM clusters, bounding boxes, selectors and diff evidence.'],
        ['get_suggested_fix', 'diff_id', 'Returns a stored suggested fix if one exists.'],
        ['verify_css_patch', 'diff_id, css_patch, target_selector', 'Validates CSS syntax, target alignment and safety against the report. It does not render or apply the patch.'],
        ['promote_baseline', 'run_id, confirm_reviewed: true; optional routes', 'Cloud API mode only: records reviewed run approval. Refuses local-report mode; does not promote cloud PNGs.'],
        ['accept_baseline', 'run_id, confirm_all_regressions_reviewed: true', 'Records whole-run approval metadata in the local JSON report or Cloud API; does not replace screenshot baselines.'],
        ['recent_runs', 'optional repo, branch, limit', 'Lists runs, including the local run ID when reading a JSON report.'],
      ],
    )}${h2('Agentic debugging workflow')}${steps([
      {
        title: 'Write the report',
        body: 'Use the JSON command above. Recreate report.json after each comparison so MCP reads the current evidence.',
      },
      {
        title: 'Inspect regressions',
        body: 'Call recent_runs, then list_regressions with pr_id set to the returned run ID. Pass a returned diffId as the diff_id input to inspect_diff_cluster_dom or get_suggested_fix.',
      },
      {
        title: 'Validate and re-run',
        body: 'Call verify_css_patch with diff_id, css_patch and target_selector. Apply the reviewed code edit yourself and re-run Frontguard; CSS validation alone is not visual verification.',
      },
    ])}${h2('Approval limit')}${p(
      'MCP promotion is refused in local-report mode and does not write the frontguard-baselines branch. The local write is the CLI command frontguard update-baselines --confirm-baselines, which a human runs. An agent setting confirm_reviewed: true on itself is not a human review, and an advisory caption cannot set that flag. Cloud approveRun is not a production path; do not point the MCP client at a production host. accept_baseline can mark a JSON report approved, but it does not replace screenshot baselines. Cloud tools record approval metadata only; cloud screenshot promotion is not implemented.',
    )}`,
  ),

  // ==========================================================================
  // 25. INTEGRATIONS: integrations/storybook
  // ==========================================================================
  makeArticle(
    'integrations/storybook',
    'Storybook',
    'Integrations',
    ['Implemented source', 'Configuration', 'Filtering & play functions', 'Release limit'],
    `${note(
      'SOURCE AVAILABLE.',
      'The CLI includes Storybook index discovery and play-function-aware capture, but the public integration journey has not been externally acceptance-tested.',
    )}${lead(
      'Point Frontguard at a running Storybook 7 or 8 server to automatically discover stories from /index.json and render each story iframe across your configured viewports.',
    )}${h2('Implemented source')}${p(
      'When storybook.url is configured in frontguard.config.ts, Frontguard fetches /index.json (or legacy /stories.json), constructs isolated iframe URLs (/iframe.html?id=&lt;storyId&gt;&viewMode=story), and renders each story through the standard Playwright worker pool.',
    )}${h2('Configuration')}${code(
      'frontguard.config.ts',
      `export default {
  version: 1,
  baseUrl: 'http://localhost:3000',
  storybook: {
    url: 'http://localhost:6006',
    stories: ['components-button--*', 'marketing-pricing--*'],
    exclude: ['*--loading-skeleton'],
  },
  viewports: [375, 1440],
  waitForStability: true,
}`,
    )}${h2('Filtering & play functions')}${table(
      ['Property', 'Type', 'Default', 'Description'],
      [
        ['storybook.url', 'string', 'Required', 'Base URL of your running Storybook instance (e.g., http://localhost:6006).'],
        ['storybook.stories', 'string[]', 'undefined', 'Optional glob patterns matching story IDs or titles to include.'],
        ['storybook.exclude', 'string[]', 'undefined', 'Optional glob patterns of noisy or animated stories to skip.'],
      ],
    )}${p(
      'Play-function handling is built into story capture; there is no waitForPlayFunction configuration switch.',
    )}${h2('Release limit')}${p(
      'Run Storybook yourself, review discovered stories, and use the normal explicit CLI baseline workflow. Do not assume a hosted Storybook review service is included.',
    )}`,
  ),

  // ==========================================================================
  // 26. INTEGRATIONS: integrations/netlify
  // ==========================================================================
  makeArticle(
    'integrations/netlify',
    'Netlify',
    'Integrations',
    ['Status', 'Testing Netlify preview URLs with the CLI', 'Cloud requirement'],
    `${integrationNotice}${cloudNotice}${lead(
      'How to run the supported @frontguard/cli against Netlify Deploy Previews today, and the status of the checked-in Netlify build plugin source.',
    )}${h2('Status')}${p(
      'The checked-in Netlify plugin source is for evaluation. No marketplace listing or production PR-comment journey is claimed.',
    )}${h2('Testing Netlify preview URLs with the CLI')}${p(
      'To test a Netlify Deploy Preview URL in your existing CI pipeline without using the pre-release plugin, pass the deploy preview URL via --url to frontguard run:',
    )}${code(
      'terminal: comparing a live Netlify Deploy Preview against frontguard-baselines',
      `$ git fetch origin frontguard-baselines:frontguard-baselines
$ npx -p @frontguard/cli frontguard run --url "$DEPLOY_PRIME_URL" --wait-for-stability`,
    )}${h2('Cloud requirement')}${p(
      'Any cloud-backed status reporting in the evaluation plugin requires a self-operated, independently verified FRONTGUARD_API_URL deployment.',
    )}`,
  ),

  // ==========================================================================
  // 27. INTEGRATIONS: integrations/slack
  // ==========================================================================
  makeArticle(
    'integrations/slack',
    'Slack',
    'Integrations',
    ['Status', 'Using Slack webhooks with frontguard monitor', 'Cloud requirement'],
    `${integrationNotice}${cloudNotice}${lead(
      'Forward monitor alerts to a Slack Incoming Webhook through an adapter that translates the Frontguard JSON payload into a Slack message.',
    )}${h2('Status')}${p(
      'The checked-in Slack worker and OAuth source are for evaluation. No installed public app, durable alert delivery, or support commitment is claimed.',
    )}${h2('Using Slack webhooks with frontguard monitor')}${p(
      'Monitor sends { tool, timestamp, alerts, summary }. Slack expects text or blocks, so do not pass SLACK_WEBHOOK_URL directly to --webhook. Run this local adapter with Node 22:',
    )}${code(
      'slack-adapter.mjs',
      `import { createServer } from 'node:http'

if (!process.env.SLACK_WEBHOOK_URL) throw new Error('Set SLACK_WEBHOOK_URL')

createServer(async (req, res) =&gt; {
  if (req.method !== 'POST' || req.url !== '/alerts') {
    res.writeHead(404).end()
    return
  }
  try {
    let body = ''
    for await (const chunk of req) {
      body += chunk
      if (Buffer.byteLength(body) &gt; 65536) {
        res.writeHead(413).end('Alert too large')
        return
      }
    }
    const { summary } = JSON.parse(body)
    const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: 'Frontguard: ' + summary.alerted + ' of ' + summary.total + ' checks alerted',
      }),
      signal: AbortSignal.timeout(10000),
    })
    res.writeHead(response.ok ? 200 : 502).end()
  } catch {
    res.writeHead(502).end('Alert forwarding failed')
  }
}).listen(8788, '127.0.0.1')`,
    )}${code(
      'terminal 1: leave the local adapter running',
      `SLACK_WEBHOOK_URL='https://hooks.slack.com/services/your/webhook/path' node slack-adapter.mjs`,
    )}${code(
      'terminal 2: send Frontguard alerts to the adapter',
      `npx -p @frontguard/cli frontguard monitor --url https://example.com --threshold 0.05 --once --webhook http://127.0.0.1:8788/alerts`,
    )}${p(
      'This example listens only on localhost. Use your existing authenticated alert service for remote CI runners; webhook delivery is best-effort.',
    )}${h2('Cloud requirement')}${p(
      'Interactive Slack buttons and OAuth installation in integrations/slack require a self-operated Cloud API deployment and are not generally available.',
    )}`,
  ),

  // ==========================================================================
  // 28. INTEGRATIONS: integrations/vercel
  // ==========================================================================
  makeArticle(
    'integrations/vercel',
    'Vercel',
    'Integrations',
    ['Status', 'Testing Vercel preview URLs in GitHub Actions', 'Cloud requirement'],
    `${integrationNotice}${cloudNotice}${lead(
      'Compare Vercel preview deployments against your frontguard-baselines branch using the standard CLI in GitHub Actions.',
    )}${h2('Status')}${p(
      'The checked-in Vercel integration source is for evaluation. No marketplace installation or automatic hosted rendering journey is claimed.',
    )}${h2('Testing Vercel preview URLs in GitHub Actions')}${p(
      'You can run @frontguard/cli directly against any Vercel preview URL once the deployment is ready:',
    )}${code(
      'terminal: running Frontguard against a Vercel preview URL',
      `$ git fetch origin frontguard-baselines:frontguard-baselines
$ npx -p @frontguard/cli frontguard run --url "https://my-app-git-feat-branch.vercel.app" --wait-for-stability`,
    )}${h2('Cloud requirement')}${p(
      'The webhook-driven Vercel integration source under integrations/vercel requires an independently operated Cloud API and is pre-release.',
    )}`,
  ),

  // ==========================================================================
  // 29. INTEGRATIONS: integrations/github
  // ==========================================================================
  makeArticle(
    'integrations/github',
    'GitHub App',
    'Integrations',
    ['Current limitations', 'Use today'],
    `${integrationNotice}${lead(
      'Architectural status of the checked-in GitHub App source under integrations/github-app and why teams should use the direct CLI workflow in GitHub Actions today.',
    )}${h2('Current limitations')}${list([
      'Deployment events do not resume a pending Check Run.',
      'Repository config and project baseline scope are not forwarded to cloud runs.',
      'The bootstrap pinned to ravidsrk/frontguard@v0 does not start the target application.',
      'Cloud approval records metadata but does not promote screenshots.',
    ])}${h2('Use today')}${p(
      'Use the local CLI or a workflow you have independently verified. The GitHub App is not a replacement for those paths today.',
    )}${p(
      'See ' +
        a('/docs/guides/github-actions', 'Guides: GitHub Actions') +
        ' for the supported two-lane GitHub Actions CLI setup.',
    )}`,
  ),

  // ==========================================================================
  // 30. COMPARISONS: comparisons/frontguard-vs-argos
  // ==========================================================================
  makeArticle(
    'comparisons/frontguard-vs-argos',
    'Frontguard vs Argos',
    'Comparisons',
    ['Scope', 'Architectural comparison', 'Choose by workflow'],
    `${comparisonNotice}${lead(
      'Compare Frontguard’s local-first MIT CLI and git orphan-branch baselines with Argos’s hosted visual review platform.',
    )}${h2('Scope')}${p(
      'Argos offers a mature hosted review workflow. Frontguard currently offers a local MIT CLI with git-native baselines and optional BYOK analysis. Choose based on whether your team needs a supported hosted review surface.',
    )}${h2('Architectural comparison')}${table(
      ['Capability', 'Frontguard (Local CLI)', 'Argos'],
      [
        ['License', 'MIT Open Source', 'MIT Open Source'],
        ['Primary Workflow', 'Local CLI + Git orphan branch (frontguard-baselines) + offline HTML workbench', 'CI upload to hosted Argos dashboard + GitHub/GitLab status checks'],
        ['Runs 100% Offline / Without Account', 'Yes (default path requires zero external services)', 'Requires hosted Argos service or self-hosted server stack'],
        ['Diff Engine', 'Pixelmatch + Luminance SSIM + Chroma-SSIM + Wavelet CW-SSIM + spatial DOM cluster attribution', 'Pixel diffing with anti-aliasing and stabilization rules'],
        ['AI Triage', 'Optional BYOK (OpenAI, Anthropic, Gemini, or custom baseUrl)', 'Not built-in'],
      ],
    )}${h2('Choose by workflow')}${list([
      '<strong>Choose Argos</strong> if your team wants a production-ready hosted web dashboard with managed PR review approvals and GitHub/GitLab check integrations out of the box.',
      '<strong>Choose Frontguard</strong> if you want a zero-account local CLI where baselines live in your own Git repository, diffs are inspected in a self-contained HTML workbench or via MCP coding agents, and optional AI triage uses your own API key.',
    ])}${p('See the maintained comparison matrix at <a href="/comparisons" style="color: #e8862e;">/comparisons</a>.')}`,
  ),

  // ==========================================================================
  // 31. COMPARISONS: comparisons/frontguard-vs-percy
  // ==========================================================================
  makeArticle(
    'comparisons/frontguard-vs-percy',
    'Frontguard vs Percy',
    'Comparisons',
    ['Scope', 'Architectural comparison', 'Choose by workflow'],
    `${comparisonNotice}${lead(
      'Compare BrowserStack Percy’s cloud rendering and enterprise review dashboard with Frontguard’s local-first CLI and Playwright workflows.',
    )}${h2('Scope')}${p(
      "Percy is an established BrowserStack-hosted review product. Frontguard is a local CLI and does not offer Percy's mature hosted review surface. Optional model assistance is not a substitute for that operational product.",
    )}${h2('Architectural comparison')}${table(
      ['Capability', 'Frontguard (Local CLI)', 'BrowserStack Percy'],
      [
        ['Execution Model', 'Renders locally or on your own CI runner via Playwright', 'Uploads DOM snapshots to BrowserStack cloud render grid'],
        ['Baseline Storage', 'Git orphan branch (frontguard-baselines) or __visual_baselines__/', 'Hosted inside Percy cloud project'],
        ['Data Privacy Boundary', 'Screenshots and DOM stay inside your machine/CI runner by default', 'DOM and assets uploaded to hosted service for rendering'],
        ['Pricing Model', 'Free forever (MIT CLI); optional BYOK LLM tokens', 'Free tier up to 5k screenshots/mo; paid plans from $199/mo'],
      ],
    )}${h2('Choose by workflow')}${list([
      '<strong>Choose Percy</strong> if you want managed cloud rendering across BrowserStack infrastructure and an enterprise web review UI with team approval gates.',
      '<strong>Choose Frontguard</strong> if your security boundary requires screenshots and DOM state to stay inside your own CI runners, or if you want unlimited local visual checks without per-screenshot billing.',
    ])}${p('See the maintained comparison matrix at <a href="/comparisons" style="color: #e8862e;">/comparisons</a>.')}`,
  ),

  // ==========================================================================
  // 32. COMPARISONS: comparisons/frontguard-vs-chromatic
  // ==========================================================================
  makeArticle(
    'comparisons/frontguard-vs-chromatic',
    'Frontguard vs Chromatic',
    'Comparisons',
    ['Scope', 'Architectural comparison', 'Choose by workflow'],
    `${comparisonNotice}${lead(
      'Compare Chromatic’s hosted Storybook publishing and UI review cloud with Frontguard’s local Storybook discovery and full-app route runner.',
    )}${h2('Scope')}${p(
      'Chromatic is a hosted Storybook-centered visual review product. Frontguard can discover a running Storybook but remains a local CLI workflow without an equivalent hosted review service.',
    )}${h2('Architectural comparison')}${table(
      ['Capability', 'Frontguard (Local CLI)', 'Chromatic'],
      [
        ['Primary Target', 'Full-app routes (Next.js, Remix, Astro, etc.), Playwright tests, and local Storybook /index.json', 'Storybook stories and Playwright/Cypress archives uploaded to Chromatic cloud'],
        ['Review Surface', 'Local 4-mode HTML workbench + CLI + @frontguard/mcp server', 'Hosted Chromatic web application with PR review discussions'],
        ['Pricing Model', 'Free forever (MIT CLI)', 'Free tier up to 5k snapshots/mo; Starter at $179/mo'],
      ],
    )}${h2('Choose by workflow')}${list([
      '<strong>Choose Chromatic</strong> if your design-system team relies on hosted Storybook previews, cloud snapshot parallelization, and collaborative web sign-off.',
      '<strong>Choose Frontguard</strong> if you want to test full application routes and Storybook stories locally on your own CI runners with git-native baselines.',
    ])}${p('See the maintained comparison matrix at <a href="/comparisons" style="color: #e8862e;">/comparisons</a>.')}`,
  ),

  // ==========================================================================
  // 33. DEPLOYMENT & SANDBOXING: self-host
  // ==========================================================================
  makeArticle(
    'self-host',
    'Self-Host',
    'Deployment & Sandboxing',
    ['Current status', 'Architecture components', 'Before production use'],
    `${note(
      'PRE-RELEASE CLOUD.',
      'The local CLI needs no Frontguard service. Cloud source is included, but there is no supported one-command production self-host path.',
    )}${lead(
      'Remember that @frontguard/cli, @frontguard/playwright, and @frontguard/mcp (in local report mode) require zero servers or cloud backends. This page documents the optional packages/cloud-api source for engineers evaluating self-hosted Cloudflare Workers.',
    )}${h2('Current status')}${p(
      'The Compose build is not a verified clean-checkout flow and fails before the API starts because its package-scoped build context cannot access the repository OpenAPI sync script.',
    )}${h2('Architecture components')}${table(
      ['Component', 'Source Location', 'Technology Stack'],
      [
        ['Cloud API Worker', 'packages/cloud-api/', 'Hono HTTP router targeting Cloudflare Workers'],
        ['Metadata Store', 'packages/cloud-api/migrations/', 'Cloudflare D1 (SQLite) for runs, baselines, monitors, and SHA-256 hashed API keys'],
        ['CAS Blob Store', 'packages/cloud-api/src/routes/cas.ts', 'Cloudflare R2 bucket storing content-addressed PNGs under cas/{tenantScope}/{sha256}.png'],
      ],
    )}${h2('Before production use')}${p(
      'The renderer image is not published yet. Build from source only for local engineering evaluation, and verify migrations, retention, recovery, authentication, and tenant isolation before production use.',
    )}`,
  ),

  // ==========================================================================
  // 34. DEPLOYMENT & SANDBOXING: sandbox
  // ==========================================================================
  makeArticle(
    'sandbox',
    'Fix-verification sandbox',
    'Deployment & Sandboxing',
    ['Experimental status', 'How CSS patch verification works', 'Backends', 'Failure semantics'],
    `${note(
      'EXPERIMENTAL.',
      'Fix generation and verification are separate opt-ins. Local and Daytona backends do not establish cross-host render equivalence.',
    )}${lead(
      'When generateFixes and verifyFixes are enabled at the config top level and ai is configured, Frontguard tests candidate CSS patches in an isolated browser render before reporting them as Verified or Unverified.',
    )}${h2('Experimental status')}${p(
      'Verification applies a candidate patch, re-renders, and compares that result against the baseline. Verified and Unverified are observations from that run, not correctness guarantees.',
    )}${h2('How CSS patch verification works')}${steps([
      {
        title: 'Syntax & Safety Guard',
        body: 'Frontguard validates that the candidate CSS rule has balanced braces, a valid selector, and does not contain destructive hiding rules (such as display: none, visibility: hidden, or opacity: 0).',
      },
      {
        title: 'Isolated Style Injection',
        body: 'The sandbox opens the target route at the regressed viewport, injects the candidate CSS rule via page.addStyleTag({ content: patch }), and waits for layout stability.',
      },
      {
        title: 'Baseline Re-Comparison',
        body: 'The re-rendered PNG is compared against the original accepted baseline PNG. If the diff ratio drops within threshold without introducing new diff clusters, the suggestion is marked Verified.',
      },
    ])}${h2('Backends')}${table(
      ['Sandbox Backend', 'Configuration', 'Description'],
      [
        ['Local Playwright (Default)', 'verifyFixes: true', 'Re-renders the page in an isolated Playwright BrowserContext on the current machine.'],
        ['Daytona Container Sandbox', "fixSandbox: 'daytona'", 'Executes isolated verification inside an ephemeral Daytona workspace when configured.'],
      ],
    )}${h2('Failure semantics')}${p(
      'If sandbox verification fails or times out, Frontguard preserves the original visual regression failure and labels the candidate fix as Unverified so your CI gate remains strict.',
    )}`,
  ),

  // ==========================================================================
  // 35. DEPLOYMENT & SANDBOXING: cross-os-rendering
  // ==========================================================================
  makeArticle(
    'cross-os-rendering',
    'Cross-OS rendering',
    'Deployment & Sandboxing',
    ['Current status', 'Local build', 'Running with --docker', 'Limit'],
    `${note(
      'NOT VALIDATED.',
      'The renderer is currently repository-source-only: no public image or cross-host byte-equivalence result is published.',
    )}${lead(
      'Because macOS CoreText and Linux FreeType rasterize fonts differently, teams comparing baselines across macOS laptops and Linux CI runners can build the local linux/amd64 Docker renderer from source.',
    )}${h2('Current status')}${p(
      'From a clean clone, run the complete preparation sequence below at the repository root. The Dockerfile requires the renamed npm pack tarball in its build context.',
    )}${h2('Local build')}${code(
      'terminal',
      `$ npm ci
$ npm run build --workspace=packages/cli
$ npm pack ./packages/cli --pack-destination packages/cli/docker
$ mv packages/cli/docker/frontguard-cli-*.tgz packages/cli/docker/frontguard-cli.tgz
$ docker build --platform linux/amd64 -t frontguard/render:0.2.3 packages/cli/docker
$ docker image inspect frontguard/render:0.2.3`,
    )}${h2('Running with --docker')}${p(
      'After the image is built, invoke it from a configured project. A container cannot reach a host app through localhost, so this staging example overrides baseUrl deliberately.',
    )}${code(
      'configured project terminal',
      `$ npx -p @frontguard/cli frontguard run --docker --url https://staging.example.com`,
    )}${h2('Limit')}${p(
      'Use docker manifest inspect only for an image reference you expect to be remote. The current renderer is not yet published, so build and inspect it locally.',
    )}`,
  ),

  // ==========================================================================
  // 36. DEPLOYMENT & SANDBOXING: distribution
  // ==========================================================================
  makeArticle(
    'distribution',
    'Where to find Frontguard',
    'Deployment & Sandboxing',
    ['npm registry', 'Package inventory', 'Repository manifests', 'Release status'],
    `${lead(
      'The supported distribution surface is the published npm package line. Repository manifests for Actions and integrations are available for evaluation, but marketplace and hosted onboarding remain pre-release.',
    )}${h2('npm registry')}${code(
      'terminal',
      `$ npm install -D @frontguard/cli
$ npm install -D @frontguard/playwright
$ npx -y @frontguard/mcp  # works locally with FRONTGUARD_LOCAL_REPORT or requires an explicit verified API deployment`,
    )}${h2('Package inventory')}${table(
      ['npm Package', 'Binary / Entrypoint', 'Role'],
      [
        ['@frontguard/cli', 'frontguard', 'Core CLI runner, orphan-branch baseline manager, 4-mode HTML workbench, and built-in plugins.'],
        ['@frontguard/playwright', 'import { visualTest }', 'In-test visual regression helper for @playwright/test suites.'],
        ['@frontguard/mcp', 'frontguard-mcp (stdio)', '7-tool Model Context Protocol server for AI coding agents.'],
        ['create-frontguard-plugin', 'create-frontguard-plugin', 'CLI scaffolder for custom TypeScript lifecycle plugins.'],
      ],
    )}${h2('Repository manifests')}${p(
      'Source code is hosted at https://github.com/ravidsrk/frontguard under the MIT License, with machine-readable documentation published at /llms.txt, /llms-full.txt, /agents.md, and /openapi.json.',
    )}${h2('Release status')}${p(
      'A checked-in manifest does not mean its external consumer journey is live. Verify exact versions and immutable references before production use.',
    )}`,
  ),

  // ==========================================================================
  // 37. TRUST: results
  // ==========================================================================
  makeArticle(
    'results',
    'Validation results',
    'Trust',
    ['Published run', 'What it proves', 'What remains unvalidated'],
    `${note(
      'LIMITED EVIDENCE.',
      'The published result is a local execution snapshot, not an AI-accuracy or cross-platform benchmark.',
    )}${lead(
      'Frontguard publishes raw validation artifacts in validation/results-v0.2.md rather than unverified marketing percentages.',
    )}${h2('Published run')}${code(
      'validation/results-v0.2.md',
      `39 / 43 route rechecks completed
2 / 5 fixture repositories booted successfully
AI analysis: disabled
Host matrix: one macOS host`,
    )}${h2('What it proves')}${list([
      'The local CLI route discovery, Playwright rendering pool, and pixel/SSIM comparison pipeline completed 39 of 43 route rechecks across the 2 fixture applications that booted cleanly on the test host.',
      'Repeated local rechecks on the same host with deterministic stabilization enabled produced consistent pass/fail outcomes.',
    ])}${h2('What remains unvalidated')}${p(
      'The run did not seed known visual regressions, measure model precision or recall, compare operating systems, or prove public Action and hosted workflows.',
    )}`,
  ),
]

export const navGroups: { label: string; ids: string[] }[] = [
  { label: 'GETTING STARTED', ids: ['index', 'installation', 'quick-start'] },
  {
    label: 'REFERENCE',
    ids: [
      'cli/index',
      'cli/commands',
      'cli/configuration',
      'playwright/index',
      'playwright/setup',
      'playwright/api',
    ],
  },
  { label: 'CI/CD', ids: ['ci-cd/index', 'ci-cd/github-actions'] },
  {
    label: 'GUIDES — FEATURES',
    ids: [
      'guides/ai-analysis',
      'guides/ai-fixes',
      'guides/accessibility',
      'guides/performance-budgets',
      'guides/third-party-scripts',
      'guides/production-monitoring',
      'guides/cloud-api',
    ],
  },
  {
    label: 'GUIDES — EXTENDING',
    ids: ['guides/custom-plugins', 'guides/create-plugin', 'guides/github-actions'],
  },
  {
    label: 'GUIDES — MIGRATION',
    ids: ['guides/migrate-from-backstopjs', 'guides/migrate-from-lost-pixel'],
  },
  {
    label: 'INTEGRATIONS',
    ids: [
      'integrations/mcp',
      'integrations/storybook',
      'integrations/netlify',
      'integrations/slack',
      'integrations/vercel',
      'integrations/github',
    ],
  },
  {
    label: 'COMPARISONS',
    ids: [
      'comparisons/frontguard-vs-argos',
      'comparisons/frontguard-vs-percy',
      'comparisons/frontguard-vs-chromatic',
    ],
  },
  {
    label: 'DEPLOYMENT & SANDBOXING',
    ids: ['self-host', 'sandbox', 'cross-os-rendering', 'distribution'],
  },
  { label: 'TRUST', ids: ['results'] },
]

export const DOC_SLUGS = articles.map((article) => article.id) as readonly string[]

export const FIRST_DOC_SLUG = 'index'
