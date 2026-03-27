# Frontguard Launch — Tweet Thread

## Tweet 1 — The Hook (standalone)

We just open-sourced Frontguard — AI-powered visual regression testing for frontend.

It screenshots your app, diffs every page, and uses GPT-4o to explain what changed in plain English.

No test files. No config. Just `npx frontguard run`.

🧵👇

[IMAGE: Terminal showing `npx frontguard run` output with green checkmarks and one visual diff detected]

## Tweet 2 — The Problem

Every frontend team has shipped a CSS change that broke something on a page nobody checked.

A refactor lands, the pricing page CTA disappears, and you find out from a customer email 3 days later.

Frontguard catches it in CI, before merge.

[IMAGE: Side-by-side screenshot showing a before/after visual diff — missing button highlighted in red]

## Tweet 3 — The AI Part

Most visual diff tools say "47 pixels changed."

Frontguard sends the diff to GPT-4o and you get:

"The primary CTA button on /pricing is missing. The blue #4F46E5 button below the hero section is no longer rendered."

Actually useful in a PR review.

[IMAGE: GitHub PR comment showing Frontguard's AI-generated visual diff report]

## Tweet 4 — How It Works

Under the hood:

🎭 Playwright for multi-browser screenshots
🔍 pixelmatch for pixel-level diffing
🤖 GPT-4o or Claude for visual analysis
📦 Git orphan branch for baseline storage

Everything runs in your CI. Zero cloud dependencies.

[IMAGE: Architecture diagram showing the Frontguard pipeline: capture → diff → AI analyze → PR comment]

## Tweet 5 — Try It Now

Try it in 60 seconds:

1. Fork github.com/ravidsrk/frontguard-demo
2. Change a color in any page
3. Open a PR
4. Watch the visual diff report appear

Or just: `npx frontguard run --url https://your-app.com`

[IMAGE: Screenshot of the demo repo's GitHub Action running successfully with PR comment]

## Tweet 6 — Open Source

Frontguard is MIT licensed, free forever.

BYOK for AI (OpenAI or Anthropic) — or skip AI entirely.

No per-screenshot pricing. No vendor lock-in.

⭐ github.com/ravidsrk/frontguard

Star the repo if this is useful!

[IMAGE: GitHub repo page showing star count, MIT license badge, and description]
