import { useEffect, useRef, useState } from "react";

export const MONO = "'JetBrains Mono', monospace";

export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const trigger = (text: string) => {
    try {
      navigator.clipboard?.writeText(text);
    } catch {
      // ignore clipboard errors in restricted contexts
    }
    setCopied(true);
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, 1800);
  };

  return [copied, trigger];
}

export interface PipelineStage {
  num: string;
  title: string;
  artifact: string;
  desc: string;
}

export const STAGES: PipelineStage[] = [
  {
    num: "01",
    title: "Discover",
    artifact: "routes[]",
    desc: "Crawl, filesystem scan, Storybook index, or config — finds every route automatically.",
  },
  {
    num: "02",
    title: "Filter",
    artifact: "affected[]",
    desc: "Dependency graph renders only pages affected by your changes.",
  },
  {
    num: "03",
    title: "Render",
    artifact: "PNG + DOM",
    desc: "Playwright × viewports × browsers, with frame stability convergence, redaction, and optional multi-render consensus.",
  },
  {
    num: "04",
    title: "Diff",
    artifact: "DiffCluster[]",
    desc: "Pixel comparison with connected-component diff clustering, chroma YCbCr SSIM, and CW-SSIM.",
  },
  {
    num: "05",
    title: "Analyze",
    artifact: "AI / MCP",
    desc: "Optional BYOK analysis classifies, explains, and scores confidence without overriding exit codes.",
  },
  {
    num: "06",
    title: "Report",
    artifact: "HTML + JSON",
    desc: "Console, JSON, and an interactive HTML workbench with swipe, onion-skin, and cluster overlays.",
  },
];

export interface TelemetryStat {
  v: string;
  c: string;
  tag: string;
  d: string;
}

export const TELEMETRY_STATS: TelemetryStat[] = [
  {
    v: "39 / 43",
    c: "#e8862e",
    tag: "HARNESS RECHECKS",
    d: "route rechecks completed in the published local harness",
  },
  {
    v: "2 / 5",
    c: "#f5f1ea",
    tag: "FIXTURE BOOT",
    d: "fixture repositories booted successfully",
  },
  {
    v: "AI OFF",
    c: "#f5f1ea",
    tag: "DETERMINISTIC MODE",
    d: "classifier accuracy was not measured in that run",
  },
  {
    v: "1 HOST",
    c: "#f5f1ea",
    tag: "ENVIRONMENT SCOPE",
    d: "macOS only; cross-OS equivalence remains unproven",
  },
];

export interface PillarItem {
  n: string;
  c: string;
  h: string;
  p: string;
  spec: string[];
}

export const PILLARS: PillarItem[] = [
  {
    n: "01 / DETECT",
    c: "#4fb477",
    h: "Find what changed",
    p: "Pixel comparison across configured viewports and browsers, with connected-component diff clustering, spatial targetSelector DOM attribution, chroma/CW-SSIM perceptual scoring, masks, and optional multi-render consensus.",
    spec: [
      "8-connected Union-Find cluster bounding boxes + targetSelector",
      "ITU-R BT.709 YCbCr Chroma SSIM + CW-SSIM",
      "waitForStability · freezeTime · seedRandom · blockUrls",
    ],
  },
  {
    n: "02 / UNDERSTAND",
    c: "#e8862e",
    h: "Explain why it broke",
    p: "When configured, model-assisted analysis classifies changed screenshots and returns a confidence-scored explanation for human review across OpenAI, Anthropic, Google Gemini, or a custom OpenAI-compatible baseUrl.",
    spec: [
      "Advisory severity: critical · warning · info · noise",
      "Set-of-Mark [1] cropped diff strips",
      "Direct BYOK to OpenAI, Anthropic, Gemini, or custom baseUrl",
    ],
  },
  {
    n: "03 / FIX",
    c: "#5b8def",
    h: "Verified, not guessed",
    p: "Experimental CSS suggestions can be generated and, with a separate verification opt-in, applied in a sandbox and re-rendered. Unverified suggestions remain labeled as such.",
    spec: [
      "Opt-in sandbox style injection & re-render",
      "MCP verify_css_patch safety checks",
      "Never mutates source files or baselines silently",
    ],
  },
];

export interface BentoFeature {
  tag: string;
  title: string;
  desc: string;
  span: 4 | 6;
  accent: string;
  badge: string;
  detail: string;
}

