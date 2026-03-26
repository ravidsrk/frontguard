# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-01

### Added

- **CLI** — `frontguard init` and `frontguard run` commands
- **Route discovery** — auto-crawl, filesystem detection (Next.js, Nuxt, SvelteKit, Astro, Remix), and manual configuration
- **Multi-browser capture** — Chromium, Firefox, and WebKit via Playwright
- **Visual comparison** — pixel-level diffing via pixelmatch with configurable thresholds
- **AI analysis** — BYOK support for OpenAI and Anthropic vision models
- **Smart rendering** — dependency graph for selective page re-rendering
- **Git baselines** — orphan branch storage for baseline screenshots
- **GitHub Action** — `ravidsrk/frontguard@v1` for CI integration
- **Preview URL detection** — auto-detect Vercel, Netlify, Cloudflare Pages, Railway, and Render
- **PR comments** — automatic diff reports posted to pull requests
- **Multiple viewports** — responsive regression testing at configurable sizes
- **Animation handling** — automatic CSS injection to disable transitions
- **Auth support** — cookie-based and header-based authentication for protected pages
- **Ignore regions** — mask dynamic content via CSS selectors or pixel coordinates
