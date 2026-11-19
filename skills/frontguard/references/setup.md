# Frontguard Setup & Configuration

## Quick Start

```bash
# 1. Verify Node (>=22), Playwright browsers, and git repo
npx -p @frontguard/cli frontguard doctor

# 2. Generate frontguard.config.ts (use --ci to also emit .github/workflows/frontguard.yml)
npx -p @frontguard/cli frontguard init --yes --ci

# 3. Review your app, then record initial baselines on the git orphan branch (frontguard-baselines)
npx -p @frontguard/cli frontguard update-baselines --confirm-baselines --url http://localhost:3000

# 4. Run visual comparison
npx -p @frontguard/cli frontguard run --url http://localhost:3000
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
  redactSensitive: true,      // Masks password, credit-card, OTP, and [data-frontguard-redact] / [data-sensitive] fields
  waitForStability: {
    maxAttempts: 4,           // Max frames captured while waiting for convergence (default: 4, min: 2, max: 10)
    intervalMs: 120,          // Delay in ms between captures (default: 120, max: 5000)
    maxUnstableRatio: 0.0005, // 0.05% frame-to-frame stability convergence threshold
  },
  colorScheme: 'light',       // Emulation only. Same baseline file. A different stored scheme warns.
  routes: [
    '/',
    '/pricing',
    {
      path: '/dashboard',
      label: 'dashboard-menu-open',
      colorScheme: 'dark',
      waitForSelector: '[data-testid="dashboard-ready"]',
      actions: [
        { type: 'click', selector: '[data-testid="user-menu-button"]' },
        { type: 'waitForSelector', selector: '[role="menu"]' },
      ],
    },
  ],
  ignore: [
    { selector: '[data-testid="live-timestamp"]' },
    { selector: '.intercom-launcher' },
  ],
});
```

## Supported Pre-Capture Route Actions

Each route object in `routes` can declare an `actions` array executed sequentially after `page.goto()` and before stability convergence / screenshot capture:

| Action Type | Fields | Description |
| --- | --- | --- |
| `click` | `selector` | Clicks the matching element |
| `hover` | `selector` | Hovers over the matching element |
| `fill` | `selector`, `value` | Fills an input or textarea |
| `press` | `key`, `selector?` | Presses a keyboard key (`Enter`, `Escape`, `Tab`, etc.) on `selector` or the active page focus |
| `waitForSelector` | `selector`, `state?` | Waits for selector (`visible`, `attached`, `hidden`) |
| `wait` | `ms` | Deterministic pause (clamped to `30000` ms at runtime) |
