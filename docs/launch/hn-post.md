# Show HN: Frontguard – AI-powered visual regression testing for frontend

Backend teams have Datadog, Sentry, PagerDuty. When a deploy breaks something, they know within minutes. Frontend teams have... nothing. A CSS refactor ships, a button vanishes on the pricing page, and nobody notices until a customer emails support.

I built Frontguard to fix this. It's an open-source CLI that:

1. Screenshots every page with Playwright (Chromium, Firefox, WebKit)
2. Pixel-diffs against baselines stored in a git orphan branch
3. Sends diffs to a vision LLM (GPT-4o or Claude) that explains what broke in plain English
4. Posts a PR comment with the visual diff and AI explanation

No cloud service, no per-screenshot billing. BYOK for AI — or skip it entirely and use pure pixel diffing.

**Try it in 60 seconds:**

```
npx frontguard run --url https://your-app.vercel.app
```

Or fork the demo repo — it's pre-configured with a GitHub Action that runs Frontguard on every PR: https://github.com/ravidsrk/frontguard-demo

**What makes it different:**

- **Smart rendering** — dependency graph analysis. Change `Button.tsx`, only pages using it get re-screenshotted. 60-80% faster CI runs.
- **Preview URL detection** — auto-detects Vercel/Netlify/Cloudflare preview URLs.
- **GitHub Action** — three lines in your workflow YAML.

Stack: TypeScript, Playwright, pixelmatch, Zod. ~2k lines. MIT licensed.

Would love feedback on the AI classification approach (regression vs intentional change). It's surprisingly accurate but curious how it holds up on complex UIs.

https://github.com/ravidsrk/frontguard
