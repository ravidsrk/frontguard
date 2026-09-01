// Public documentation is intentionally conservative. Detailed integration
// guides return only after their external consumer journeys are verified.

export type Article = {
  id: string
  label: string
  section: string
  toc: string[]
  html: string
}

const h1 = (text: string) =>
  `<h1 style="font-size: 42px; letter-spacing: -0.035em; font-weight: 700; color: #f5f1ea; margin: 0 0 18px; line-height: 1.05;">${text}</h1>`

const h2 = (text: string) =>
  `<h2 style="font-size: 26px; letter-spacing: -0.02em; font-weight: 600; color: #f5f1ea; margin: 40px 0 16px;">${text}</h2>`

const p = (text: string) =>
  `<p style="font-size: 16px; line-height: 1.65; color: #c8c0b6; margin: 0 0 18px;">${text}</p>`

const code = (label: string, body: string) =>
  `<div style="background: #121110; border: 1px solid #2a2622; margin-bottom: 28px;"><div style="border-bottom: 1px solid #211e1b; background: #161412; padding: 9px 16px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #564f48;">${label}</div><pre style="margin: 0; padding: 18px 20px; font-family: 'JetBrains Mono', monospace; font-size: 13px; line-height: 1.8; color: #d8d0c5; overflow-x: auto;">${body}</pre></div>`

const note = (label: string, body: string) =>
  `<div style="background: #1a130b; border: 1px solid #3a2a18; margin-bottom: 28px; padding: 18px 20px;"><p style="font-size: 15px; line-height: 1.6; color: #e6e0d6; margin: 0;"><strong style="color: #e8862e;">${label}</strong> ${body}</p></div>`

