# CI/CD & GitHub Actions Integration

## Git Orphan Branch Baselines (`frontguard-baselines`)

Frontguard stores baseline PNGs and `manifest.json` (with SHA-256 content hashes) in a dedicated git orphan branch named `frontguard-baselines`.

- **Important CI Requirement**: Always check out with `fetch-depth: 0` so `origin/frontguard-baselines` is reachable during CI runs.

## GitHub Actions Workflow (`.github/workflows/frontguard.yml`)

```yaml
name: Visual Regression
on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  visual-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - run: npm ci
      - run: npx playwright install --with-deps chromium

      - name: Start app & run Frontguard
        run: |
          npm run build && npm run start &
          npx wait-on http://localhost:3000
          npx @frontguard/cli run --url http://localhost:3000 --wait-for-stability --redact-sensitive
```

## Cross-OS Deterministic Rendering (`--docker`)

Font hinting and anti-aliasing differ between macOS (CoreText) and Linux (FreeType). If developers record baselines on macOS and CI runs on Ubuntu, run Frontguard inside the deterministic Linux container:

```bash
npx @frontguard/cli run --docker --url http://localhost:3000
```

When `--docker` is passed, Frontguard automatically rewrites `localhost` / `127.0.0.1` URLs to `host.docker.internal` inside the container.
