# Preview Deployments

Frontguard auto-detects preview deployment URLs from popular hosting platforms. When running in CI, it reads the deployment URL from environment variables — no manual configuration needed.

## Supported platforms

| Platform | Auto-detection | Environment variable |
|----------|---------------|---------------------|
| Vercel | ✅ | `VERCEL_URL` or deployment status event |
| Netlify | ✅ | `DEPLOY_PRIME_URL` or `DEPLOY_URL` |
| Cloudflare Pages | ✅ | `CF_PAGES_URL` |
| Railway | ✅ | `RAILWAY_STATIC_URL` |
| Render | ✅ | `RENDER_EXTERNAL_URL` |

## How auto-detection works

1. Frontguard checks the CI environment for known platform variables
2. If found, uses the preview URL automatically
3. If the `url` input is also provided, the explicit input takes priority
4. Falls back to `baseUrl` from your config file if no URL is detected

Detection order:
```
CLI --url flag → Action url input → Platform env var → Config baseUrl
```

## Manual override

Set `FRONTGUARD_URL` to override all auto-detection:

```bash
export FRONTGUARD_URL=https://my-preview-abc123.example.com
npx frontguard run
```

In GitHub Actions:

```yaml
- uses: ravidsrk/frontguard@v1
  env:
    FRONTGUARD_URL: https://my-custom-preview.example.com
```

## Wait for URL

Preview deployments take time to become available. Frontguard can poll until the URL responds:

```typescript
export default defineConfig({
  waitForUrl: {
    enabled: true,
    timeout: 120000,     // Wait up to 2 minutes
    interval: 5000,      // Poll every 5 seconds
    expectedStatus: 200, // Consider ready when returning 200
  },
});
```

CLI flag:

```bash
npx frontguard run --wait-for-url --timeout 120000
```

## Vercel workflow (recommended)

The cleanest Vercel integration uses the `deployment_status` event, which fires after the preview is live:

```yaml
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
```

No polling needed — the workflow only runs after deployment succeeds.

## Netlify workflow

For Netlify, use a wait step or the Netlify deploy action:

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: ravidsrk/frontguard@v1
    with:
      url: ${{ env.DEPLOY_PRIME_URL }}
    env:
      FRONTGUARD_WAIT_FOR_URL: 'true'
```

## Cloudflare Pages workflow

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: ravidsrk/frontguard@v1
    with:
      url: ${{ env.CF_PAGES_URL }}
```
