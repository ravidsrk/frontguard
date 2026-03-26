# Show HN: Frontguard – AI-powered visual regression testing for frontend

Backend teams have Datadog, Sentry, PagerDuty. When a deploy breaks something, they know within minutes. Frontend teams have... nothing. A CSS refactor ships, a button vanishes on the pricing page, and nobody notices until a customer emails support.

I built Frontguard to fix this. It's an open-source CLI that:

1. Auto-crawls your app to find all routes (zero-config)
2. Screenshots every page with Playwright (Chromium, Firefox, WebKit)
3. Pixel-diffs against baseline screenshots stored in a git orphan branch
4. Sends changed screenshots to a vision LLM (GPT-4o or Claude) that explains what broke in plain English

The AI part is BYOK — you bring your own API key. Or skip it entirely and use pure pixel diffing. No cloud service, no per-screenshot billing.

A few things I focused on:

**Smart rendering** — builds a dependency graph of your components. When you change `Button.tsx`, only pages that import it get re-screenshotted. Cuts CI time 60-80% on large apps.

**Preview deployments** — auto-detects Vercel/Netlify/Cloudflare Pages preview URLs. Point it at your PR preview, get a visual diff report as a PR comment.

**GitHub Action** — three lines in your workflow YAML.

Stack: TypeScript, Playwright, pixelmatch, Zod. ~2k lines of code. MIT licensed.

Interested in feedback on the approach. The AI classification (regression vs intentional change) is surprisingly accurate but I'm curious how it holds up on more complex UIs.

https://github.com/ravidsrk/frontguard
