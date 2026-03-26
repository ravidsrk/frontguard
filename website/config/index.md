# Config Reference

Frontguard is configured via `frontguard.config.ts` (or `.js`, `.mjs`) in your project root.

```typescript
import { defineConfig } from 'frontguard';

export default defineConfig({
  // options
});
```

## Top-level options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | — | Base URL of the app to test |
| `browsers` | `string[]` | `['chromium']` | Browsers to test: `'chromium'`, `'firefox'`, `'webkit'` |
| `viewports` | `Viewport[]` | `[{ width: 1280, height: 720 }]` | Viewport sizes for screenshots |
| `outputDir` | `string` | `'.frontguard'` | Directory for diffs and reports |
| `baselinesBranch` | `string` | `'frontguard/baselines'` | Git orphan branch for baseline storage |

**Example:**

```typescript
export default defineConfig({
  baseUrl: 'http://localhost:3000',
  browsers: ['chromium', 'firefox'],
  viewports: [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 375, height: 812 },
  ],
});
```

## Discovery options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `discovery.mode` | `'auto' \| 'filesystem' \| 'manual'` | `'auto'` | Route discovery strategy |
| `discovery.maxPages` | `number` | `100` | Max pages to discover in auto mode |
| `discovery.framework` | `string` | — | Framework for filesystem mode: `'nextjs'`, `'nuxt'`, `'sveltekit'`, `'astro'`, `'remix'` |
| `discovery.routes` | `string[]` | — | Explicit routes for manual mode |
| `discovery.includeRoutes` | `string[]` | `[]` | Additional routes to always include |
| `discovery.excludePatterns` | `string[]` | `[]` | Glob patterns to exclude from discovery |
| `discovery.dynamicParams` | `Record<string, string[]>` | `{}` | Example values for dynamic route segments |

**Example:**

```typescript
discovery: {
  mode: 'filesystem',
  framework: 'nextjs',
  excludePatterns: ['/api/*', '/admin/*'],
  dynamicParams: {
    '/blog/[slug]': ['hello-world', 'about-us'],
  },
},
```

## Comparison options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `comparison.threshold` | `number` | `0.1` | Max pixel diff percentage before flagging |
| `comparison.antialiasing` | `boolean` | `true` | Ignore antialiasing differences |
| `comparison.alphaThreshold` | `number` | `0.1` | Tolerance for semi-transparent pixels |
| `comparison.disableAnimations` | `boolean` | `true` | Inject CSS to disable animations |
| `comparison.waitForTimeout` | `number` | `0` | Milliseconds to wait after page load |
| `comparison.waitForSelector` | `string` | — | Wait for this selector before capture |
| `comparison.ignoreSelectors` | `string[]` | `[]` | CSS selectors to mask from comparison |
| `comparison.ignoreRegions` | `Region[]` | `[]` | Pixel regions to mask: `{ x, y, width, height }` |

**Example:**

```typescript
comparison: {
  threshold: 0.5,
  disableAnimations: true,
  waitForTimeout: 1000,
  ignoreSelectors: ['.ad-banner', '#timestamp'],
},
```

## AI options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ai.enabled` | `boolean` | `true` | Enable AI analysis of diffs |
| `ai.provider` | `'openai' \| 'anthropic'` | `'openai'` | AI provider |
| `ai.model` | `string` | `'gpt-4o'` | Model name |
| `ai.maxTokens` | `number` | `500` | Max tokens per analysis response |
| `ai.analyzeUnchanged` | `boolean` | `false` | Also analyze pages with no diff |

**Example:**

```typescript
ai: {
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  maxTokens: 300,
},
```

Requires `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` environment variable.

## Smart render options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `smartRender.enabled` | `boolean` | `true` | Enable dependency-graph-based selective rendering |
| `smartRender.fallbackToFull` | `boolean` | `true` | Full render if graph analysis fails |
| `smartRender.include` | `string[]` | `['src/**']` | File patterns to include in graph |
| `smartRender.exclude` | `string[]` | `['**/*.test.*']` | File patterns to exclude from graph |

**Example:**

```typescript
smartRender: {
  enabled: true,
  include: ['src/**', 'components/**'],
  exclude: ['**/*.test.*', '**/*.stories.*'],
},
```

## Wait for URL options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `waitForUrl.enabled` | `boolean` | `false` | Poll URL until it responds |
| `waitForUrl.timeout` | `number` | `60000` | Max wait time in milliseconds |
| `waitForUrl.interval` | `number` | `5000` | Poll interval in milliseconds |
| `waitForUrl.expectedStatus` | `number` | `200` | HTTP status to consider "ready" |

**Example:**

```typescript
waitForUrl: {
  enabled: true,
  timeout: 120000,
  interval: 3000,
},
```

## Auth options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `auth.type` | `'cookie' \| 'header'` | — | Authentication strategy |
| `auth.login` | `(page: Page) => Promise<void>` | — | Login function using Playwright Page |
| `auth.headers` | `Record<string, string>` | — | Custom headers for header-based auth |

**Example:**

```typescript
auth: {
  type: 'cookie',
  login: async (page) => {
    await page.goto('/login');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'password');
    await page.click('button[type="submit"]');
    await page.waitForNavigation();
  },
},
```

## Full example

```typescript
import { defineConfig } from 'frontguard';

export default defineConfig({
  baseUrl: 'http://localhost:3000',
  browsers: ['chromium', 'firefox'],
  viewports: [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 375, height: 812 },
  ],
  discovery: {
    mode: 'auto',
    maxPages: 50,
    excludePatterns: ['/api/*'],
  },
  comparison: {
    threshold: 0.1,
    disableAnimations: true,
    ignoreSelectors: ['.ad-banner'],
  },
  ai: {
    provider: 'openai',
    model: 'gpt-4o',
  },
  smartRender: {
    enabled: true,
  },
});
```
