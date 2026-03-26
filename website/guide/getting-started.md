# Getting Started

Get visual regression testing running in under 5 minutes.

## 1. Initialize

```bash
npx frontguard init
```

This creates a `frontguard.config.ts` file in your project root:

```typescript
import { defineConfig } from 'frontguard';

export default defineConfig({
  baseUrl: 'http://localhost:3000',
  browsers: ['chromium'],
  discovery: { mode: 'auto' },
});
```

## 2. Establish baselines

Start your dev server, then run Frontguard:

```bash
npx frontguard run --url http://localhost:3000
```

First run output:

```
✔ Discovered 12 routes
✔ Captured 12 screenshots (chromium)
✔ No baselines found — establishing new baselines
✔ Saved baselines to branch: frontguard/baselines

📸 12 pages baselined. Run again after changes to compare.
```

## 3. Make changes, run again

After modifying your UI, run the same command:

```bash
npx frontguard run --url http://localhost:3000
```

Comparison output:

```
✔ Discovered 12 routes
✔ Captured 12 screenshots (chromium)
✔ Compared against baselines

Results:
  ✅ 10 pages unchanged
  ⚠️  2 pages changed:
    /pricing — 3.2% pixel diff
    /about   — 0.8% pixel diff

🤖 AI Analysis (2 pages):
  /pricing — REGRESSION: Primary CTA button missing from hero section.
             Confidence: 0.94. Likely caused by layout change.
  /about   — INTENTIONAL: Updated team photo. No functional impact.
             Confidence: 0.91.
```

## 4. CI integration

Add to your GitHub Actions workflow:

```yaml
- uses: ravidsrk/frontguard@v1
  with:
    url: ${{ env.PREVIEW_URL }}
```

See the [GitHub Action guide](/guide/github-action) for full configuration.

## Next steps

- [Route Discovery](/guide/route-discovery) — control which pages are tested
- [Visual Comparison](/guide/visual-comparison) — tune thresholds and ignore regions
- [AI Analysis](/guide/ai-analysis) — set up AI-powered explanations