export const BENTO_FEATURES: BentoFeature[] = [
  {
    tag: "STORAGE",
    title: "Git-native baselines",
    desc: "Stored in an orphan branch with SHA-256 manifest tracking and single-commit batching. Keep binary PNG bloat out of your working history.",
    span: 6,
    accent: "#4fb477",
    badge: "frontguard-baselines",
    detail: "manifest.json → sha256 digest + single-worktree commit",
  },
  {
    tag: "STABILITY & PRIVACY",
    title: "Frame convergence, anti-flake & PII redaction",
    desc: "Consecutive animation-frame luminance convergence, deterministic freezeTime / seedRandom / blockUrls controls, and redactSensitive DOM masking before capture.",
    span: 6,
    accent: "#e8862e",
    badge: "waitForStability · freezeTime · seedRandom",
    detail: "RAF × 2 convergence + blockUrls + DOM scrub",
  },
  {
    tag: "DISCOVERY",
    title: "Zero-config routes",
    desc: "Auto-crawls your app or scans Next.js App Router, Remix, SvelteKit, Nuxt, Astro, and Storybook indexes.",
    span: 4,
    accent: "#4fb477",
    badge: "6 frameworks + crawler",
    detail: "Handles route groups, parallel slots & dynamic segments",
  },
  {
    tag: "RENDER",
    title: "Multi-browser & color schemes",
    desc: "Chromium, Firefox, and WebKit via Playwright with light/dark colorScheme and pre-capture route actions.",
    span: 4,
    accent: "#5b8def",
    badge: "375 · 768 · 1440px",
    detail: "click · hover · fill · press · waitForSelector",
  },
  {
    tag: "SPEED",
    title: "Smart rendering",
    desc: "Static import dependency graph maps changed source files to routes and renders only what your PR affects.",
    span: 4,
    accent: "#e8862e",
    badge: "--affected",
    detail: "Skips untouched routes in monorepos and large apps",
  },
  {
    tag: "CONFIG",
    title: "Per-route thresholds & DOM attribution",
    desc: "Strict 0.1% pixel tolerance on /checkout, relaxed tolerance on /blog routes, plus spatial cluster.targetSelector DOM attribution.",
    span: 4,
    accent: "#f5f1ea",
    badge: "threshold · targetSelector",
    detail: "Route-scoped masks, selectors, and consensus count",
  },
  {
    tag: "SECURITY",
    title: "Security hardened",
    desc: "Shell-injection prevention, path-traversal guards, SSRF target checks, and untrusted DOM prompt wrapping.",
    span: 4,
    accent: "#4fb477",
    badge: "SSRF + key redaction",
    detail: "Local-first execution with strict secret scrubbing",
  },
  {
    tag: "REPORT",
    title: "Inspectable reports",
    desc: "Interactive local HTML workbench with Side-by-Side, Swipe, Onion Skin, Diff Focus, and keyboard navigation.",
    span: 4,
    accent: "#5b8def",
    badge: "j/k · 1-4 · b · /",
    detail: "Baseline, current, and diff PNGs stay on disk",
  },
];

export interface ComparisonRow {
  cap: string;
  fg: string;
  percy: string;
  chromatic: string;
  backstop: string;
  lostpixel: string;
}

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    cap: "Open source (MIT)",
    fg: "✓",
    percy: "✕",
    chromatic: "◐",
    backstop: "✓",
    lostpixel: "◐",
  },
  {
    cap: "CLI-first",
    fg: "✓",
    percy: "✕",
    chromatic: "✕",
    backstop: "✓",
    lostpixel: "✓",
  },
  {
    cap: "AI change classification",
    fg: "✓",
    percy: "◐",
    chromatic: "✕",
    backstop: "✕",
    lostpixel: "✕",
  },
  {
    cap: "Experimental fix verification",
    fg: "◐",
    percy: "✕",
    chromatic: "✕",
    backstop: "✕",
    lostpixel: "✕",
  },
  {
    cap: "Configurable multi-render consensus",
    fg: "◐",
    percy: "◐",
    chromatic: "◐",
    backstop: "✕",
    lostpixel: "✕",
  },
  {
    cap: "Runs without a hosted service",
    fg: "✓",
    percy: "✕",
    chromatic: "✕",
    backstop: "✓",
    lostpixel: "◐",
  },
  {
    cap: "Free tier",
    fg: "Forever",
    percy: "5k/mo",
    chromatic: "5k/mo",
    backstop: "Free",
    lostpixel: "Sunset",
  },
];

export interface PluginItem {
  name: string;
  tag: string;
  desc: string;
}

export const PLUGINS: PluginItem[] = [
  {
    name: "Figma",
    tag: "DESIGN JUDGE",
    desc: "Design-to-code comparison & token extraction.",
  },
  {
    name: "Perf Budgets",
    tag: "WEB VITALS",
    desc: "LCP / CLS / TTFB thresholds tied to the diff.",
  },
  {
    name: "Accessibility",
    tag: "WCAG AUDIT",
    desc: "axe-core WCAG audits in the same render pass.",
  },
  {
    name: "3rd-Party Scripts",
    tag: "DRIFT GUARD",
    desc: "Flags ad / analytics / widget drift between runs.",
  },
  {
    name: "Monitor",
    tag: "HISTORY",
    desc: "Production visual monitoring & alerting.",
  },
];

export const LIFECYCLE_HOOKS_TEXT =
  "setup · beforeDiscover · afterDiscover · beforeRender · afterRender · afterCompare · afterRun · onError · teardown";

export interface HonestCard {
  label: string;
  color: string;
  body: string;
}

