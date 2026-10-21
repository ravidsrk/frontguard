# Frontguard Setup & Configuration

## Quick Start

```bash
# 1. Verify Node (>=22), Playwright browsers, and git repo
npx @frontguard/cli doctor

# 2. Generate frontguard.config.ts (use --ci to also emit .github/workflows/frontguard.yml)
npx @frontguard/cli init --yes --ci

# 3. Record initial baselines on the git orphan branch (frontguard-baselines)
npx @frontguard/cli update-baselines --url http://localhost:3000

# 4. Run visual comparison
npx @frontguard/cli run --url http://localhost:3000
```

## Full Configuration Schema (`frontguard.config.ts`)

```ts
import { defineConfig } from '@frontguard/cli';

export default defineConfig({
  version: 1,
  baseUrl: 'http://localhost:3000',
  viewports: [375, 768, 1440],
  browsers: ['chromium'],
  threshold: 0.01,            // 1% changed-pixel ratio
  smartRender: true,          // Freezes CSS animations, waits for fonts & networkidle
  redactSensitive: true,      // Masks password, credit-card, and [data-frontguard-redact] fields
  waitForStability: {
    timeoutMs: 3000,
    intervalMs: 100,
    maxUnstableRatio: 0.0005, // 0.05% frame-to-frame stability convergence threshold
  },
  colorScheme: 'light',       // Emulation only. Same baseline file as the default scheme.
  routes: [
    '/',
    '/pricing',
    {
      path: '/dashboard',
      name: 'dashboard-menu-open',
      colorScheme: 'dark',
      waitForSelector: '[data-testid="dashboard-ready"]',
      actions: [
        { type: 'click', selector: '[data-testid="user-menu-button"]' },
        { type: 'waitForSelector', selector: '[role="menu"]' },
      ],
    },
  ],
  ignore: [
    '[data-testid="live-timestamp"]',
    '.intercom-launcher',
  ],
});
```

## Supported Pre-Capture Route Actions

Each route object in `routes` can declare an `actions` array executed sequentially after `page.goto()` and before stability convergence / screenshot capture:

| Action Type | Required Fields | Description |
| --- | --- | --- |
| `click` | `selector` | Clicks the matching element |
| `hover` | `selector` | Hovers over the matching element |
| `fill` | `selector`, `value` | Fills an input or textarea |
| `press` | `selector`, `key` | Presses a keyboard key (`Enter`, `Escape`, `Tab`, etc.) |
| `waitForSelector` | `selector`, `state?` | Waits for selector (`visible`, `attached`, `hidden`, `detached`) |
| `wait` | `ms` | Deterministic pause (max `30000` ms) |
