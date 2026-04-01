# What is Frontguard?

Backend teams have Datadog, PagerDuty, and Sentry. When something breaks, they know immediately. **Frontend teams have nothing.** A CSS change ships, a button disappears, and nobody notices until a user complains.

Frontguard is an open-source visual regression testing tool that catches UI bugs before they reach production. It screenshots every page in your app, compares them against baselines, and uses AI to explain what changed and whether it matters.

## Who is it for?

- **Frontend teams** shipping UI changes frequently
- **Solo developers** who can't manually QA every page
- **Teams without dedicated QA** who need automated visual coverage

## How it compares

| | Frontguard | Percy / Chromatic | Applitools |
|---|---|---|---|
| **Pricing** | Free (open source) | Per-screenshot billing | Enterprise pricing |
| **AI analysis** | BYOK (your own API key) | Limited | Proprietary |
| **Setup** | Zero-config auto-crawl | Manual test setup | Manual test setup |
| **Baselines** | Git orphan branch | Cloud storage | Cloud storage |
| **Self-hosted** | Yes | No | No |

Frontguard runs entirely in your CI pipeline. No third-party cloud, no per-screenshot fees, no vendor lock-in. Bring your own OpenAI or Anthropic key for AI-powered explanations — or skip AI entirely and use pure pixel diffing.