export const HONEST_CARDS: HonestCard[] = [
  {
    label: "YOU BRING THE KEY",
    color: "#e8862e",
    body: "AI is optional and uses your selected OpenAI, Anthropic, or Google Gemini account (or a custom OpenAI-compatible baseUrl). Changed screenshots go directly to that provider, not through a Frontguard proxy; leave AI disabled for a fully local run.",
  },
  {
    label: "YOU STAY IN THE LOOP",
    color: "#4fb477",
    body: "Let AI explain what changed, classify shift severity, and suggest candidate CSS fixes while keeping pass/fail decisions deterministic. With fix verification enabled, a verified fix is automatically recorded as an accepted local fix-pattern signal. Neither behavior updates baselines; review model output and patches.",
  },
  {
    label: "NUMBERS, NOT CLAIMS",
    color: "#5b8def",
    body: "It's young. We publish the validation harness, including repository boot failures and the fact that the current run did not measure AI accuracy. Trust starts with visible limits.",
  },
];

export const CLI_HTML = `<span style="color: #7c746b;">$</span> npx -p @frontguard/cli frontguard run

<span style="color: #4fb477;">  ✓ 11 passed</span>   <span style="color: #e5484d;">✘ 1 regression</span>
<span style="color: #7c746b;">  Cluster #1: (48, 224) 148×164px · Chroma SSIM 61.4%</span>`;

export const PW_HTML = `<span style="color: #c678dd;">import</span> { test, expect } <span style="color: #c678dd;">from</span> <span style="color: #98c379;">'@playwright/test'</span>;
<span style="color: #c678dd;">import</span> { visualTest } <span style="color: #c678dd;">from</span> <span style="color: #98c379;">'@frontguard/playwright'</span>;

test(<span style="color: #98c379;">'home page'</span>, <span style="color: #c678dd;">async</span> ({ page }) => {
  <span style="color: #c678dd;">await</span> page.goto(<span style="color: #98c379;">'/'</span>);
  <span style="color: #c678dd;">const</span> result = <span style="color: #c678dd;">await</span> visualTest(page, <span style="color: #98c379;">'home-page'</span>, {
    waitForStable: <span style="color: #56b6c2;">true</span>,
    redactSensitive: <span style="color: #56b6c2;">true</span>,
  });
  expect(result.passed).toBe(<span style="color: #56b6c2;">true</span>);
});`;

export const MCP_HTML = `<span style="color: #7c746b;">$</span> npx -p @frontguard/cli frontguard guide mcp --json
<span style="color: #564f48;"># Or register @frontguard/mcp in Claude Code / Cursor:</span>
<span style="color: #4fb477;">→</span> list_regressions · inspect_diff_cluster_dom
<span style="color: #e8862e;">→</span> get_suggested_fix · verify_css_patch · promote_baseline`;

export const CONFIG_CODE = `export default {
  baseUrl: 'http://localhost:3000',

  // auto-discover routes or configure pre-capture actions
  discover: {
    startUrl: '/',
    maxDepth: 3,
    exclude: ['/admin/*', '/api/*'],
  },
  routes: [
    {
      path: '/pricing',
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
  blockUrls: ['*google-analytics.com*'],
  threshold: 0.01,

  // AI analysis (optional, BYOK: 'openai' | 'anthropic' | 'gemini' | custom baseUrl)
  ai: { provider: 'openai', model: 'gpt-4o' },
};`;

export const CONFIG_HTML = `<span style="color: #c678dd;">export default</span> {
  baseUrl: <span style="color: #98c379;">'http://localhost:3000'</span>,

  <span style="color: #564f48;">// auto-discover routes or configure pre-capture actions</span>
  discover: {
    startUrl: <span style="color: #98c379;">'/'</span>,
    maxDepth: <span style="color: #e8862e;">3</span>,
    exclude: [<span style="color: #98c379;">'/admin/*'</span>, <span style="color: #98c379;">'/api/*'</span>],
  },
  routes: [
    {
      path: <span style="color: #98c379;">'/pricing'</span>,
      actions: [
        { type: <span style="color: #98c379;">'waitForSelector'</span>, selector: <span style="color: #98c379;">'[data-ready]'</span> },
        { type: <span style="color: #98c379;">'click'</span>, selector: <span style="color: #98c379;">'[data-billing="annual"]'</span> },
      ],
    },
  ],

  viewports: [<span style="color: #e8862e;">375</span>, <span style="color: #e8862e;">768</span>, <span style="color: #e8862e;">1440</span>],
  browsers: [<span style="color: #98c379;">'chromium'</span>],
  colorScheme: <span style="color: #98c379;">'dark'</span>,
  waitForStability: <span style="color: #56b6c2;">true</span>,
  redactSensitive: <span style="color: #56b6c2;">true</span>,
  freezeTime: <span style="color: #98c379;">'2026-01-01T00:00:00Z'</span>,
  seedRandom: <span style="color: #e8862e;">42</span>,
  blockUrls: [<span style="color: #98c379;">'*google-analytics.com*'</span>],
  threshold: <span style="color: #e8862e;">0.01</span>,

  <span style="color: #564f48;">// AI analysis (optional, BYOK: 'openai' | 'anthropic' | 'gemini' | custom baseUrl)</span>
  ai: { provider: <span style="color: #98c379;">'openai'</span>, model: <span style="color: #98c379;">'gpt-4o'</span> },
};`;
