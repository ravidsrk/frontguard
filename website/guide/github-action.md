# GitHub Action

Frontguard ships as a GitHub Action for seamless CI integration. Add visual regression testing to any PR workflow.

## Quick setup

```yaml
name: Visual Regression
on: [pull_request]

jobs:
  frontguard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ravidsrk/frontguard@v1
        with:
          url: 'http://localhost:3000'
```

## Input reference

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | string | — | **Required.** URL to test against |
| `config` | string | `frontguard.config.ts` | Path to config file |
| `browsers` | string | `chromium` | Comma-separated: `chromium,firefox,webkit` |
| `threshold` | number | `0.1` | Pixel diff threshold (%) |
| `ai-provider` | string | — | `openai` or `anthropic` |
| `ai-model` | string | `gpt-4o` | Model for AI analysis |
| `full-render` | boolean | `false` | Disable smart rendering |
| `upload-artifacts` | boolean | `true` | Upload diff images as artifacts |
| `comment` | boolean | `true` | Post results as PR comment |
| `fail-on-regression` | boolean | `true` | Fail the check if regressions found |
| `baselines-branch` | string | `frontguard/baselines` | Branch for baseline storage |

## Output reference

| Output | Type | Description |
|--------|------|-------------|
| `total-pages` | number | Total pages discovered |
| `changed-pages` | number | Pages with visual changes |
| `regressions` | number | Pages classified as regressions |
| `passed` | boolean | Whether the check passed |
| `report-url` | string | URL to the uploaded report artifact |

## Vercel preview deployment

```yaml
name: Visual Regression
on:
  deployment_status:

jobs:
  frontguard:
    if: github.event.deployment_status.state == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ravidsrk/frontguard@v1
        with:
          url: ${{ github.event.deployment_status.target_url }}
          ai-provider: openai
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Netlify preview deployment

```yaml
name: Visual Regression
on:
  pull_request:

jobs:
  frontguard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Wait for Netlify deploy
        uses: probotframework/wait-for-netlify-action@v1
        id: netlify
        with:
          site_id: ${{ secrets.NETLIFY_SITE_ID }}
        env:
          NETLIFY_TOKEN: ${{ secrets.NETLIFY_TOKEN }}

      - uses: ravidsrk/frontguard@v1
        with:
          url: ${{ steps.netlify.outputs.url }}
          ai-provider: anthropic
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Using outputs

```yaml
- uses: ravidsrk/frontguard@v1
  id: vrt
  with:
    url: ${{ env.PREVIEW_URL }}

- name: Check results
  run: |
    echo "Changed pages: ${{ steps.vrt.outputs.changed-pages }}"
    echo "Regressions: ${{ steps.vrt.outputs.regressions }}"
    if [ "${{ steps.vrt.outputs.passed }}" != "true" ]; then
      echo "Visual regressions detected!"
      exit 1
    fi
```

## Secrets

Store API keys as GitHub repository secrets:

- `OPENAI_API_KEY` — for OpenAI AI analysis
- `ANTHROPIC_API_KEY` — for Anthropic AI analysis

These are passed as environment variables, never exposed in logs.