const list = (items: string[]) =>
  `<ul style="font-size: 16px; line-height: 1.65; color: #c8c0b6; margin: 0 0 24px; padding-left: 24px;">${items.map((item) => `<li style="margin-bottom: 8px;">${item}</li>`).join('')}</ul>`

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
  makeArticle(
    'index',
    'Getting Started',
    'Getting started',
    ['Supported path', 'Quick start', 'Baseline contract'],
    `${localCliNotice}${p('Frontguard renders configured pages, compares screenshots against reviewed baselines, and writes console, JSON, and HTML evidence. Optional model-assisted analysis runs only when you configure a provider.')}${h2('Quick start')}${code('terminal - setup', `$ npx -p @frontguard/cli frontguard init --ci`)}${p("In a separate app terminal, use your project's dev-server command and leave it running. The command below is one example; wait for the baseUrl generated in frontguard.config.ts to respond.")}${code('app terminal - leave running', `$ npm run dev`)}${p('Then use a Frontguard terminal; these commands read baseUrl from the generated config.')}${code('Frontguard terminal', `$ npx -p @frontguard/cli frontguard doctor
$ npx -p @frontguard/cli frontguard update-baselines
$ git push origin frontguard-baselines
$ npx -p @frontguard/cli frontguard run`)}${h2('Baseline contract')}${p('Ordinary runs never accept CLI screenshots. Review captures first, then use frontguard update-baselines explicitly. Unaccepted new pages and regressions exit non-zero.')}`,
    'Frontguard',
  ),
  makeArticle(
    'installation',
    'Installation',
    'Getting started',
    ['CLI', 'Playwright package', 'Prerequisites'],
    `${localCliNotice}${p('Use Node.js 20 or newer. Install the package that matches the workflow you intend to run.')}${code('terminal', `$ npm install -D @frontguard/cli
$ npm install -D @frontguard/playwright
$ npx -p @frontguard/cli frontguard doctor`)}${p('The CLI and Playwright package use different baseline stores and acceptance behavior; do not treat them as interchangeable.')}`,
  ),
  makeArticle(
    'quick-start',
    'Quick Start',
    'Getting started',
    ['Initialize', 'Accept baselines', 'Compare'],
    `${p('Initialize first, then run the app and Frontguard in separate terminals.')}${code('terminal - setup', `$ npx -p @frontguard/cli frontguard init`)}${p("In the app terminal, use your project's dev-server command and leave it running. The command below is one example; wait for the generated config baseUrl to respond.")}${code('app terminal - leave running', `$ npm run dev`)}${p('In the Frontguard terminal, use the generated config rather than overriding its URL.')}${code('Frontguard terminal', `$ npx -p @frontguard/cli frontguard doctor
$ npx -p @frontguard/cli frontguard update-baselines
$ git push origin frontguard-baselines
$ npx -p @frontguard/cli frontguard run`)}${p('Exit code 0 means comparisons passed or warned, 1 means regressions or unaccepted new screenshots, and 2 means no comparisons or a tool error.')}`,
  ),
  makeArticle(
    'cli/index',
    'CLI Overview',
    'Reference',
    ['Pipeline', 'Artifacts', 'Next step'],
    `${p('The CLI discovers routes, renders configured browser and viewport combinations, compares pixels, optionally requests model assistance, and writes reports.')}${list(['Baselines live on the frontguard-baselines orphan branch.', 'JSON mode writes machine-readable output to stdout.', 'The HTML report keeps baseline, current, and diff evidence on disk.'])}${p('Continue with CLI Commands for the supported command and exit-code contract.')}`,
  ),
  makeArticle(
    'cli/commands',
    'CLI Commands',
    'Reference',
    ['Commands', 'Threshold units', 'Exit codes', 'Monitoring'],
    `${p('The supported command surface includes run, init, update-baselines, doctor, monitor, fix-pattern commands, and plugin subcommands.')}${code('terminal', `$ frontguard run --url http://localhost:3000 --threshold 0.01
$ frontguard update-baselines --url http://localhost:3000
$ frontguard doctor
$ frontguard monitor --url https://example.com --threshold 0.05
$ frontguard monitor --history`)}${h2('Threshold units')}${p('Changed-pixel ratio (0-1; 0.01 = 1%). Legacy values over 1 are deprecated. The monitor alert threshold uses the same ratio convention: 0.05 = 5%.')}${h2('Exit codes')}${list(['0: comparisons passed or produced warnings only.', '1: regressions or unaccepted new screenshots.', '2: no comparisons or any tool error; errors take precedence over regressions.'])}${h2('Monitoring')}${p('The local monitor command records run history under .frontguard/monitor-history by default. Webhook delivery is best-effort; no managed cloud scheduler is generally available.')}`,
  ),
  makeArticle(
    'cli/configuration',
    'Configuration',
    'Reference',
    ['Minimal configuration', 'Optional controls'],
    `${p('Configuration lives in frontguard.config.ts. Threshold values are fractions from 0 to 1.')}${code('frontguard.config.ts', `export default {
  version: 1,
  baseUrl: 'http://localhost:3000',
  routes: ['/', '/pricing'],
  viewports: [375, 768, 1440],
  browsers: ['chromium'],
  threshold: 0.01,
  ignore: [],
  smartRender: true,
  workers: 4,
  pageTimeout: 30000,
  maxHeight: 5000,
  outputDir: '.frontguard/results',
}`)}${p('Optional controls include masks, SSIM fallback, time freezing, configurable multi-render consensus, telemetry opt-in, and BYOK analysis. Verify an option against the installed package version before adding it.')}`,
  ),
  makeArticle(
    'playwright/index',
    'Playwright Plugin',
    'Reference',
    ['Behavior', 'Example', 'Baseline model'],
    `${note('SEPARATE BASELINE MODEL.', 'The Playwright package stores files in __visual_baselines__ by default. Unlike ordinary CLI runs, visualTest creates a missing baseline and reports isNewBaseline: true.')}${code('visual.spec.ts', `import { test, expect } from '@playwright/test'
import { visualTest } from '@frontguard/playwright'

test('home', async ({ page }) =&gt; {
  await page.goto('/')
  const result = await visualTest(page, 'home')
  expect(result.passed).toBe(true)
})`)}${p('Set FRONTGUARD_UPDATE=1 or pass update: true to replace Playwright-package baselines deliberately. Commit those baseline files according to your repository policy.')}`,
  ),
  makeArticle(
    'playwright/setup',
    'Setup & Installation',
    'Reference',
    ['Install', 'Configure', 'Review'],
    `${code('terminal', '$ npm install -D @playwright/test @frontguard/playwright')}${p('Call visualTest after navigation. The package reuses the current Playwright page, captures a PNG, and writes baseline/current/diff files under the configured baselineDir.')}${p('A newly created Playwright baseline passes with isNewBaseline: true, so review and commit it rather than assuming an independent approval occurred.')}`,
  ),
  makeArticle(
    'playwright/api',
    'API Reference',
    'Reference',
    ['Signature', 'Options', 'Result'],
    `${code('typescript', `visualTest(
  page: Page,
  name: string,
  options?: VisualTestOptions,
): Promise&lt;VisualTestResult&gt;`)}${p('Options include threshold, fullPage, mask, maskRegions, optional AI, freezeTime, baselineDir, and update. Threshold is the fraction of pixels that may differ (0-1).')}${p('The result includes passed, diffPercentage, paths, optional AI output, SSIM, and isNewBaseline. Compare the returned result in your test; the function does not call a Playwright assertion for you.')}`,
  ),
  makeArticle(
    'ci-cd/index',
    'CI/CD Overview',
    'CI/CD',
    ['Supported path', 'Output', 'Action status'],
    `${p('Run the CLI in any Node-based CI environment after the target application or preview URL is reachable. Keep ordinary pull-request jobs comparison-only and update baselines in a separate, explicit workflow.')}${p('JSON is emitted to stdout only. Redirect it to ./frontguard-result.json if another step needs a file. The HTML report is written under the configured output directory.')}${p('PR comments need a GitHub token and may be text-only unless an imageUpload backend is configured. The public composite Action still needs an external consumer smoke test.')}`,
  ),
  makeArticle(
    'ci-cd/github-actions',
    'GitHub Actions',
    'CI/CD',
    ['Release status', 'Permissions', 'Baseline updates'],
    `${note('PRE-RELEASE ACTION.', 'The external consumer smoke is pending, so there is no public copy-ready Action workflow yet. Use the generated CLI workflow until publication, tag advancement, and both smoke controls pass.')}${p('The repo-root action.yml is the future marketplace consumer shim. It requires contents: write only when update-baselines is true; PR reporting requires pull-requests: write.')}${p('Updated baselines still require the workflow to push frontguard-baselines in explicit update mode. Do not infer that the public v0 ref has passed this journey until the external smoke test is recorded.')}`,
  ),
  makeArticle(
    'guides/ai-analysis',
    'AI Analysis',
    'Guides',
    ['Scope', 'Providers', 'Evidence limits'],
    `${note('OPTIONAL BYOK.', 'Model-assisted analysis is not required for local pixel comparison. Screenshot evidence is sent directly to the provider account you configure.')}${p('Changed screenshots can be classified as regression, intentional, or content_update with a confidence score and explanation. An intentional classification at 0.8 confidence or higher automatically downgrades a regression to a warning; inspect the model output before relying on that CI result.')}${p('Frontguard has not published a model precision/recall benchmark. The current validation run had AI disabled, so it cannot support an accuracy claim.')}`,
  ),
  makeArticle(
    'guides/ai-fixes',
    'AI Fixes & the Fix-Pattern Database',
    'Guides',
    ['Experimental status', 'Verification', 'Human review'],
    `${note('EXPERIMENTAL.', 'Suggestion generation and sandbox verification are separate opt-ins. Suggestions can exist without verification.')}${p('With generateFixes and verifyFixes enabled, Frontguard can apply a CSS suggestion in a sandbox, re-render, and label the outcome Verified or Unverified. A verified result is automatically recorded as an accepted local fix-pattern signal when that database is available.')}${p('That automatic record does not update screenshot baselines or guarantee correctness. Review every patch and run broader tests.')}`,
  ),
  makeArticle(
    'guides/accessibility',
    'Accessibility Audits',
    'Guides',
    ['Status', 'Use', 'Limit'],
    `${note('OPTIONAL PLUGIN.', 'The accessibility plugin depends on @axe-core/playwright and reports automated findings alongside a run.')}${p('Install the optional dependency and import the plugin from @frontguard/cli/plugins. Automated axe results do not establish WCAG conformance and do not replace keyboard or assistive-technology review.')}`,
  ),
  makeArticle(
    'guides/performance-budgets',
    'Performance Budgets',
    'Guides',
    ['Experimental status', 'Current limit'],
    `${note('EXPERIMENTAL.', 'The plugin can collect and report selected metrics, but its failOnBudgetExceeded path is not a verified standalone CI gate in the current release.')}${p('Use the plugin output as supplemental evidence. Keep an independently verified performance gate for release decisions until the plugin exit-code path has a failing-first acceptance test.')}`,
  ),
  makeArticle(
    'guides/third-party-scripts',
    'Third-Party Script Monitoring',
    'Guides',
    ['Import', 'Behavior', 'Limit'],
    `${note('LOCAL PLUGIN.', 'The plugin inventories third-party script origins and compares the stored inventory between runs.')}${code('frontguard.config.ts', `import { createThirdPartyScriptPlugin } from '@frontguard/cli/plugins'

export default {
  plugins: [createThirdPartyScriptPlugin()],
}`)}${p('An origin change is evidence to review, not proof that a script is malicious or that it caused a layout regression.')}`,
  ),
  makeArticle(
    'guides/production-monitoring',
    'Production Monitoring',
    'Guides',
    ['Local CLI', 'History', 'Hosted status'],
    `${note('LOCAL ONLY.', 'The implemented path is frontguard monitor run by your own process, cron, or CI. A managed cloud scheduler is not generally available.')}${code('terminal', `$ frontguard monitor --url https://example.com --threshold 0.05 --once
$ frontguard monitor --history`)}${p('CLI monitor records run history under .frontguard/monitor-history by default. Webhook failures are reported but should not be treated as a durable paging system.')}`,
  ),
  makeArticle(
    'guides/cloud-api',
    'Cloud API',
    'Guides',
    ['Current status', 'Required URL', 'Production warning'],
    `${cloudNotice}${p('Cloudflare Worker, D1, and R2 source exists for development and contract evaluation. api.frontguard.dev is not a working hosted default.')}${code('environment', 'FRONTGUARD_API_URL=https://your-frontguard-api.example.com')}${p('Do not use the pre-release cloud for production data until deployment, migrations, retention, recovery, and tenant isolation are independently verified.')}`,
  ),
  makeArticle(
    'guides/custom-plugins',
    'Custom Plugins',
    'Guides',
    ['Interface', 'Lifecycle', 'Compatibility'],
    `${p('CLI plugins are plain objects implementing documented lifecycle hooks. Import public types and built-in factories from the installed @frontguard/cli package rather than copying internal source paths.')}${p('Hooks run in registration order and teardown runs in reverse order. Pin the CLI version and test plugin behavior against that version; no cross-version compatibility promise is published.')}`,
  ),
  makeArticle(
    'guides/create-plugin',
    'Create & Publish a Plugin',
    'Guides',
    ['Current status', 'Safe workflow'],
    `${note('AUTHOR GUIDE PENDING.', 'The prior scaffold examples were malformed and have been withdrawn rather than presented as executable code.')}${p('Build against the public plugin interfaces exported by your installed CLI version, add tests in the plugin repository, and follow the npm publishing process you independently verify. Frontguard does not operate a plugin registry or compatibility certification service.')}`,
  ),
  makeArticle(
    'guides/github-actions',
    'GitHub Actions',
    'Guides',
    ['Generated workflow', 'Baseline workflow', 'Composite Action'],
    `${p('frontguard init --ci generates a comparison-only workflow that invokes the CLI directly, uses contents: read, and uploads the HTML artifact. Configure FRONTGUARD_OPENAI_KEY or FRONTGUARD_ANTHROPIC_KEY only if optional analysis is enabled.')}${p('Baseline acceptance belongs in a separate explicit workflow: run frontguard update-baselines, review the result, then push frontguard-baselines.')}${p('The generated workflow and the repository composite Action are separate surfaces. The public Action remains pre-release pending an external consumer smoke test.')}`,
  ),
  makeArticle(
    'guides/migrate-from-backstopjs',
    'Migrate from BackstopJS',
    'Guides',
    ['Scope', 'Baseline migration', 'Thresholds'],
    `${note('MANUAL MIGRATION.', 'Frontguard does not claim a lossless one-command BackstopJS conversion.')}${list(['Map scenario URLs to routes and viewport widths.', 'Convert misMatchThreshold percentages to Frontguard ratios by dividing by 100.', 'Start the app, review captures, run frontguard update-baselines, and push frontguard-baselines.', 'Keep both tools in CI until the new comparisons are independently reviewed.'])}`,
  ),
  makeArticle(
    'guides/migrate-from-lost-pixel',
    'Migrate from Lost Pixel',
    'Guides',
    ['Scope', 'Baseline migration', 'Cutover'],
    `${note('MANUAL MIGRATION.', 'Frontguard does not import hosted review history or automatically approve Lost Pixel snapshots.')}${list(['Map page and Storybook captures to Frontguard routes.', 'Configure viewports and thresholds explicitly.', 'Review and accept new Frontguard baselines with update-baselines.', 'Run both systems until your team accepts the new evidence and failure semantics.'])}`,
  ),
  makeArticle(
    'integrations/mcp',
    'MCP server',
    'Integrations',
    ['Configuration', 'Tools', 'Approval limit'],
    `${cloudNotice}${code('configuration', `FRONTGUARD_API_URL=https://your-frontguard-api.example.com
FRONTGUARD_API_KEY=&lt;frontguard-api-key&gt;`)}${p('The MCP server can list accessible runs and regressions and return stored suggestions. accept_baseline records whole-run approval metadata only. Screenshot promotion is not implemented.')}`,
  ),
  makeArticle(
    'integrations/storybook',
    'Storybook',
    'Integrations',
    ['Implemented source', 'Configuration', 'Release limit'],
    `${note('SOURCE AVAILABLE.', 'The CLI includes Storybook index discovery and play-function-aware capture, but the public integration journey has not been externally acceptance-tested.')}${code('frontguard.config.ts', `storybook: {
  url: 'http://localhost:6006',
}`)}${p('Run Storybook yourself, review discovered stories, and use the normal explicit CLI baseline workflow. Do not assume a hosted Storybook review service is included.')}`,
  ),
  makeArticle(
    'integrations/netlify',
    'Netlify',
    'Integrations',
    ['Status', 'Cloud requirement'],
    `${integrationNotice}${cloudNotice}${p('The checked-in Netlify plugin source is for evaluation. No marketplace listing or production PR-comment journey is claimed.')}`,
  ),
  makeArticle(
    'integrations/slack',
    'Slack',
    'Integrations',
    ['Status', 'Cloud requirement'],
    `${integrationNotice}${cloudNotice}${p('The checked-in Slack worker and OAuth source are for evaluation. No installed public app, durable alert delivery, or support commitment is claimed.')}`,
  ),
  makeArticle(
    'integrations/vercel',
    'Vercel',
    'Integrations',
    ['Status', 'Cloud requirement'],
    `${integrationNotice}${cloudNotice}${p('The checked-in Vercel integration source is for evaluation. No marketplace installation or automatic hosted rendering journey is claimed.')}`,
  ),
  makeArticle(
    'integrations/github',
    'GitHub App',
    'Integrations',
    ['Current limitations', 'Use today'],
    `${integrationNotice}${list(['Deployment events do not resume a pending Check Run.', 'Repository config and project baseline scope are not forwarded to cloud runs.', 'The bootstrap pinned to ravidsrk/frontguard@v0 does not start the target application.', 'Cloud approval records metadata but does not promote screenshots.'])}${p('Use the local CLI or a workflow you have independently verified. The GitHub App is not a replacement for those paths today.')}`,
  ),
  makeArticle(
    'comparisons/frontguard-vs-argos',
    'Frontguard vs Argos',
    'Comparisons',
    ['Scope', 'Choose by workflow'],
    `${comparisonNotice}${p('Argos offers a mature hosted review workflow. Frontguard currently offers a local MIT CLI with git-native baselines and optional BYOK analysis. Choose based on whether your team needs a supported hosted review surface.')}${p('See the maintained comparison matrix at <a href="/comparisons" style="color: #e8862e;">/comparisons</a>.')}`,
  ),
  makeArticle(
    'comparisons/frontguard-vs-percy',
    'Frontguard vs Percy',
    'Comparisons',
    ['Scope', 'Choose by workflow'],
    `${comparisonNotice}${p('Percy is an established BrowserStack-hosted review product. Frontguard is a local CLI and does not offer Percy\'s mature hosted review surface. Optional model assistance is not a substitute for that operational product.')}${p('See the maintained comparison matrix at <a href="/comparisons" style="color: #e8862e;">/comparisons</a>.')}`,
  ),
  makeArticle(
    'comparisons/frontguard-vs-chromatic',
    'Frontguard vs Chromatic',
    'Comparisons',
    ['Scope', 'Choose by workflow'],
    `${comparisonNotice}${p('Chromatic is a hosted Storybook-centered visual review product. Frontguard can discover a running Storybook but remains a local CLI workflow without an equivalent hosted review service.')}${p('See the maintained comparison matrix at <a href="/comparisons" style="color: #e8862e;">/comparisons</a>.')}`,
  ),
  makeArticle(
    'self-host',
    'Self-Host',
    'Deployment & Sandboxing',
    ['Current status', 'Before production use'],
    `${note('PRE-RELEASE CLOUD.', 'The local CLI needs no Frontguard service. Cloud source is included, but there is no supported one-command production self-host path.')}${p('The Compose build is not a verified clean-checkout flow and fails before the API starts because its package-scoped build context cannot access the repository OpenAPI sync script.')}${p('The renderer image is not published yet. Build from source only for local engineering evaluation, and verify migrations, retention, recovery, authentication, and tenant isolation before production use.')}`,
  ),
  makeArticle(
    'sandbox',
    'Fix-verification sandbox',
    'Deployment & Sandboxing',
    ['Experimental status', 'Backends', 'Failure semantics'],
    `${note('EXPERIMENTAL.', 'Fix generation and verification are separate opt-ins. Local and Daytona backends do not establish cross-host render equivalence.')}${p('Verification applies a candidate patch, re-renders, and compares that result against the baseline. Verified and Unverified are observations from that run, not correctness guarantees.')}`,
  ),
  makeArticle(
    'cross-os-rendering',
    'Cross-OS rendering',
    'Deployment & Sandboxing',
    ['Current status', 'Local build', 'Limit'],
    `${note('NOT VALIDATED.', 'The renderer is currently repository-source-only: no public image or cross-host byte-equivalence result is published.')}${p('From a clean clone, run the complete preparation sequence below at the repository root. The Dockerfile requires the renamed npm pack tarball in its build context.')}${code('terminal', `$ npm ci
$ npm run build --workspace=packages/cli
$ npm pack ./packages/cli --pack-destination packages/cli/docker
$ mv packages/cli/docker/frontguard-cli-*.tgz packages/cli/docker/frontguard-cli.tgz
$ docker build --platform linux/amd64 -t frontguard/render:0.2.3 packages/cli/docker
$ docker image inspect frontguard/render:0.2.3`)}${p('After the image is built, invoke it from a configured project. A container cannot reach a host app through localhost, so this staging example overrides baseUrl deliberately.')}${code('configured project terminal', `$ npx -p @frontguard/cli frontguard run --docker --url https://staging.example.com`)}${p('Use docker manifest inspect only for an image reference you expect to be remote. The current renderer is not yet published, so build and inspect it locally.')}`,
  ),
  makeArticle(
    'distribution',
    'Where to find Frontguard',
    'Deployment & Sandboxing',
    ['npm registry', 'Repository manifests', 'Release status'],
    `${p('The supported distribution surface is the published npm package line. Repository manifests for Actions and integrations are available for evaluation, but marketplace and hosted onboarding remain pre-release.')}${code('terminal', `$ npm install -D @frontguard/cli
$ npm install -D @frontguard/playwright
$ npx -y @frontguard/mcp  # requires an explicit verified API deployment`)}${p('A checked-in manifest does not mean its external consumer journey is live. Verify exact versions and immutable references before production use.')}`,
  ),
  makeArticle(
    'results',
    'Validation results',
    'Trust',
    ['Published run', 'What it proves', 'What remains unvalidated'],
    `${note('LIMITED EVIDENCE.', 'The published result is a local execution snapshot, not an AI-accuracy or cross-platform benchmark.')}${code('validation/results-v0.2.md', `39 / 43 route rechecks completed
2 / 5 fixture repositories booted successfully
AI analysis: disabled
Host matrix: one macOS host`)}${p('The run did not seed known visual regressions, measure model precision or recall, compare operating systems, or prove public Action and hosted workflows.')}`,
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
