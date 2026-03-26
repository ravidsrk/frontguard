# AI Analysis

Frontguard uses vision-capable LLMs to analyze visual diffs and explain what changed in plain English. This is BYOK (Bring Your Own Key) — you use your own OpenAI or Anthropic API key.

## Setup

Set your API key as an environment variable:

```bash
# OpenAI
export OPENAI_API_KEY=sk-...

# or Anthropic
export ANTHROPIC_API_KEY=sk-ant-...
```

Configure the provider in your config:

```typescript
export default defineConfig({
  ai: {
    provider: 'openai',         // 'openai' or 'anthropic'
    model: 'gpt-4o',            // or 'claude-sonnet-4-20250514'
    maxTokens: 500,             // Max tokens per analysis
    analyzeUnchanged: false,    // Skip pages with no pixel diff
  },
});
```

## What the AI analyzes

For each page with visual changes, Frontguard sends the AI:
1. The **baseline** screenshot
2. The **current** screenshot
3. The **diff** image with changed pixels highlighted

The AI returns a structured analysis with classification, explanation, and confidence score.

## Classification types

| Classification | Meaning |
|---------------|---------|
| `REGRESSION` | Unintended visual break — something looks wrong |
| `INTENTIONAL` | Deliberate design change — looks correct |
| `FLAKY` | Non-deterministic difference (animation, timing, dynamic content) |
| `UNKNOWN` | AI cannot determine intent with sufficient confidence |

## Confidence scoring

Each classification includes a confidence score from 0.0 to 1.0:

- **0.9–1.0** — High confidence. Trust the classification.
- **0.7–0.89** — Moderate confidence. Worth reviewing.
- **Below 0.7** — Low confidence. Manual review recommended.

## PR comment format

When running in CI with the GitHub Action, AI analysis appears directly in PR comments:

```
🤖 AI Analysis for /pricing

Classification: REGRESSION (confidence: 0.94)

The primary call-to-action button in the hero section is no longer
visible. The button text "Start Free Trial" and its containing
element appear to be missing, likely due to a conditional rendering
change or CSS display issue. The rest of the page layout is intact.

Suggested action: Check the hero component for recent changes to
button visibility logic.
```

## Cost management

AI analysis only runs on pages that exceed the pixel diff threshold. For a typical PR changing 2-3 pages, expect:

- **OpenAI (GPT-4o):** ~$0.01–0.05 per run
- **Anthropic (Claude Sonnet):** ~$0.01–0.04 per run

To disable AI and use pixel diffing only:

```typescript
ai: { enabled: false },
```
