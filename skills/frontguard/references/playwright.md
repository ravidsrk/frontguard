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
    redactSensitive: true,                // Mask password/CC/OTP/[data-frontguard-redact]/[data-sensitive]
    waitForStable: true,                  // Poll until 2 consecutive frames converge
  });

  if (!result.passed) {
    throw new Error(`Visual regression: ${result.diffPercentage}`);
  }
});
```

## Options Reference (`VisualTestOptions`)

- **`threshold`** (`number`, default `0.01`): Changed-pixel ratio in `[0, 1]` (`0.01` = 1%).
- **`selector`** (`string`): Optional CSS selector to capture a single component (`page.locator(selector).first().screenshot()`) instead of the full page.
- **`fullPage`** (`boolean`, default `true`): Capture full scrollable page when `selector` is not set.
- **`mask`** (`string[]`): CSS selectors to hide (`visibility: hidden`) during capture.
- **`maskRegions`** (`Array<{ x: number; y: number; width: number; height: number }>`): Explicit coordinate rectangles covered with neutral gray boxes during capture.
- **`redactSensitive`** (`boolean | string[]`): Mask sensitive inputs (`input[type="password"]`, `input[autocomplete="current-password"]`, `input[autocomplete="new-password"]`, `input[autocomplete="one-time-code"]`, `input[autocomplete^="cc-"]`, `[data-frontguard-redact]`, `[data-sensitive]`, plus any custom selectors) while preserving layout geometry.
- **`waitForStable`** (`boolean | { maxAttempts?: number; intervalMs?: number }`): Wait for consecutive frames to settle before returning the screenshot (defaults: `maxAttempts: 3`, `intervalMs: 80`).
- **`update`** (`boolean`): Accept current screenshot as the new baseline (also enabled when `FRONTGUARD_UPDATE=1`).
- **`baselineDir`** (`string`, default `'__visual_baselines__'`): Directory for baseline, current, and diff PNG artifacts.
