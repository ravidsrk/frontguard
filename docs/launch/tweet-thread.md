# Frontguard Launch Thread

## Tweet 1 — The Problem

Backend teams have Datadog, Sentry, PagerDuty.

Frontend teams have... manual QA and hope.

A CSS change ships. A button disappears. Nobody notices until a customer complains.

We built something to fix that. 🧵

## Tweet 2 — What Frontguard Does

Introducing Frontguard — open-source visual regression testing for frontend.

It screenshots every page in your app, diffs against baselines, and uses AI to explain what changed.

"The CTA button on /pricing is missing" — not "47 pixels differ."

## Tweet 3 — The Tech

Under the hood:

🎭 Playwright for multi-browser screenshots (Chromium, Firefox, WebKit)
🔍 pixelmatch for pixel-level diffing
🤖 GPT-4o or Claude for visual analysis
📦 Git orphan branch for baseline storage

Zero cloud dependencies. Everything runs in your CI.

## Tweet 4 — Zero-Config Magic

No test files. No manual route lists.

Frontguard auto-crawls your app to discover every page, or reads your Next.js/Nuxt/SvelteKit file-based routes.

First run = baselines.
Second run = comparisons.

That's it.

## Tweet 5 — GitHub Action in 3 Lines

```yaml
- uses: ravidsrk/frontguard@v1
  with:
    url: ${{ env.PREVIEW_URL }}
```

Point it at your Vercel/Netlify preview URL.

Get a PR comment with visual diffs + AI explanations.

Every PR. Automatic.

## Tweet 6 — Open Source

Frontguard is MIT licensed and free forever.

BYOK for AI (your own OpenAI/Anthropic key) — or skip AI entirely.

No per-screenshot pricing. No vendor lock-in.

⭐ GitHub: github.com/ravidsrk/frontguard
📖 Docs: frontguard.dev

Would love your feedback — star the repo if this is useful!
