import { useState } from "react";

export const MONO = "'JetBrains Mono', monospace";
export const SANS = "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif";

export type ViewportId = "1440" | "768" | "375";
export type DiffModeId = "side-by-side" | "swipe" | "onion" | "cluster-ssim";

export interface ViewportScenario {
  id: ViewportId;
  label: string;
  device: string;
  route: string;
  diffPct: string;
  chromaSsim: string;
  cwSsim: string;
  settledFrames: number;
  redactedCount: number;
  clusterBox: { x: number; y: number; w: number; h: number; label: string };
  noiseBox: { x: number; y: number; w: number; h: number; label: string };
  patchRule: string;
}

export const VIEWPORT_SCENARIOS: Record<ViewportId, ViewportScenario> = {
  "1440": {
    id: "1440",
    label: "1440px",
    device: "Desktop · 1440×900",
    route: "/dashboard",
    diffPct: "1.84%",
    chromaSsim: "0.614",
    cwSsim: "0.589",
    settledFrames: 3,
    redactedCount: 2,
    clusterBox: {
      x: 8,
      y: 52,
      w: 22,
      h: 26,
      label: "CLUSTER #1 · 148×164px · aside .sidebar-cta",
    },
    noiseBox: {
      x: 36,
      y: 12,
      w: 44,
      h: 12,
      label: "IGNORED · 1px font hinting (CW-SSIM 0.994)",
    },
    patchRule: "aside .sidebar-cta { min-height: 36px; display: flex; }",
  },
  "768": {
    id: "768",
    label: "768px",
    device: "Tablet · 768×1024",
    route: "/pricing",
    diffPct: "2.41%",
    chromaSsim: "0.542",
    cwSsim: "0.518",
    settledFrames: 4,
    redactedCount: 1,
    clusterBox: {
      x: 52,
      y: 44,
      w: 40,
      h: 32,
      label: "CLUSTER #1 · 210×96px · .tier-card-pro",
    },
    noiseBox: {
      x: 10,
      y: 14,
      w: 50,
      h: 10,
      label: "IGNORED · sub-pixel kerning (CW-SSIM 0.991)",
    },
    patchRule: ".tier-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }",
  },
  "375": {
    id: "375",
    label: "375px",
    device: "Mobile · 375×812",
    route: "/checkout",
    diffPct: "3.12%",
    chromaSsim: "0.488",
    cwSsim: "0.462",
    settledFrames: 3,
    redactedCount: 3,
    clusterBox: {
      x: 12,
      y: 64,
      w: 76,
      h: 22,
      label: "CLUSTER #1 · 284×54px · [data-testid='pay-btn']",
    },
    noiseBox: {
      x: 12,
      y: 16,
      w: 64,
      h: 10,
      label: "IGNORED · 1px AA drift (CW-SSIM 0.996)",
    },
    patchRule:
      ".checkout-footer { padding-bottom: env(safe-area-inset-bottom, 16px); }",
  },
};

export const DIFF_MODES: ReadonlyArray<{
  id: DiffModeId;
  keyHint: string;
  label: string;
  badge: string;
  desc: string;
}> = [
  {
    id: "side-by-side",
    keyHint: "1",
    label: "Side-by-Side",
    badge: "DUAL FRAME",
    desc: "Synchronized baseline (git orphan branch) and current candidate renders.",
  },
  {
    id: "cluster-ssim",
    keyHint: "2",
    label: "Cluster SSIM Map",
    badge: "SPATIAL REGION",
    desc: "8-connected bounding boxes scored by local Chroma SSIM (YCbCr) and CW-SSIM.",
  },
  {
    id: "swipe",
    keyHint: "3",
    label: "Swipe Curtain",
    badge: "OPTICAL SPLIT",
    desc: "Drag the optical loupe across any coordinate to verify structural alignment.",
  },
  {
    id: "onion",
    keyHint: "4",
    label: "Onion Skin & Patch",
    badge: "50% BLEND",
    desc: "Alpha-composited overlay exposing 1px padding shifts and flex-wrap breaks.",
  },
];

