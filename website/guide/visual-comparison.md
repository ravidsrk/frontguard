# Visual Comparison

Frontguard uses pixel-level diffing (via pixelmatch) to detect visual changes between baseline and current screenshots.

## How it works

1. **Capture** — screenshots the current state of each page
2. **Compare** — pixel-by-pixel diff against the stored baseline
3. **Gate** — if the diff exceeds the threshold, the page is flagged as changed
4. **Report** — generates a diff image highlighting changed pixels in red

## Threshold configuration

The `threshold` value controls sensitivity. It represents the maximum percentage of changed pixels before a page is flagged.

```typescript
export default defineConfig({
  comparison: {
    threshold: 0.1,        // Flag if >0.1% of pixels changed (strict)
    antialiasing: true,    // Ignore antialiasing differences
    alphaThreshold: 0.1,   // Tolerance for semi-transparent pixels
  },
});
```

| Threshold | Sensitivity | Use case |
|-----------|-------------|----------|
| `0.01` | Very strict | Pixel-perfect designs |
| `0.1` | Strict | Most production apps |
| `0.5` | Moderate | Content-heavy sites |
| `1.0` | Relaxed | Early development |

## Ignore regions

Exclude dynamic content (ads, timestamps, user avatars) from comparison:

```typescript
comparison: {
  ignoreSelectors: [
    '.ad-banner',           // CSS selector
    '#current-time',
    '[data-testid="avatar"]',
  ],
  ignoreRegions: [
    { x: 0, y: 0, width: 200, height: 50 },  // Pixel coordinates
  ],
},
```

Ignored regions are masked before comparison — they won't trigger false positives.

## Animation handling

Animations and transitions cause flaky diffs. Frontguard handles them automatically:

```typescript
comparison: {
  disableAnimations: true,   // Default: true
  waitForTimeout: 1000,      // Wait 1s after load for animations to settle
  waitForSelector: '.hero-loaded',  // Wait for specific element
},
```

When `disableAnimations` is true, Frontguard injects CSS to disable all transitions and animations before capturing:

```css
*, *::before, *::after {
  animation-duration: 0s !important;
  transition-duration: 0s !important;
}
```

## Viewport configuration

Test at multiple viewport sizes:

```typescript
viewports: [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
],
```

Each viewport generates its own baseline and comparison, giving you responsive regression testing out of the box.

## Diff output

Changed pages produce three images:
- **baseline.png** — the expected screenshot
- **current.png** — the actual screenshot
- **diff.png** — a red overlay showing changed pixels

These are stored in `.frontguard/diffs/` and attached to PR comments when using the GitHub Action.
