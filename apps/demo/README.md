# Frontguard Demo

A sample Next.js app pre-configured with [Frontguard](https://github.com/ravidsrk/frontguard) — the open-source, AI-powered visual regression testing tool. Every pull request is automatically screenshotted, diffed, and analyzed. You get a PR comment explaining exactly what changed in plain English.

![Frontguard PR comment with visual diff](public/screenshot.png)

---

## Try it in 60 seconds

1. **Fork this repo**
2. Add your OpenAI key as a repo secret: `Settings → Secrets → OPENAI_API_KEY`
3. **Make a CSS change** — edit a color, font size, or spacing in any page
4. **Open a pull request** against `main`
5. Watch the GitHub Action run → Frontguard posts a visual diff comment on your PR

That's it. No test files to write. No config to tweak.

---

## What's inside

| Page | Route | What it shows |
|------|-------|---------------|
| Homepage | `/` | Hero section, CTA button, feature cards |
| Pricing | `/pricing` | 3 pricing tier cards |
| About | `/about` | Team section with avatars, company stats |

Frontguard tests all 3 pages at **2 viewports** (375px mobile, 1440px desktop) on every PR.

---

## Local development

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Run Frontguard locally

```bash
npx frontguard run --url http://localhost:3000
```

---

## Configuration

See [`frontguard.config.ts`](./frontguard.config.ts) for the full config. Key settings:

- **routes** — pages to screenshot
- **viewports** — screen widths to test
- **threshold** — pixel diff sensitivity (0.01 = strict)
- **ai.provider** — `openai` or `anthropic` for visual analysis

---

## Learn more

- [Frontguard GitHub](https://github.com/ravidsrk/frontguard)
- [Frontguard Docs](https://frontguard.dev)
- [How it works](https://frontguard.dev/docs/how-it-works)
