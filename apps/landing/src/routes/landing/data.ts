/*
  Landing content, ported verbatim from the design source
  (docs/design-extract/source/Landing.dc.html `renderVals()`), so the React tree
  is data-driven exactly like the design and each section test asserts against one
  source of truth. Text is the design's; no fabricated numbers.
*/
import type { CmpRow } from '../../components/ui';
import type { Status } from '../../components/ui/status';

/* ---- 6-stage pipeline ---- */
export interface Stage {
  num: string;
  title: string;
  desc: string;
}

export const STAGES: Stage[] = [
  { num: '01', title: 'Discover', desc: 'Crawl, filesystem scan, or config — finds every route automatically.' },
  { num: '02', title: 'Filter', desc: 'Dependency graph renders only pages affected by your changes.' },
  { num: '03', title: 'Render', desc: 'Playwright × viewports × browsers. Anti-flake multi-render.' },
  { num: '04', title: 'Diff', desc: 'pixelmatch fast gate, then DOM + computed-style diff.' },
  { num: '05', title: 'Analyze', desc: 'AI vision classifies, explains, and scores confidence.' },
  { num: '06', title: 'Report', desc: 'Console, JSON, HTML, and a GitHub PR comment with diffs.' },
];

/* ---- 9-cell features grid (carries all six floor features + the design's extras) ---- */
export interface Feature {
  tag: string;
  title: string;
  desc: string;
}

export const FEATURES: Feature[] = [
  { tag: 'DISCOVERY', title: 'Zero-config routes', desc: 'Auto-crawls your app to find every page. No manual route lists.' },
  { tag: 'RENDER', title: 'Multi-browser', desc: 'Chromium, Firefox and WebKit via Playwright from day one.' },
  { tag: 'SPEED', title: 'Smart rendering', desc: 'Dependency graph renders only the pages your PR actually affects.' },
  { tag: 'STORAGE', title: 'Git-native baselines', desc: 'Stored in an orphan branch — zero bloat on your main branch.' },
  { tag: 'PREVIEW', title: 'Preview deploys', desc: 'Auto-detects Vercel and Netlify preview URLs. Push and go.' },
  { tag: 'CONFIG', title: 'Per-route thresholds', desc: 'Strict on /checkout, relaxed on /blog — all in one file.' },
  { tag: 'DETECT', title: 'Framework detection', desc: 'Next.js, Remix, SvelteKit, Nuxt and Astro out of the box.' },
  { tag: 'SECURITY', title: 'Security hardened', desc: 'Shell-injection prevention, path-traversal guards, key redaction.' },
  { tag: 'REPORT', title: 'PR thumbnails', desc: 'Baseline / current / diff images embedded right in the PR comment.' },
];

/* ---- Three pillars (Detect / Understand / Fix) ---- */
export interface Pillar {
  num: string;
  label: string;
  /** Status drives the numbered-label color: pass=green, warning=amber, new=blue. */
  tone: Status;
  title: string;
  desc: string;
}

export const PILLARS: Pillar[] = [
  {
    num: '01',
    label: 'DETECT',
    tone: 'pass',
    title: 'Find what changed',
    desc: 'Pixel diff plus DOM and computed-style diff across every viewport and browser — catching what humans miss. Multi-render consensus kills the flaky-screenshot noise.',
  },
  {
    num: '02',
    label: 'UNDERSTAND',
    tone: 'warning',
    title: 'Explain why it broke',
    desc: 'AI vision classifies every diff — regression, intentional, or content update — maps it to the exact code change, and explains the root cause in plain language.',
  },
  {
    num: '03',
    label: 'FIX',
    tone: 'new',
    title: 'Verified, not guessed',
    desc: 'Generate a fix, apply it, re-render, and compare again. Only fixes that provably resolve the regression are suggested — no hallucinated guesses.',
  },
];

/* ---- Problem strip 2×2 stat grid ---- */
export interface ProblemStat {
  value: string;
  label: string;
  /** The first stat is amber-accented in the design. */
  accent?: boolean;
}

export const PROBLEM_STATS: ProblemStat[] = [
  { value: '~40%', label: "of visual-diff runs fail for reasons that aren't real bugs", accent: true },
  { value: '73%', label: 'of teams have lost faith in test automation to flake' },
  { value: '<10%', label: 'of frontend teams run visual regression testing at all' },
  { value: '$100M', label: 'a single mobile CSS bug cost on Prime Day' },
];

