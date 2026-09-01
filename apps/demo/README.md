# Frontguard Demo

A small Next.js target application for exercising Frontguard against real routes.
It is a test fixture, not evidence of a successful GitHub Action or PR comment.

No PR screenshot is included yet. The previous `public/screenshot.png` was a
text placeholder, not captured output, so it has been removed.

---

## Run the target app

From the repository root:

```bash
npm ci
npm run dev --workspace=apps/demo
```

Open http://127.0.0.1:3000.

---

## What's inside

| Page | Route | What it shows |
|------|-------|---------------|
| Homepage | `/` | Hero section, CTA button, feature cards |
| Pricing | `/pricing` | 3 pricing tier cards |
| About | `/about` | Team section with avatars, company stats |

`frontguard.config.ts` selects all three pages at two viewports (375px mobile
and 1440px desktop). The repository does not run this fixture on every PR.

---

## Run the published CLI

The latest registry-verified release is pinned below. In a second terminal,
review the target, then explicitly create baselines:

```bash
npm exec --yes --package="@frontguard/cli@0.2.2" -- frontguard run \
  --config apps/demo/frontguard.config.ts \
  --update-baselines
git push origin frontguard-baselines
```

Subsequent comparisons are read-only:

```bash
npm exec --yes --package="@frontguard/cli@0.2.2" -- frontguard run \
  --config apps/demo/frontguard.config.ts
```

Baseline updates create commits on the separate `frontguard-baselines` branch.
They are never enabled implicitly by the example workflow.

## Manual workflow fixture

`.github/workflows/frontguard-example.yml` is intentionally limited to
`workflow_dispatch` and runs the CLI directly. It is not an Action acceptance
test. Dispatch it with `update_baselines=true` once to seed the persisted branch,
then with both inputs false for a comparison. Set only
`negative_control=true` to inject a known 160px layout shift; that run succeeds
only when Frontguard reports a regression.

---

## Configuration

See [`frontguard.config.ts`](./frontguard.config.ts) for the full config. Key settings:

- **routes** — pages to screenshot
- **viewports** — screen widths to test
- **threshold** — pixel diff sensitivity (0.01 = strict)

---

## Learn more

- [Frontguard GitHub](https://github.com/ravidsrk/frontguard)
- [Frontguard Docs](https://frontguard.dev)
- [How it works](https://frontguard.dev/docs/how-it-works)
