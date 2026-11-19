# Perceptual Diffing, Frame Stability & Sensitive Redaction

## 3-Layer Perceptual Diffing Engine

Frontguard combines three complementary diffing stages in `packages/cli/src/diff/`:

1. **Pixelmatch YIQ Anti-Aliasing Filter (`pixel.ts`)**:
   - Compares baseline and current PNGs in NTSC YIQ color space (`threshold: 0.1`), filtering subpixel font hinting and anti-aliasing edges.
2. **Connected-Component Diff Clustering (`regions.ts`)**:
   - Performs separable $O(W \times H)$ box dilation (`dilateRadiusX: 4`, `dilateRadiusY: 2`), 8-connected Union-Find component labeling, and bounding-box proximity merging.
   - Produces up to `maxClusters` localized `DiffCluster` bounding boxes (`bbox`, `rawDiffPixels`, `density`, `perimeterRatio`, `chromaSSIM`, `cwSSIM`).
3. **Region-Scoped Chroma-SSIM & Complex Wavelet SSIM (`ssim.ts`)**:
   - **Chroma-SSIM**: ITU-R BT.709 YCbCr weighted SSIM ($0.8 \cdot \text{SSIM}_Y + 0.1 \cdot \text{SSIM}_{Cb} + 0.1 \cdot \text{SSIM}_{Cr}$) evaluated strictly within each diff cluster's bounding box so isoluminant color shifts (e.g., red vs. green status badge) are never diluted by surrounding page whitespace.
   - **CW-SSIM**: 4-orientation quadrature Gabor phase consistency metric invariant to 1–3px subpixel translation shifts while dropping sharply on structural layout distortions.

## Frame Stability Convergence & Motion Attribution

When `waitForStability: true` (or `waitForStability: { maxAttempts, intervalMs, pixelThreshold, maxUnstableRatio }` / `--wait-for-stability`) is enabled:

- Frontguard polls consecutive screenshots at `intervalMs` (default `120ms`, max `5000ms`) for up to `maxAttempts` frames (default `4`, min `2`, max `10`).
- Once two consecutive frames differ by $\le \text{maxUnstableRatio}$ (default `0.0005` = 0.05%, using `pixelThreshold` default `0.1`), the page is marked `settled: true` and the settled buffer is used directly without an extra screenshot roundtrip.
- If the page fails to settle within `maxAttempts` (e.g., an infinite JS canvas ticker or unthrottled animation), Frontguard extracts `motionClusters` (`DiffCluster[]`) pinpointing the exact `(x, y, width, height)` regions still in motion.

## Sensitive-DOM Pixel & HTML Snapshot Redaction

When `redactSensitive: true` (or `--redact-sensitive`) is enabled:

- Automatically masks:
  - `input[type="password"]`
  - `input[autocomplete="current-password"]` and `input[autocomplete="new-password"]`
  - Credit card inputs (`input[autocomplete^="cc-"]`)
  - `input[autocomplete="one-time-code"]`
  - Any element with `[data-frontguard-redact]` or `[data-sensitive]`
  - Any custom CSS selectors provided in `redactSensitive: ['...']`
- **Layout-Preserving**: Applies `color: transparent !important; text-shadow: none !important; caret-color: transparent !important;` without altering `width`, `height`, `padding`, or `border`, preventing false layout shifts.
- **Shadow DOM Traversal**: Recursively traverses open `shadowRoot` trees.
- **HTML Snapshot Scrubbing**: Scrubs `value="..."` attributes to `value="[REDACTED]"` on sensitive `<input>` tags in `domSnapshot` before persisting snapshots or transmitting DOM context to AI vision models.