/* ---- AI classification example verdict cards ---- */
export interface ExampleVerdict {
  status: Status;
  route: string;
  viewport: string;
  verdict: string;
  confidence: number;
  body: string;
  fix?: string;
}

export const AI_EXAMPLE_POINTS = [
  'Severity and confidence scoring on every issue',
  'Bring your own key — OpenAI or Anthropic',
  'Runs locally first; AI activates only on real diffs',
];

export const AI_EXAMPLE_VERDICTS: ExampleVerdict[] = [
  {
    status: 'regression',
    route: '/dashboard',
    viewport: '@ 375px',
    verdict: 'REGRESSION',
    confidence: 94,
    body: 'The sidebar overlaps the main content on mobile. A flex-direction change in Dashboard.module.css:28 removed the column stacking.',
    fix: 'Suggested fix: restore flex-direction: column at the < 768px breakpoint.',
  },
  {
    status: 'pass',
    route: '/pricing',
    viewport: '@ 1440px',
    verdict: 'INTENTIONAL',
    confidence: 91,
    body: "New 'Enterprise' pricing tier added. Layout intact, content expanded. Not a regression.",
  },
];

/* ---- 5-vendor comparison summary (links to /comparisons for the full 11-row matrix) ---- */
export const COMPARISON_COLUMNS = ['Capability', 'Frontguard', 'Percy', 'Chromatic', 'BackstopJS', 'Lost Pixel'];

/** g(): glyph cell; the design's ✓ / ◐ / ✕ vocabulary. */
const g = (glyph: 'full' | 'partial' | 'none') => ({ kind: 'glyph' as const, glyph });

export const COMPARISON_ROWS: CmpRow[] = [
  { capability: 'Open source (MIT)', cells: [g('full'), g('none'), g('partial'), g('full'), g('partial')] },
  { capability: 'CLI-first', cells: [g('full'), g('none'), g('none'), g('full'), g('full')] },
  { capability: 'AI change classification', cells: [g('full'), g('none'), g('none'), g('none'), g('none')] },
  { capability: 'AI fix verification', cells: [g('full'), g('none'), g('none'), g('none'), g('none')] },
  { capability: 'Anti-flake rendering', cells: [g('full'), g('partial'), g('partial'), g('none'), g('none')] },
  { capability: 'Self-hostable', cells: [g('full'), g('none'), g('none'), g('full'), g('partial')] },
  {
    capability: 'Free tier',
    cells: [
      { kind: 'text', text: 'Forever', tone: 'amber' },
      { kind: 'text', text: 'Trial', tone: 'muted' },
      { kind: 'text', text: 'Hobby', tone: 'muted' },
      { kind: 'text', text: 'Free', tone: 'muted' },
      g('none'),
    ],
  },
];

/* ---- Plugins panel: 6 lifecycle hooks + 5 built-in plugins ---- */
export const LIFECYCLE_HOOKS = [
  'beforeDiscover',
  'afterDiscover',
  'afterRender',
  'afterCompare',
  'afterRun',
  'onError',
];

export interface PluginCard {
  name: string;
  desc: string;
}

export const PLUGINS: PluginCard[] = [
  { name: 'Figma', desc: 'Design-to-code comparison & token extraction.' },
  { name: 'Perf Budgets', desc: 'LCP / CLS / TTFB thresholds tied to the diff.' },
  { name: 'Accessibility', desc: 'axe-core WCAG audits in the same render pass.' },
  { name: '3rd-Party Scripts', desc: 'Flags ad / analytics / widget drift between runs.' },
  { name: 'Monitor', desc: 'Production visual monitoring & alerting.' },
];

/* ---- "We'll tell you what it isn't" honest cards ---- */
export interface HonestCard {
  label: string;
  tone: Status;
  body: string;
}

export const HONEST_CARDS: HonestCard[] = [
  {
    label: 'YOU BRING THE KEY',
    tone: 'warning',
    body: 'AI runs on your own OpenAI or Anthropic key, so you pay per judged diff. The anti-flake gate keeps ~90% of pages away from the model — the bill stays small, and your screenshots never touch a server we run.',
  },
  {
    label: 'YOU STAY IN THE LOOP',
    tone: 'pass',
    body: 'Vision models misjudge edge cases. Frontguard never silently auto-approves — every classification and every fix is yours to accept or reject, and that feedback trains the local fix-pattern database.',
  },
  {
    label: 'NUMBERS, NOT CLAIMS',
    tone: 'new',
    body: "It's young. We validate against real, live repositories and publish real false-positive rates rather than asserting accuracy. Trust is earned — tell us where the classifier gets it wrong.",
  },
];
