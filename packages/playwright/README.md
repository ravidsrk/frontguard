# @frontguard/playwright

AI-powered visual regression testing for Playwright with an explicit pass/fail assertion.

[![npm](https://img.shields.io/npm/v/@frontguard/playwright)](https://www.npmjs.com/package/@frontguard/playwright)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Install

The latest registry-verified release is `0.2.2`; the repository's next version
is still pre-release until it is published.

```bash
npm install --save-dev @frontguard/playwright@0.2.2 @playwright/test
```

## Usage

```typescript
import { test, expect } from '@playwright/test';
import { visualTest } from '@frontguard/playwright';

test('homepage', async ({ page }) => {
  await page.goto('https://myapp.com');
  const result = await visualTest(page, 'homepage');
  expect(result.passed).toBe(true);
});
```

That's it. First run creates baselines. Subsequent runs compare and flag regressions.

## How It Works

<p align="center">
  <img src="https://raw.githubusercontent.com/ravidsrk/frontguard/main/apps/web/public/images/docs/playwright-storybook-workflow.jpg" alt="Frontguard Playwright and Storybook Visual Workflow" width="840"/>
</p>

1. **First run** → takes a screenshot, saves it as the baseline
2. **Subsequent runs** → takes a new screenshot, compares pixel-by-pixel against baseline
3. **If diff exceeds threshold** → test fails with diff image + optional AI explanation

Baselines are plain PNG files in `__visual_baselines__/`. Commit them to git. Review diffs in PRs.

## Features

<p align="center">
  <img src="https://raw.githubusercontent.com/ravidsrk/frontguard/main/apps/web/public/images/docs/perceptual-diff-clusters.jpg" alt="Perceptual Diff Engine and Spatial DOM-Cluster Attribution" width="840"/>
</p>

- 📸 **Pixel-perfect diffs** — pixelmatch + SSIM perceptual comparison
- 🤖 **AI classification** — knows if a change is a regression, intentional, or content update
- 🎭 **Element masking** — hide dynamic content (ads, timestamps, avatars)
- ⏱️ **Time freeze** — deterministic screenshots with frozen `Date.now()`
- 📁 **File-based baselines** — commit to git, review in PRs
- 🔌 **Zero config** — works with any Playwright test suite
- 🪶 **Lightweight** — only 2 runtime dependencies (pixelmatch + pngjs)

## Examples

### Basic visual test

```typescript
import { test, expect } from '@playwright/test';
import { visualTest } from '@frontguard/playwright';

test('pricing page', async ({ page }) => {
  await page.goto('https://myapp.com/pricing');
  const result = await visualTest(page, 'pricing', { threshold: 0.02 });
  expect(result.passed).toBe(true);
});
```

### Mask dynamic content

```typescript
import { test, expect } from '@playwright/test';
import { visualTest } from '@frontguard/playwright';

test('dashboard', async ({ page }) => {
  await page.goto('https://myapp.com/dashboard');
  const result = await visualTest(page, 'dashboard', {
    mask: ['.ad-banner', '.timestamp', '.avatar'],
    maskRegions: [{ x: 0, y: 0, width: 200, height: 50 }],
  });
  expect(result.passed).toBe(true);
});
```

### Freeze time for deterministic screenshots

<p align="center">
  <img src="https://raw.githubusercontent.com/ravidsrk/frontguard/main/apps/web/public/images/docs/anti-flake-hermetic-render.jpg" alt="Deterministic Rendering and Anti-Flake Engine" width="840"/>
</p>

```typescript
import { test, expect } from '@playwright/test';
import { visualTest } from '@frontguard/playwright';

test('landing page', async ({ page }) => {
  await page.goto('https://myapp.com');
  const result = await visualTest(page, 'landing', {
    freezeTime: new Date('2024-01-01').getTime(),
  });
  expect(result.passed).toBe(true);
});
```

### AI-powered diff analysis

```typescript
import { test, expect } from '@playwright/test';
import { visualTest } from '@frontguard/playwright';

test('checkout flow', async ({ page }) => {
  await page.goto('https://myapp.com/checkout');
  const result = await visualTest(page, 'checkout', {
    ai: { provider: 'openai' },
  });

  if (!result.passed) {
    console.log(result.ai?.classification); // 'regression' | 'intentional' | 'content_update'
    console.log(result.ai?.severity);       // 'critical' | 'high' | 'medium' | 'low'
    console.log(result.ai?.explanation);    // Human-readable explanation
  }
  expect(result.passed).toBe(true);
});
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `threshold` | `number` | `0.01` | Max pixel diff as fraction (0-1). 0.01 = 1% |
| `selector` | `string` | `undefined` | Optional CSS selector to capture a single element/component bounding box instead of the full page |
| `fullPage` | `boolean` | `true` | Capture full page vs viewport only |
| `mask` | `string[]` | `[]` | CSS selectors to hide before screenshot |
| `maskRegions` | `Rect[]` | `[]` | Coordinate regions to mask with gray overlay |
| `redactSensitive` | `boolean \| string[]` | `false` | Automatically redact password, payment, and `[data-frontguard-redact]` inputs (plus optional custom selectors) before capture |
| `waitForStable` | `boolean \| { maxAttempts?: number; intervalMs?: number }` | `false` | Wait for two consecutive animation frames to converge before capturing |
| `freezeTime` | `boolean \| number \| string` | `false` | Freeze `Date.now()` / `new Date()` to a boolean default, epoch ms number, or ISO date string (e.g. `'2026-01-01T00:00:00Z'`) |
| `seedRandom` | `boolean \| number` | `false` | Seed `Math.random()` with a deterministic PRNG (`true` uses default seed, or pass a numeric seed) |
| `blockUrls` | `string[]` | `[]` | URL glob or substring patterns to abort before rendering (e.g. analytics, ads, live chat widgets) |
| `captureAriaSnapshot` | `boolean` | `false` | Capture a Playwright ARIA accessibility tree snapshot alongside the screenshot |
| `ai` | `boolean \| { provider: 'openai' \| 'anthropic' \| 'gemini'; model?: string; baseUrl?: string }` | `false` | Enable AI analysis of visual diffs (`openai`, `anthropic`, `gemini`, or custom OpenAI-compatible `baseUrl`) |
| `baselineDir` | `string` | `__visual_baselines__` | Directory for baseline images |
| `update` | `boolean` | `false` | Update baselines instead of comparing |

## AI Analysis

Set your API key and enable AI (`openai`, `anthropic`, `gemini`, or a custom OpenAI-compatible `baseUrl` for OpenRouter / Ollama / vLLM):

```bash
export FRONTGUARD_OPENAI_KEY=sk-...
# or
export FRONTGUARD_ANTHROPIC_KEY=sk-ant-...
# or
export FRONTGUARD_GEMINI_KEY=AIza...
```

```typescript
import { test, expect } from '@playwright/test';
import { visualTest } from '@frontguard/playwright';

test('homepage with AI analysis', async ({ page }) => {
  await page.goto('https://myapp.com');
  const result = await visualTest(page, 'homepage', {
    ai: { provider: 'openai' },
  });
  expect(result.passed).toBe(true);
});
// result.ai = {
//   classification: 'regression',
//   severity: 'high',
//   explanation: 'The navigation bar has shifted 20px down, pushing all content below the fold.'
// }
```

AI is **always optional** — if no API key is set, it silently skips analysis. Your tests still work.

## Update Baselines

When you intentionally change your UI:

```bash
# Update all baselines
FRONTGUARD_UPDATE=1 npm exec -- playwright test
```

Or update a single baseline in a test:

```typescript
import { test, expect } from '@playwright/test';
import { visualTest } from '@frontguard/playwright';

test('accept an intentional homepage change', async ({ page }) => {
  await page.goto('https://myapp.com');
  const result = await visualTest(page, 'homepage', { update: true });
  expect(result.passed).toBe(true);
});
```

## Result Object

```typescript
interface VisualTestResult {
  passed: boolean;           // Whether diff is within threshold
  diffPercentage: number;    // 0-1 fraction of pixels that differ
  baselinePath: string;      // Path to baseline PNG
  currentPath: string;       // Path to current screenshot
  diffPath?: string;         // Path to diff image (if any diff)
  ssim?: number;             // Structural similarity (0-1, 1=identical)
  isNewBaseline: boolean;    // True on first run
  settled?: boolean;         // True when waitForStable frame convergence succeeded
  clusters?: Array<{         // Connected-component spatial diff clusters
    id: number;
    bbox: { x: number; y: number; width: number; height: number };
    pixelCount: number;
    targetSelector?: string; // Most-specific DOM selector at cluster center
  }>;
  ariaSnapshot?: string;     // Captured ARIA tree when captureAriaSnapshot is enabled
  ai?: {                     // Present if AI analysis enabled
    classification: string;
    severity: string;
    explanation: string;
  };
}
```

## CI/CD

Works out of the box in any CI environment. Just commit your baselines:

```gitignore
# .gitignore
__visual_baselines__/*.current.png
__visual_baselines__/*.diff.png
```

Keep baseline PNGs in git. Ignore current/diff files (they're only for debugging).

## License

MIT — [frontguard](https://github.com/ravidsrk/frontguard)