export const PIPELINE_PHASES = [
  {
    phase: "PHASE 01",
    name: "Capture",
    outcome: "Find what changed",
    stages: [
      { n: "01", name: "Discover", tag: "routes + stories" },
      { n: "02", name: "Filter", tag: "changed routes" },
      { n: "03", name: "Render", tag: "hermetic Playwright" },
    ],
    desc: "Crawls live routes or Storybook stories, narrows to git-affected paths when configured, and renders deterministic multi-viewport snapshots with frozen clocks, seeded PRNG, and frame convergence.",
    specs: [
      "waitForStability + freezeTime + seedRandom",
      "redactSensitive masks PII before disk write",
    ],
  },
  {
    phase: "PHASE 02",
    name: "Compare",
    outcome: "Explain why it broke",
    stages: [
      { n: "04", name: "Diff", tag: "pixel + cluster SSIM" },
      { n: "05", name: "Analyze", tag: "opt-in BYOK AI" },
    ],
    desc: "Extracts 8-connected spatial diff clusters, computes local Chroma SSIM (YCbCr) and wavelet CW-SSIM to ignore sub-pixel font drift, and attributes each cluster to its highest-overlap DOM targetSelector.",
    specs: [
      "Connected-component cluster bounding boxes",
      "Optional BYOK severity & root-cause triage",
    ],
  },
  {
    phase: "PHASE 03",
    name: "Report",
    outcome: "Verified, not guessed",
    stages: [{ n: "06", name: "Report", tag: "HTML + JSON + CI" }],
    desc: "Emits deterministic exit codes (0 pass, 1 regression, 2 error), a self-contained 4-mode HTML diff workbench, and optional sandbox-verified CSS patch suggestions without ever auto-overwriting baselines.",
    specs: [
      "frontguard-baselines git orphan branch",
      "Candidate CSS re-rendered in Playwright sandbox",
    ],
  },
] as const;

export const CLI_CODE = `# Terminal 1: keep your app server running
npm run dev

# Terminal 2: initialize config & run visual check
npx -p @frontguard/cli frontguard init --ci
npx -p @frontguard/cli frontguard run`;

export const CLI_HTML = `<span style="color:#a89f94"># Terminal 1: keep your app server running</span>
<span style="color:#f5f1ea">npm run dev</span>

<span style="color:#a89f94"># Terminal 2: initialize config &amp; run visual check</span>
<span style="color:#f5f1ea">npx -p @frontguard/cli frontguard init --ci</span>
<span style="color:#f5f1ea">npx -p @frontguard/cli frontguard run</span>`;

export const PW_CODE = `import { test, expect } from '@playwright/test'
import { visualTest } from '@frontguard/playwright'

test('dashboard layout remains stable', async ({ page }) => {
  await page.goto('/dashboard')
  const res = await visualTest(page, 'dashboard', {
    selector: '[data-testid="Usage-panel"]',
    waitForStable: true,
    redactSensitive: true,
  })
  expect(res.passed).toBe(true)
})`;

export const PW_HTML = `<span style="color:#e8862e">import</span> { test, expect } <span style="color:#e8862e">from</span> <span style="color:#4fb477">'@playwright/test'</span>
<span style="color:#e8862e">import</span> { visualTest } <span style="color:#e8862e">from</span> <span style="color:#4fb477">'@frontguard/playwright'</span>

test(<span style="color:#4fb477">'dashboard layout remains stable'</span>, <span style="color:#e8862e">async</span> ({ page }) =&gt; {
  <span style="color:#e8862e">await</span> page.goto(<span style="color:#4fb477">'/dashboard'</span>)
  <span style="color:#e8862e">const</span> res = <span style="color:#e8862e">await</span> visualTest(page, <span style="color:#4fb477">'dashboard'</span>, {
    selector: <span style="color:#4fb477">'[data-testid="Usage-panel"]'</span>,
    waitForStable: <span style="color:#e8862e">true</span>,
    redactSensitive: <span style="color:#e8862e">true</span>,
  })
  expect(res.passed).toBe(<span style="color:#e8862e">true</span>)
})`;

export const MCP_CODE = `# Machine-readable workflow guide for coding agents
npx -p @frontguard/cli frontguard guide --json

# Zero-cloud local report mode via @frontguard/mcp
FRONTGUARD_LOCAL_REPORT=./frontguard-report/report.json \\
  npx @frontguard/mcp

# 7 MCP tools: list_regressions · inspect_diff_cluster_dom
# get_suggested_fix · verify_css_patch · promote_baseline
# accept_baseline · recent_runs`;

