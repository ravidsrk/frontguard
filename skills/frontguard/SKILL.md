---
name: frontguard
description: Visual regression testing, perceptual diff clustering, sensitive-DOM redaction, component-scoped Playwright assertions, and agentic MCP visual verification with Frontguard. Activate when setting up visual regression tests, verifying UI changes after frontend edits, debugging visual regressions, or configuring @frontguard/cli, @frontguard/playwright, or @frontguard/mcp.
---

# Frontguard Visual Verification Skill

Frontguard is a local-first visual regression and perceptual UI verification toolkit with zero-SaaS git baseline storage (`frontguard-baselines` orphan branch), perceptual diff clustering (`YIQ` + `Chroma-SSIM` + `CW-SSIM`), sensitive-DOM redaction, and an active Visual Cortex MCP server (`@frontguard/mcp`).

## Quick Decision Tree

1. **Need offline CLI documentation at any time?**
   Run `npx frontguard guide` or `npx frontguard guide <topic> --json` (`setup`, `diffing`, `mcp`, `playwright`, `ci`).
2. **Verifying a live dev server across routes & viewports?**
   Use `@frontguard/cli`:
   ```bash
   npx @frontguard/cli init --yes
   npx @frontguard/cli run --url http://localhost:3000 --wait-for-stability --redact-sensitive
   ```
3. **Writing or running Playwright E2E / component visual assertions?**
   Use `@frontguard/playwright` (`visualTest` or `expectVisual`) with `selector`, `waitForStable`, and `redactSensitive`.
4. **Operating as an AI coding agent inspecting visual regressions?**
   Stop at evidence. Use `@frontguard/mcp` reads (`list_regressions` → `inspect_diff_cluster_dom` → `verify_css_patch`). Do not call `promote_baseline` or `accept_baseline`, and do not run `update-baselines`. Tell a human to run `frontguard update-baselines --confirm-baselines` after they review the report. `confirm_reviewed: true` is UX only; an agent setting it on itself is not a human review.

---

## Core Workflows

### 1. Pre-Flight & Baseline Capture
```bash
# Diagnose Node, Playwright browsers, config, and git repository state
npx frontguard doctor

# A human records or updates baselines on the git orphan branch (frontguard-baselines).
# The agent stops before this command. Judge mode and an advisory caption cannot confirm it.
# An agent setting confirm_reviewed: true on itself is not a human review.
npx frontguard update-baselines --confirm-baselines --url http://localhost:3000
```

### 2. Running Deterministic Visual Regression Checks
```bash
# Compare current render against baseline (exit 0 = pass, 1 = regression/new, 2 = error)
npx frontguard run --url http://localhost:3000 --wait-for-stability --redact-sensitive

# Emulate dark mode and emit machine-readable JSON.
# Same baseline files as the default scheme until named modes exist. A stored scheme that differs warns; the exit code stays a pixel result.
npx frontguard run --url http://localhost:3000 --color-scheme dark --output json
```

### 3. Pre-Capture Route Actions & Sensitive Input Redaction
Configure `frontguard.config.ts` to open menus, modals, or drawers before capture and automatically mask sensitive inputs:
```ts
import { defineConfig } from '@frontguard/cli';

export default defineConfig({
  baseUrl: 'http://localhost:3000',
  viewports: [375, 768, 1440],
  redactSensitive: true,
  waitForStability: { timeoutMs: 3000, intervalMs: 100 },
  routes: [
    '/',
    {
      path: '/settings/security',
      name: 'security-drawer-dark',
      colorScheme: 'dark',
      waitForSelector: '[data-testid="security-panel"]',
      actions: [
        { type: 'click', selector: '[data-testid="open-api-keys"]' },
        { type: 'waitForSelector', selector: '[role="dialog"]' },
      ],
    },
  ],
});
```

### 4. Playwright Component-Scoped Visual Assertions
```ts
import { test } from '@playwright/test';
import { visualTest } from '@frontguard/playwright';

test('checkout form stays visually stable', async ({ page }) => {
  await page.goto('http://localhost:3000/checkout');

  const result = await visualTest(page, 'checkout-card', {
    selector: '[data-testid="checkout-form"]',
    redactSensitive: true,
    waitForStable: true,
    threshold: 0.01,
  });

  if (!result.passed) {
    throw new Error(`Regression: ${(result.diffPercentage * 100).toFixed(2)}%`);
  }
});
```

---

## Reference Guides

- [Setup & Configuration (`references/setup.md`)](references/setup.md)
- [Perceptual Diffing, Frame Stability & Redaction (`references/diffing.md`)](references/diffing.md)
- [MCP Visual Cortex Workflow (`references/mcp.md`)](references/mcp.md)
- [Playwright Integration (`references/playwright.md`)](references/playwright.md)
- [CI/CD & GitHub Actions (`references/ci.md`)](references/ci.md)
