# create-frontguard-plugin

Scaffold a new [Frontguard](https://frontguard.dev) plugin project with TypeScript, Vitest, and ready-to-implement lifecycle hooks.

[![npm](https://img.shields.io/npm/v/create-frontguard-plugin.svg)](https://www.npmjs.com/package/create-frontguard-plugin)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Quick Start

```bash
npm create frontguard-plugin my-plugin
```

Or invoke directly with `npx` and optional flags:

```bash
npx create-frontguard-plugin my-plugin \
  --template lifecycle \
  --description "Custom Frontguard lifecycle plugin" \
  --author "Your Name"
```

This creates a `frontguard-plugin-my-plugin` directory with:
- `src/index.ts` — plugin factory implementing `FrontguardPlugin`
- `test/index.test.ts` — Vitest unit tests
- `tsconfig.json`, `vitest.config.ts`, `package.json`, and `README.md`

## CLI Options

| Option | Alias | Description |
|--------|-------|-------------|
| `<name>` | — | Plugin name (automatically normalized to `frontguard-plugin-<name>`) |
| `--template <basic\|lifecycle\|reporter>` | `-t` | Starter template (`basic` default, `lifecycle` for multi-stage hooks, `reporter` for custom run reporting) |
| `--description <text>` | `-d` | One-line package description for `package.json` and `README.md` |
| `--author <name>` | `-a` | Author field in `package.json` |
| `--directory <dir>` | `-C` | Target output directory (defaults to `./frontguard-plugin-<name>`) |
| `--force` | `-f` | Overwrite existing files in the target directory |

### Templates (`--template <basic|lifecycle|reporter>`)

- **`basic`** — Minimal starter implementing `setup` and `afterRun`.
- **`lifecycle`** — Pre-wired with route discovery, render, and comparison hooks (`beforeDiscover`, `beforeRender`, `afterRender`, `afterCompare`, `afterRun`, `teardown`).
- **`reporter`** — Pre-wired for post-comparison and post-run artifact/webhook reporting (`afterCompare`, `afterRun`, `onError`).

## All 9 `FrontguardPlugin` Lifecycle Hooks

<p align="center">
  <img src="https://raw.githubusercontent.com/ravidsrk/frontguard/main/apps/web/public/images/docs/plugin-lifecycle-audits.jpg" alt="9-Hook Plugin Architecture and Unified Render Audits" width="840"/>
</p>

Frontguard plugins implement the `FrontguardPlugin` interface from `@frontguard/cli`. Every hook is optional (only `name` is required), and hooks execute in plugin registration order (`teardown` runs in reverse order):

```
setup → beforeDiscover → afterDiscover → beforeRender → afterRender → afterCompare → afterRun → onError → teardown
```

| Hook | Signature | When It Runs |
|------|-----------|--------------|
| `setup` | `setup?(ctx: PluginContext): void \| Promise<void>` | Once at the start of a pipeline run before route discovery. Validate plugin options or initialize state. |
| `beforeDiscover` | `beforeDiscover?(config: FrontguardConfig, ctx: PluginContext): FrontguardConfig \| void \| Promise<FrontguardConfig \| void>` | Before route discovery begins. May return a modified config. |
| `afterDiscover` | `afterDiscover?(routes: RouteSpec[], ctx: PluginContext): RouteSpec[] \| void \| Promise<RouteSpec[] \| void>` | After routes are discovered. Filter, augment, or reorder the route list. |
| `beforeRender` | `beforeRender?(page: Page, route: RouteSpec, viewport: number, ctx: PluginContext): void \| Promise<void>` | Before Playwright captures a screenshot for a route and viewport. Inject styles, mock APIs, or prepare DOM state. |
| `afterRender` | `afterRender?(screenshot: Buffer, page: Page, route: RouteSpec, viewport: number, ctx: PluginContext): Buffer \| void \| Promise<Buffer \| void>` | Immediately after screenshot capture while the Playwright `Page` is still open. Run DOM/axe/performance checks or transform the buffer. |
| `afterCompare` | `afterCompare?(comparison: ComparisonResult, ctx: PluginContext): ComparisonResult \| void \| Promise<ComparisonResult \| void>` | After pixel/SSIM comparison (and optional AI analysis) completes for a route and viewport. Attach plugin metadata or enrich the result. |
| `afterRun` | `afterRun?(result: RunResult, ctx: PluginContext): void \| Promise<void>` | After all routes have been compared. Emit custom reports, metrics, or webhook notifications. |
| `onError` | `onError?(error: Error, stage: string, ctx: PluginContext): boolean \| void \| Promise<boolean \| void>` | When an error occurs in any pipeline stage. Return `true` to suppress the error after handling it. |
| `teardown` | `teardown?(ctx: PluginContext): void \| Promise<void>` | Once at the end of the pipeline run (in reverse registration order) to release resources. |

## Registering a Plugin in `frontguard.config.ts`

Install or link your plugin package and add it to the `plugins` array in `frontguard.config.ts`:

```typescript
// frontguard.config.ts
import { defineConfig } from '@frontguard/cli';
import createMyPlugin from 'frontguard-plugin-my-plugin';

export default defineConfig({
  version: 1,
  baseUrl: 'http://localhost:3000',
  viewports: [375, 768, 1440],
  browsers: ['chromium'],
  plugins: [
    createMyPlugin({
      enabled: true,
    }),
  ],
});
```

You can also manage installed plugins via the Frontguard CLI:

```bash
frontguard plugin install my-plugin
frontguard plugin list
frontguard plugin uninstall my-plugin
```

## License

MIT
