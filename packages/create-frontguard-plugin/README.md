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

Frontguard plugins implement the `FrontguardPlugin` interface from `@frontguard/cli`. Every hook is optional (only `name` is required), and hooks execute in plugin registration order (`teardown` runs in reverse order):

```
setup → beforeDiscover → afterDiscover → beforeRender → afterRender → afterCompare → afterRun → onError → teardown
```

| Hook | Signature | When It Runs |
|------|-----------|--------------|
| `setup` | `setup?(ctx: PluginContext): void \| Promise<void>` | Before discovery; validate options or initialize state. |
| `beforeDiscover` | `beforeDiscover?(config: FrontguardConfig): FrontguardConfig \| Promise<FrontguardConfig>` | Return the discovery config. |
| `afterDiscover` | `afterDiscover?(routes: Route[], config: FrontguardConfig): Route[] \| Promise<Route[]>` | Return filtered or augmented routes. |
| `beforeRender` | `beforeRender?(input: { routes: Route[]; config: FrontguardConfig }): { routes: Route[]; config: FrontguardConfig } \| Promise<{ routes: Route[]; config: FrontguardConfig }>` | Return capture configuration and routes; no live Page is passed. |
| `afterRender` | `afterRender?(screenshots: ScreenshotResult[], ctx: PluginContext): ScreenshotResult[] \| Promise<ScreenshotResult[]> \| void \| Promise<void>` | Inspect or replace the captured screenshot array. |
| `afterCompare` | `afterCompare?(diffs: DiffResult[], ctx: PluginContext): DiffResult[] \| Promise<DiffResult[]> \| void \| Promise<void>` | Inspect or replace the comparison array. |
| `afterRun` | `afterRun?(result: RunResult, ctx: PluginContext): void \| Promise<void>` | Report the run; `result.summary` holds aggregate counts. |
| `onError` | `onError?(error: Error, stage: string): boolean \| Promise<boolean> \| void \| Promise<void>` | Return true to suppress an error. |
| `teardown` | `teardown?(): void \| Promise<void>` | Release resources, in reverse registration order. |

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
