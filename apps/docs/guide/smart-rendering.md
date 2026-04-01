# Smart Rendering

Frontguard builds a dependency graph of your components and pages to determine which pages are affected by a given code change. Only affected pages are re-rendered and compared — typically 60-80% faster than full re-renders.

## How it works

1. **Analyze** — parses your source files to build an import/dependency graph
2. **Detect changes** — compares the current branch against the baseline branch using `git diff`
3. **Resolve impact** — walks the dependency graph to find all pages that import (directly or transitively) a changed file
4. **Selective capture** — only screenshots affected pages; unchanged pages keep their existing baselines

## Example

```
src/components/Button.tsx  ← changed
  └── imported by: src/pages/pricing.tsx
  └── imported by: src/pages/about.tsx

src/pages/home.tsx         ← not affected, skipped
src/pages/blog.tsx         ← not affected, skipped
```

Result: only `/pricing` and `/about` are re-captured and compared.

## What triggers full vs partial re-render

| Change type | Behavior |
|------------|----------|
| Component file changed | Re-render pages importing that component |
| Page file changed | Re-render that specific page |
| Global CSS/layout changed | Full re-render (all pages) |
| Config file changed | Full re-render |
| Non-code file (README, etc.) | No re-render |

## Framework support

Smart rendering requires understanding your framework's module system:

| Framework | Support | Notes |
|-----------|---------|-------|
| Next.js | ✅ Full | App Router and Pages Router |
| React (Vite) | ✅ Full | Standard import resolution |
| Nuxt | ✅ Full | Auto-import detection |
| SvelteKit | ✅ Full | Component imports |
| Astro | ✅ Full | Island architecture aware |
| Remix | ✅ Full | Route module imports |
| Static HTML | ❌ None | No module graph — always full render |

## Configuration

```typescript
export default defineConfig({
  smartRender: true, // or false to render all routes
});
```

## Disabling smart rendering

To always re-render all pages:

```typescript
smartRender: false,
```

Or use the CLI flag:

```bash
npx frontguard run --full-render
```

This is useful for release branches where you want complete visual coverage regardless of what changed.
