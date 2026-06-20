# Frontguard fixture: Storybook

A real Storybook 8 project used by `packages/cli` tests and as a worked
example for the Storybook integration docs.

```
npm install --prefix packages/cli/__fixtures__/storybook
npm run storybook --prefix packages/cli/__fixtures__/storybook   # localhost:6006
npx -p @frontguard/cli frontguard run \
  --config packages/cli/__fixtures__/storybook/frontguard.config.ts
```

## What's here

- `src/components/Button.tsx` + `Button.stories.tsx` — four variants, two with
  per-story `parameters.frontguard` overrides (viewport narrowing + threshold).
- `src/components/Modal.tsx` + `Modal.stories.tsx` — three stories including
  one with a `play()` function that clicks the trigger; this exercises
  Frontguard's `play()`-await path in the renderer.
- `.storybook/main.ts` + `preview.ts` — Storybook 8 (Vite builder) config.

## What the tests use

The tests do not boot a real Storybook server. Instead they spawn an
in-process HTTP server that serves a hand-crafted `index.json` mimicking the
real one, plus a minimal `iframe.html` shell that simulates
`window.__STORYBOOK_PREVIEW__`. The full fixture is here so it can be run
by humans (`npm run storybook`) and used by docs/screenshots.