export const MCP_HTML = `<span style="color:#a89f94"># Machine-readable workflow guide for coding agents</span>
<span style="color:#f5f1ea">npx -p @frontguard/cli frontguard guide --json</span>

<span style="color:#a89f94"># Zero-cloud local report mode via @frontguard/mcp</span>
<span style="color:#f5f1ea">FRONTGUARD_LOCAL_REPORT=./frontguard-report/report.json \\</span>
  <span style="color:#f5f1ea">npx @frontguard/mcp</span>

<span style="color:#a89f94"># 7 MCP tools: list_regressions · inspect_diff_cluster_dom</span>
<span style="color:#a89f94"># get_suggested_fix · verify_css_patch · promote_baseline</span>
<span style="color:#a89f94"># accept_baseline · recent_runs</span>`;

export const CONFIG_CODE = `import { defineConfig } from '@frontguard/cli'

export default defineConfig({
  baseUrl: 'http://localhost:3000',
  routes: [
    '/',
    '/pricing',
    {
      path: '/dashboard',
      actions: [
        { type: 'waitForSelector', selector: '[data-ready]' },
        { type: 'click', selector: '[data-tab="overview"]' },
      ],
    },
  ],
  viewports: [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile',  width: 375,  height: 812 },
  ],
  colorScheme: 'dark',
  waitForStability: true,
  redactSensitive: true,
  freezeTime: '2026-01-01T00:00:00.000Z',
  seedRandom: 42,
  blockUrls: ['*://*.google-analytics.com/*'],
  threshold: 0.01,
  // Optional BYOK: 'openai' | 'anthropic' | 'gemini' ( + custom baseUrl )
  ai: { provider: 'gemini', model: 'gemini-2.5-flash' },
})`;

export const CONFIG_HTML = `<span style="color:#e8862e">import</span> { defineConfig } <span style="color:#e8862e">from</span> <span style="color:#4fb477">'@frontguard/cli'</span>

<span style="color:#e8862e">export default</span> defineConfig({
  baseUrl: <span style="color:#4fb477">'http://localhost:3000'</span>,
  routes: [
    <span style="color:#4fb477">'/'</span>,
    <span style="color:#4fb477">'/pricing'</span>,
    {
      path: <span style="color:#4fb477">'/dashboard'</span>,
      actions: [
        { type: <span style="color:#4fb477">'waitForSelector'</span>, selector: <span style="color:#4fb477">'[data-ready]'</span> },
        { type: <span style="color:#4fb477">'click'</span>, selector: <span style="color:#4fb477">'[data-tab="overview"]'</span> },
      ],
    },
  ],
  viewports: [
    { name: <span style="color:#4fb477">'desktop'</span>, width: <span style="color:#f5f1ea">1440</span>, height: <span style="color:#f5f1ea">900</span> },
    { name: <span style="color:#4fb477">'mobile'</span>,  width: <span style="color:#f5f1ea">375</span>,  height: <span style="color:#f5f1ea">812</span> },
  ],
  colorScheme: <span style="color:#4fb477">'dark'</span>,
  waitForStability: <span style="color:#e8862e">true</span>,
  redactSensitive: <span style="color:#e8862e">true</span>,
  freezeTime: <span style="color:#4fb477">'2026-01-01T00:00:00.000Z'</span>,
  seedRandom: <span style="color:#f5f1ea">42</span>,
  blockUrls: [<span style="color:#4fb477">'*://*.google-analytics.com/*'</span>],
  threshold: <span style="color:#f5f1ea">0.01</span>,
  <span style="color:#a89f94">// Optional BYOK: 'openai' | 'anthropic' | 'gemini' ( + custom baseUrl )</span>
  ai: { provider: <span style="color:#4fb477">'gemini'</span>, model: <span style="color:#4fb477">'gemini-2.5-flash'</span> },
})`;

export const TOP_THREE_FEATURES = [
  {
    tag: "GIT-NATIVE STORAGE",
    title: "Git-native baselines",
    desc: "Stores baseline PNGs in a dedicated frontguard-baselines orphan branch with SHA-256 content-addressable deduplication so your main branch stays free of binary bloat.",
    snippet: `$ git fetch origin frontguard-baselines
manifest.json · sha256: 8f3a9c... (0 MB added to main)`,
  },
  {
    tag: "DETERMINISTIC CAPTURE",
    title: "Frame convergence & anti-flake",
    desc: "Polls consecutive screenshots until layout variance settles below 0.05%, freezes Date/clock timestamps, seeds Math.random(), and aborts third-party ad or analytics trackers.",
    snippet: `waitForStability: true · settled in 3 frames (< 0.05%)
freezeTime: '2026-01-01T00:00:00Z' · seedRandom: 42`,
  },
  {
    tag: "PERCEPTUAL ENGINE",
    title: "Smart rendering & spatial diffing",
    desc: "Scores 8-connected diff clusters with local Chroma SSIM (YCbCr) and wavelet CW-SSIM—catching color and layout shifts on small buttons while overriding 1px font hinting drift.",
    snippet: `cluster #1 · targetSelector: "aside .sidebar-cta"
chromaSSIM: 0.614 (flagged) · cwSSIM: 0.994 (font AA ignored)`,
  },
] as const;

