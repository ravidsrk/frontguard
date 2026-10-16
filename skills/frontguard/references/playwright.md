# Playwright Integration (`@frontguard/playwright`)

`@frontguard/playwright` embeds Frontguard's perceptual diff engine, frame stability convergence, and sensitive-DOM redaction directly inside `@playwright/test` specs.

## Full-Page & Component-Scoped Visual Checks

```ts
import { test } from '@playwright/test';
import { visualTest } from '@frontguard/playwright';

test('pricing tier card matches baseline', async ({ page }) => {
  await page.goto('http://localhost:3000/pricing');

  const result = await visualTest(page, 'pricing-pro-card', {
    selector: '[data-testid="tier-pro"]', // Crop to a specific component
    threshold: 0.01,                      // 1% pixel ratio threshold
    mask: ['.live-currency-ticker'],      // Mask volatile dynamic selectors
    redactSensitive: true,                // Mask password/CC/[data-frontguard-redact]
    waitForStable: true,                  // Poll until 2 consecutive frames converge
  });

  if (!result.passed) {
    throw new Error(`Visual regression: ${result.diffPercentage}`);
  }
});
```

## Options Reference (`VisualTestOptions`)

- **`threshold`** (`number`, default `0.1`): Changed-pixel ratio in `[0, 1]` (`0.01` = 1%).
- **`selector`** (`string`): Optional CSS selector to capture a single component (`page.locator(selector).first().screenshot()`) instead of the full page.
- **`fullPage`** (`boolean`, default `true`): Capture full scrollable page when `selector` is not set.
- **`mask`** (`string[]`): CSS selectors to cover with neutral gray boxes during capture.
- **`redactSensitive`** (`boolean | string[]`): Mask sensitive inputs (`input[type="password"]`, `autocomplete^="cc-"`, `[data-frontguard-redact]`, `[data-sensitive]`) while preserving layout geometry.
- **`waitForStable`** (`boolean | { timeoutMs?: number; intervalMs?: number; maxUnstableRatio?: number }`): Wait for consecutive frames to settle before returning the screenshot.
- **`update`** (`boolean`): Accept current screenshot as the new baseline (also enabled when `FRONTGUARD_UPDATE=1` or `UPDATE_SNAPSHOTS=1`).
- **`baselineDir`** (`string`, default `'.frontguard/playwright'`): Directory for baseline, current, and diff PNG artifacts.
