/**
 * Built-in offline guide for developers and coding agents (`frontguard guide [topic]`).
 *
 * Exposes task-routed reference guides covering configuration, perceptual
 * diffing, MCP Visual Cortex tools, Playwright integration, and CI workflows
 * without requiring network access.
 *
 * @module cli/guide
 */

export interface GuideTopic {
  readonly id: 'setup' | 'diffing' | 'mcp' | 'playwright' | 'ci';
  readonly title: string;
  readonly summary: string;
  readonly content: string;
}

export const GUIDE_TOPICS: readonly GuideTopic[] = [
  {
    id: 'setup',
    title: 'Setup, Discovery & Route Actions',
    summary:
      'Configure frontguard.config.ts, auto-discover routes or Storybook stories, run pre-capture actions, emulate dark mode, and redact sensitive inputs.',
    content: `# Setup, Discovery & Route Actions

## 1. Initialize Configuration
Run \`npx @frontguard/cli init\` or create \`frontguard.config.ts\`:

\`\`\`ts
import { defineConfig } from '@frontguard/cli';

export default defineConfig({
  baseUrl: 'http://localhost:3000',
  routes: [
    '/',
    '/pricing',
    {
      path: '/checkout',
      threshold: 0.01,
      colorScheme: 'dark',
      waitForSelector: '[data-testid="checkout-ready"]',
      actions: [
        { type: 'click', selector: '[data-testid="coupon-toggle"]' },
        { type: 'fill', selector: 'input[name="coupon"]', value: 'SAVE20' },
        { type: 'waitForSelector', selector: '.discount-applied' },
      ],
    },
  ],
  viewports: [375, 768, 1440],
  browsers: ['chromium'],
  smartRender: true,
  redactSensitive: true,
  waitForStability: true,
});
\`\`\`

\`colorScheme\` and \`--color-scheme\` change emulation only. Until named capture modes exist, that run compares against the same baseline file as the default scheme (\`baselines/<route>/<viewport>/<browser>.png\`). Two route entries that share a path, viewport, and browser are a config error.

## 2. Automatic Route & Storybook Discovery
- **Filesystem discovery**: Automatically detects Next.js App Router (including route groups and parallel slot filtering), Next.js Pages, Remix (\`_index\` and pathless layouts), SvelteKit, Astro, and Nuxt routes when \`routes\` is omitted.
- **Crawler discovery**: Set \`discover: { startUrl: 'http://localhost:3000', maxDepth: 3, maxRoutes: 50, exclude: ['/admin/*'] }\`.
- **Storybook**: Set \`storybook: { url: 'http://localhost:6006', stories: ['Components/*'] }\`. Storybook 7 is read from \`/stories.json\`. Storybook 8, 9, 10, and 11 alpha share \`/index.json\`, so they use the same parser. The renderer awaits each story's \`play()\` function before capture.
- **Ladle** (off unless set): \`ladle: { dir: 'build' }\` or \`ladle: { url: 'http://localhost:61000' }\` reads \`meta.json\`. Stories open at \`/?story=<id>&mode=preview\` and wait for \`[data-storyloaded]\`.
- **Histoire** (off unless set): \`histoire: { dir: '.histoire/dist' }\` reads \`histoire.json\`. Each variant opens at \`/__sandbox.html?storyId=&variantId=\`.
- **Runner switch**: \`FRONTGUARD_CAPTURE_RUNNER\` or \`captureRunner\` logs a warning when it names a different runner than the one above. Baselines from the previous runner are not comparable. An Argos maintainer reported a Storybook runner switch made 16 of 22 shots 1px wider or taller (https://x.com/gregberge_/status/2110303101538451874). That figure is a vendor measurement, not a Frontguard statistic. Pixelmatch stays the pass/fail gate.

## 3. Sensitive-DOM Redaction, Frame Convergence & Deterministic Anti-Flake Controls
- \`redactSensitive: true\` (or an array of custom CSS selectors) masks \`input[type="password"]\`, credit-card \`autocomplete="cc-*"\` fields, one-time codes, and \`[data-frontguard-redact]\` elements in both screenshots and serialized \`domSnapshot\` HTML while preserving exact box geometry.
- \`waitForStability: true\` polls consecutive frames until two frames in a row converge within subpixel tolerance, and reports spatial bounding boxes (\`motionClusters\`) for any region that fails to settle.
- \`freezeTime: true | number | string\` (\`--freeze-time [timestamp]\`), \`seedRandom: true | number\` (\`--seed-random [seed]\`), and \`blockUrls: string[]\` (\`--block-urls <patterns...>\`) freeze the browser clock, seed \`Math.random()\` with a deterministic Mulberry32 PRNG, and block noisy third-party ad/analytics domains before capture.`,
  },
  {
    id: 'diffing',
    title: 'Perceptual Diffing v2 & Git CAS Baselines',
    summary:
      'Understand pixelmatch + YCbCr Chroma SSIM + Complex Wavelet SSIM, 8-connected diff clustering, and Git orphan branch SHA-256 content-addressable baselines.',
    content: `# Perceptual Diffing v2 & Git CAS Baselines

## 1. Three-Stage Perceptual Diff Engine
1. **Pixel-level YIQ pass (\`pixelmatch\`)**: Fast byte-equality short-circuit followed by YIQ color-space diffing with anti-aliasing detection.
2. **8-Connected Component Diff Clustering (\`extractDiffClusters\`) & Spatial DOM Attribution (\`attributeClustersToDom\`)**: Separable box dilation + Union-Find connected-component labeling groups changed pixels into discrete \`DiffCluster[]\` bounding boxes (\`{ id, bbox, rawDiffPixels, density, perimeterRatio, targetSelector, affectedElements }\`), attributing each cluster to the deepest intersecting DOM element selector.
3. **Region-Scoped Perceptual Similarity (\`computeRegionSimilarity\`)**:
   - \`chromaSSIM\`: ITU-R BT.709 YCbCr weighted SSIM (\`0.8*Y + 0.1*Cb + 0.1*Cr\`) evaluated strictly inside each cluster's bounding box, preventing background whitespace dilution and catching isoluminant color regressions.
   - \`cwSSIM\`: Complex Wavelet / Quadrature Gabor Phase SSIM across 4 orientations, invariant to 1–3px subpixel font-hinting shifts across OS renderers while dropping sharply on genuine layout breaks.

## 2. Managing Baselines (\`frontguard-baselines\`)
- Capture or update baselines:
  \`\`\`bash
  npx @frontguard/cli update-baselines
  \`\`\`
- Baselines are committed in a single batched worktree transaction to the \`frontguard-baselines\` Git orphan branch alongside \`manifest.json\` (which records SHA-256 digests and \`snapshots\` per viewport/browser). Byte-identical PNG blobs are skipped during writes to deduplicate Git object storage, and your working tree stays 100% free of binary PNG clutter.`,
  },
  {
    id: 'mcp',
    title: 'MCP Visual Cortex for Coding Agents',
    summary:
      'Connect @frontguard/mcp to Claude Code, Cursor, Codex, or Antigravity and use the 7 Visual Cortex tools to inspect, fix, verify, and promote baselines.',
    content: `# MCP Visual Cortex (\`@frontguard/mcp\`)

## 1. Register the MCP Server
Add \`@frontguard/mcp\` to \`.mcp.json\` or \`.cursor/mcp.json\`:

\`\`\`json
{
  "mcpServers": {
    "frontguard": {
      "command": "npx",
      "args": ["-y", "@frontguard/mcp"]
    }
  }
}
\`\`\`

Works against local CLI reports (\`./frontguard-report/report.json\` or \`FRONTGUARD_LOCAL_REPORT\`) with zero cloud account required, or against Frontguard Cloud when \`FRONTGUARD_API_KEY\` is set.

## 2. Available Tools (7 Tools)
1. \`list_regressions\`: List visual regressions for a run ID, PR number, or latest local report.
2. \`inspect_diff_cluster_dom\`: Inspect spatial \`DiffCluster\` bounding boxes, target CSS selectors, AI classification, and localized similarity metrics for a \`diff_id\`.
3. \`get_suggested_fix\`: Retrieve the candidate CSS/HTML patch, confidence score, and verification status for a \`diff_id\`.
4. \`verify_css_patch\`: Validate a candidate CSS patch against the target selector (checking balanced braces, selector alignment, and guarding against layout-destroying rules like \`display: none !important\` or external \`@import\`).
5. \`promote_baseline\`: Promote reviewed baselines for a run (or specific subset of routes) with explicit \`confirm_reviewed: true\` safety gating.
6. \`accept_baseline\`: Approve all baselines for a run ID.
7. \`recent_runs\`: List recent visual test runs and their pass/regression counts.`,
  },
  {
    id: 'playwright',
    title: 'Playwright Integration (@frontguard/playwright)',
    summary:
      'Add perceptual SSIM visual assertions, component selector scoping, sensitive input redaction, and frame stability settling to Playwright tests.',
    content: `# Playwright Integration (\`@frontguard/playwright\`)

## 1. Full-Page & Component-Scoped Visual Tests
\`\`\`ts
import { test, expect } from '@playwright/test';
import { visualTest } from '@frontguard/playwright';

test('checkout page and summary card match baseline', async ({ page }) => {
  await page.goto('http://localhost:3000/checkout');

  // Full-page assertion with sensitive input redaction & frame stability convergence
  const pageResult = await visualTest(page, 'checkout-full', {
    threshold: 0.01,
    redactSensitive: true,
    waitForStable: true,
  });
  expect(pageResult.passed).toBe(true);

  // Component-scoped assertion targeting a single selector bounding box
  const cardResult = await visualTest(page, 'order-summary', {
    selector: '[data-testid="order-summary"]',
    threshold: 0.005,
  });
  expect(cardResult.passed).toBe(true);
});
\`\`\`

## 2. Updating Playwright Baselines
Run with \`FRONTGUARD_UPDATE=1 npx playwright test\` or pass \`{ update: true }\` to overwrite baselines.`,
  },
  {
    id: 'ci',
    title: 'Hermetic Docker Rendering & CI Workflows',
    summary:
      'Run deterministic Linux rendering via --docker, fetch/update the frontguard-baselines orphan branch in CI, and upload HTML diff reports.',
    content: `# Hermetic Docker Rendering & CI Workflows

## 1. Cross-OS Determinism with \`--docker\`
macOS CoreText and Linux FreeType render subpixel font glyphs differently. Run with \`--docker\` on macOS/Windows laptops to execute inside the pinned Playwright Ubuntu container so local baselines match Linux CI byte-for-byte:

\`\`\`bash
npx @frontguard/cli run --docker --url http://localhost:3000
\`\`\`
(\`localhost\` / \`127.0.0.1\` URLs are automatically rewritten to \`host.docker.internal\` inside the container.)

## 2. GitHub Actions Workflow Pattern
1. Fetch the \`frontguard-baselines\` branch before running:
   \`git fetch origin refs/heads/frontguard-baselines:refs/heads/frontguard-baselines || true\`
2. Run \`npx @frontguard/cli run --url http://127.0.0.1:3000\`
3. Upload \`./frontguard-report/\` as a workflow artifact on failure for side-by-side HTML inspection.`,
  },
] as const;

export function getGuideTopic(topicId: string): GuideTopic | undefined {
  const normalized = topicId.trim().toLowerCase();
  return GUIDE_TOPICS.find((t) => t.id === normalized);
}

export function formatGuideIndex(): string {
  const lines: string[] = [
    '',
    '  Frontguard Developer & Agent Guide',
    '  ==================================',
    '',
    '  Available topics (run `frontguard guide <topic>` or `frontguard guide --json`):',
    '',
  ];

  for (const topic of GUIDE_TOPICS) {
    lines.push(`    ${topic.id.padEnd(12)} ${topic.title}`);
    lines.push(`    ${''.padEnd(12)} ${topic.summary}`);
    lines.push('');
  }

  return lines.join('\n');
}
