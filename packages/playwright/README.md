# @frontguard/playwright

AI-powered visual regression testing for Playwright. **3 lines to add visual testing to any test.**

[![npm](https://img.shields.io/npm/v/@frontguard/playwright)](https://www.npmjs.com/package/@frontguard/playwright)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Install

```bash
npm install @frontguard/playwright
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

1. **First run** → takes a screenshot, saves it as the baseline
2. **Subsequent runs** → takes a new screenshot, compares pixel-by-pixel against baseline
3. **If diff exceeds threshold** → test fails with diff image + optional AI explanation

Baselines are plain PNG files in `__visual_baselines__/`. Commit them to git. Review diffs in PRs.

## Features

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
test('pricing page', async ({ page }) => {
  await page.goto('https://myapp.com/pricing');
  await visualTest(page, 'pricing', { threshold: 0.02 });
});
```

### Mask dynamic content

```typescript
test('dashboard', async ({ page }) => {
  await page.goto('https://myapp.com/dashboard');
  await visualTest(page, 'dashboard', {
    mask: ['.ad-banner', '.timestamp', '.avatar'],
    maskRegions: [{ x: 0, y: 0, width: 200, height: 50 }],
  });
});
```

### Freeze time for deterministic screenshots

```typescript
test('landing page', async ({ page }) => {
  await page.goto('https://myapp.com');
  await visualTest(page, 'landing', {
    freezeTime: new Date('2024-01-01').getTime(),
  });
});
```

### AI-powered diff analysis

```typescript
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
});
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `threshold` | `number` | `0.01` | Max pixel diff as fraction (0-1). 0.01 = 1% |
| `fullPage` | `boolean` | `true` | Capture full page vs viewport only |
| `mask` | `string[]` | `[]` | CSS selectors to hide before screenshot |
| `maskRegions` | `Rect[]` | `[]` | Coordinate regions to mask with gray overlay |
| `ai` | `boolean \| object` | `false` | Enable AI analysis of visual diffs |
| `freezeTime` | `boolean \| number` | `false` | Freeze `Date.now()` to a timestamp |
| `baselineDir` | `string` | `__visual_baselines__` | Directory for baseline images |
| `update` | `boolean` | `false` | Update baselines instead of comparing |

## AI Analysis

Set your API key and enable AI:

```bash
export FRONTGUARD_OPENAI_KEY=sk-...
# or
export FRONTGUARD_ANTHROPIC_KEY=sk-ant-...
```

```typescript
await visualTest(page, 'homepage', {
  ai: { provider: 'openai' }
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
FRONTGUARD_UPDATE=1 npx playwright test

# Or per-test
await visualTest(page, 'homepage', { update: true });
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
  ai?: {                     // Present if AI analysis enabled
    classification: string;
    severity: string;
    explanation: string;
  };
}
```

## CI/CD

Works out of the box in any CI environment. Just commit your baselines:

```bash
# .gitignore
__visual_baselines__/*.current.png
__visual_baselines__/*.diff.png
```

Keep baseline PNGs in git. Ignore current/diff files (they're only for debugging).

## License

MIT — [frontguard](https://github.com/ravidsrk/frontguard)