export const CHECKLIST_FEATURES = [
  {
    title: "Auto route discovery",
    desc: "Crawls live links and parses Next.js, Remix, Astro, Nuxt, SvelteKit, and Storybook 8 index trees.",
  },
  {
    title: "Pre-capture actions",
    desc: "Run click, hover, fill, scroll, and waitForSelector steps per route before taking the screenshot.",
  },
  {
    title: "PII & input redaction",
    desc: "Masks password, email, and [data-sensitive] elements and scrubs [REDACTED] in DOM snapshots.",
  },
  {
    title: "Parallel render pool",
    desc: "Reuses warm Playwright Chromium contexts across routes and viewports with configurable concurrency.",
  },
  {
    title: "Production URL monitor",
    desc: "Scheduled frontguard monitor checks against live URLs with Slack/webhook alerts and flake tracking.",
  },
  {
    title: "Sandbox fix verification",
    desc: "Injects candidate CSS patches into an isolated Playwright context and re-diffs to verify fixes.",
  },
] as const;

export const COMPARISON_ROWS = [
  {
    cap: "Open-source core",
    fg: "MIT",
    percy: "✕",
    chromatic: "✕",
    backstop: "MIT",
    lostpixel: "Sunset",
  },
  {
    cap: "Runs 100% locally (no cloud account)",
    fg: "✓",
    percy: "✕",
    chromatic: "✕",
    backstop: "✓",
    lostpixel: "◐",
  },
  {
    cap: "Perceptual SSIM + spatial cluster diff",
    fg: "✓",
    percy: "◐",
    chromatic: "✕",
    backstop: "✕",
    lostpixel: "✕",
  },
  {
    cap: "Frame-stability convergence check",
    fg: "✓",
    percy: "◐",
    chromatic: "◐",
    backstop: "✕",
    lostpixel: "✕",
  },
  {
    cap: "AI classification (BYOK)",
    fg: "◐",
    percy: "◐",
    chromatic: "✕",
    backstop: "✕",
    lostpixel: "✕",
  },
  {
    cap: "CSS suggestion verification (opt-in)",
    fg: "◐",
    percy: "✕",
    chromatic: "✕",
    backstop: "✕",
    lostpixel: "✕",
  },
  {
    cap: "Built-in WCAG + perf-budget plugins",
    fg: "✓",
    percy: "✕",
    chromatic: "◐",
    backstop: "✕",
    lostpixel: "✕",
  },
  {
    cap: "Git orphan-branch baseline storage",
    fg: "✓",
    percy: "✕",
    chromatic: "✕",
    backstop: "✕",
    lostpixel: "✕",
  },
] as const;

export const PLUGINS = [
  {
    name: "wcag",
    tag: "BUILT-IN · A11Y",
    desc: "Runs axe-core WCAG 2.1 AA checks on every captured route.",
  },
  {
    name: "perf-budget",
    tag: "BUILT-IN · CWV",
    desc: "Asserts LCP, CLS, FCP, TTFB, and transfer size budgets.",
  },
  {
    name: "script-guard",
    tag: "BUILT-IN · SECURITY",
    desc: "Inventories external scripts and flags unexpected third-party domains.",
  },
  {
    name: "storybook",
    tag: "BUILT-IN · STORIES",
    desc: "Discovers stories from Storybook index.json and captures isolated states.",
  },
  {
    name: "git-baselines",
    tag: "BUILT-IN · STORAGE",
    desc: "Manages baselines on the frontguard-baselines git orphan branch.",
  },
] as const;

export const LIFECYCLE_HOOKS_TEXT =
  "setup · beforeDiscover · afterDiscover · beforeRender · afterRender · afterCompare · afterRun · onError · teardown";

export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const copy = (text: string) => {
    try {
      navigator.clipboard?.writeText(text);
    } catch {
      /* ignore clipboard errors in headless environments */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return [copied, copy];
}
