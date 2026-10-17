/**
 * Connected-component diff clustering and Set-of-Mark (SoM) region utilities.
 *
 * Groups raw pixel-level differences into semantically meaningful visual regions
 * using separable O(W × H) box dilation, 8-connected Union-Find labeling, and
 * AABB proximity merging. Also provides native-resolution 3-panel comparison
 * strip cropping and Set-of-Mark bounding box overlays for VLM grounding.
 *
 * @module diff/regions
 */

import { PNG } from 'pngjs';
import type { DOMElementBox, ClusteredDOMElement } from '../render/dom-elements.js';

export type { DOMElementBox, ClusteredDOMElement };

// ---------------------------------------------------------------------------
// Public Types
// ---------------------------------------------------------------------------

/** Axis-aligned bounding box in pixel coordinates. */
export interface BoundingBox {
  /** Left X coordinate (0-indexed). */
  x: number;
  /** Top Y coordinate (0-indexed). */
  y: number;
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
}

/** A clustered region of visual difference. */
export interface DiffCluster {
  /** 1-based cluster identifier (sorted by rawDiffPixels descending). */
  id: number;
  /** Tight bounding box enclosing the raw diff pixels in this cluster. */
  bbox: BoundingBox;
  /** Number of raw differing pixels within this cluster. */
  rawDiffPixels: number;
  /** Ratio of rawDiffPixels to bounding box area (0–1). */
  density: number;
  /** Ratio of boundary diff pixels to rawDiffPixels (0–1); near 1.0 indicates thin AA fringes. */
  perimeterRatio: number;
  /** Region-scoped ITU-R BT.709 YCbCr SSIM (0–1), if computed. */
  chromaSSIM?: number;
  /** Region-scoped Complex Wavelet / Quadrature Gabor Phase SSIM (0–1), if computed. */
  cwSSIM?: number;
  /** Primary CSS selector of the DOM element most closely overlapping this cluster. */
  targetSelector?: string;
  /** Top overlapping DOM elements attributed to this diff cluster. */
  affectedElements?: ClusteredDOMElement[];
}

/** Options controlling connected-component diff cluster extraction. */
export interface ClusterExtractionOptions {
  /** Horizontal dilation radius in pixels to bridge character kerning (default: 8). */
  dilateRadiusX?: number;
  /** Vertical dilation radius in pixels to bridge line spacing (default: 4). */
  dilateRadiusY?: number;
  /** Minimum raw diff pixels required to retain a cluster (default: 4). */
  minPixels?: number;
  /** Proximity margin in pixels for merging overlapping/adjacent AABBs (default: 8). */
  mergeMargin?: number;
  /** Maximum number of clusters to return, sorted by rawDiffPixels descending (default: 8). */
  maxClusters?: number;
}

// ---------------------------------------------------------------------------
// Connected-Component Diff Clustering
// ---------------------------------------------------------------------------

interface RawClusterAccum {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  rawDiffPixels: number;
  perimeterPixels: number;
}

/**
 * Extract spatial diff clusters from a binary diff mask using:
 * 1. Separable O(W × H) box dilation (sliding window horizontal + vertical passes)
 * 2. Two-pass 8-connected Union-Find component labeling
 * 3. Tight raw-pixel bounding box accumulation & perimeter ratio calculation
 * 4. Iterative AABB proximity merging and micro-speck filtering
 *
 * @param diffMask - Binary mask of length `width * height` (non-zero = diff pixel)
 * @param width    - Image width in pixels
 * @param height   - Image height in pixels
 * @param options  - Optional extraction parameters
 * @returns Top diff clusters sorted by `rawDiffPixels` descending
 */
export function extractDiffClusters(
  diffMask: Uint8Array,
  width: number,
  height: number,
  options?: ClusterExtractionOptions,
): DiffCluster[] {
  if (width <= 0 || height <= 0 || diffMask.length < width * height) {
    return [];
  }

  const rx = Math.max(0, Math.floor(options?.dilateRadiusX ?? 8));
  const ry = Math.max(0, Math.floor(options?.dilateRadiusY ?? 4));
  const minPixels = Math.max(1, Math.floor(options?.minPixels ?? 4));
  const mergeMargin = Math.max(0, Math.floor(options?.mergeMargin ?? 8));
  const maxClusters = Math.max(1, Math.floor(options?.maxClusters ?? 8));

  const total = width * height;

  // Quick check if mask is completely empty
  let hasAnyDiff = false;
  for (let i = 0; i < total; i++) {
    if (diffMask[i] !== 0) {
      hasAnyDiff = true;
      break;
    }
  }
  if (!hasAnyDiff) {
    return [];
  }

  // --- Step 1: Separable O(W × H) box dilation -----------------------------
  const horiz = new Uint8Array(total);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    let windowSum = 0;
    const initEnd = Math.min(width - 1, rx);
    for (let x = 0; x <= initEnd; x++) {
      if (diffMask[rowOffset + x] !== 0) windowSum++;
    }
    for (let x = 0; x < width; x++) {
      if (windowSum > 0) {
        horiz[rowOffset + x] = 1;
      }
      const outX = x - rx;
      if (outX >= 0 && diffMask[rowOffset + outX] !== 0) {
        windowSum--;
      }
      const inX = x + rx + 1;
      if (inX < width && diffMask[rowOffset + inX] !== 0) {
        windowSum++;
      }
    }
  }

  const dilated = new Uint8Array(total);
  for (let x = 0; x < width; x++) {
    let windowSum = 0;
    const initEnd = Math.min(height - 1, ry);
    for (let y = 0; y <= initEnd; y++) {
      if (horiz[y * width + x] !== 0) windowSum++;
    }
    for (let y = 0; y < height; y++) {
      if (windowSum > 0) {
        dilated[y * width + x] = 1;
      }
      const outY = y - ry;
      if (outY >= 0 && horiz[outY * width + x] !== 0) {
        windowSum--;
      }
      const inY = y + ry + 1;
      if (inY < height && horiz[inY * width + x] !== 0) {
        windowSum++;
      }
    }
  }

  // --- Step 2: 8-connected Union-Find labeling -----------------------------
  const labels = new Int32Array(total);
  const parent: number[] = [0]; // 1-indexed labels

  function find(i: number): number {
    let root = i;
    while (parent[root] !== root) {
      root = parent[root];
    }
    let curr = i;
    while (curr !== root) {
      const nxt = parent[curr];
      parent[curr] = root;
      curr = nxt;
    }
    return root;
  }

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      if (ra < rb) {
        parent[rb] = ra;
      } else {
        parent[ra] = rb;
      }
    }
  }

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    const prevRowOffset = (y - 1) * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      if (dilated[idx] === 0) continue;

      let minLabel = 0;
      const n0 = x > 0 ? labels[idx - 1] : 0;
      const n1 = y > 0 && x > 0 ? labels[prevRowOffset + x - 1] : 0;
      const n2 = y > 0 ? labels[prevRowOffset + x] : 0;
      const n3 = y > 0 && x + 1 < width ? labels[prevRowOffset + x + 1] : 0;

      if (n0 > 0) minLabel = find(n0);
      if (n1 > 0) {
        const r1 = find(n1);
        minLabel = minLabel === 0 ? r1 : Math.min(minLabel, r1);
      }
      if (n2 > 0) {
        const r2 = find(n2);
        minLabel = minLabel === 0 ? r2 : Math.min(minLabel, r2);
      }
      if (n3 > 0) {
        const r3 = find(n3);
        minLabel = minLabel === 0 ? r3 : Math.min(minLabel, r3);
      }

      if (minLabel === 0) {
        const newLabel = parent.length;
        parent.push(newLabel);
        labels[idx] = newLabel;
      } else {
        labels[idx] = minLabel;
        if (n0 > 0) union(minLabel, n0);
        if (n1 > 0) union(minLabel, n1);
        if (n2 > 0) union(minLabel, n2);
        if (n3 > 0) union(minLabel, n3);
      }
    }
  }

  // --- Step 3: Accumulate tight raw-diff bounding boxes & perimeter --------
  const accumMap = new Map<number, RawClusterAccum>();

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      if (diffMask[idx] === 0) continue;

      const root = find(labels[idx]);
      if (root === 0) continue;

      // A raw diff pixel is on the perimeter if any 4-connected neighbor is 0 or out-of-bounds
      const isPerimeter =
        x === 0 ||
        x === width - 1 ||
        y === 0 ||
        y === height - 1 ||
        diffMask[idx - 1] === 0 ||
        diffMask[idx + 1] === 0 ||
        diffMask[idx - width] === 0 ||
        diffMask[idx + width] === 0;

      let acc = accumMap.get(root);
      if (!acc) {
        acc = {
          minX: x,
          minY: y,
          maxX: x,
          maxY: y,
          rawDiffPixels: 0,
          perimeterPixels: 0,
        };
        accumMap.set(root, acc);
      } else {
        if (x < acc.minX) acc.minX = x;
        if (y < acc.minY) acc.minY = y;
        if (x > acc.maxX) acc.maxX = x;
        if (y > acc.maxY) acc.maxY = y;
      }
      acc.rawDiffPixels++;
      if (isPerimeter) acc.perimeterPixels++;
    }
  }

  // Filter out micro-specks before proximity merging so isolated noise specks don't bridge clusters
  let list = Array.from(accumMap.values()).filter(
    (c) => c.rawDiffPixels >= minPixels,
  );

  // --- Step 4: Iterative AABB proximity merging ----------------------------
  let merged = true;
  while (merged && list.length > 1) {
    merged = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const overlapsX =
          a.minX - mergeMargin <= b.maxX && a.maxX + mergeMargin >= b.minX;
        const overlapsY =
          a.minY - mergeMargin <= b.maxY && a.maxY + mergeMargin >= b.minY;

        if (overlapsX && overlapsY) {
          a.minX = Math.min(a.minX, b.minX);
          a.minY = Math.min(a.minY, b.minY);
          a.maxX = Math.max(a.maxX, b.maxX);
          a.maxY = Math.max(a.maxY, b.maxY);
          a.rawDiffPixels += b.rawDiffPixels;
          a.perimeterPixels += b.perimeterPixels;
          list.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }

  // Sort by rawDiffPixels descending (deterministic tie-breaker by minY, minX)
  list.sort((a, b) => {
    if (b.rawDiffPixels !== a.rawDiffPixels) {
      return b.rawDiffPixels - a.rawDiffPixels;
    }
    if (a.minY !== b.minY) return a.minY - b.minY;
    return a.minX - b.minX;
  });

  if (list.length > maxClusters) {
    list = list.slice(0, maxClusters);
  }

  return list.map((acc, idx) => {
    const bw = acc.maxX - acc.minX + 1;
    const bh = acc.maxY - acc.minY + 1;
    const area = bw * bh;
    return {
      id: idx + 1,
      bbox: {
        x: acc.minX,
        y: acc.minY,
        width: bw,
        height: bh,
      },
      rawDiffPixels: acc.rawDiffPixels,
      density: area > 0 ? Math.min(1, acc.rawDiffPixels / area) : 0,
      perimeterRatio:
        acc.rawDiffPixels > 0
          ? Math.min(1, acc.perimeterPixels / acc.rawDiffPixels)
          : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// 3-Panel Native-Resolution Comparison Strip Cropping
// ---------------------------------------------------------------------------

/**
 * Crop a native-resolution 3-panel horizontal comparison strip `[Baseline | Current | Diff]`
 * around a bounding box with configurable contextual padding.
 *
 * @param baselinePng - Decoded baseline PNG
 * @param currentPng  - Decoded current PNG
 * @param diffPng     - Decoded diff PNG
 * @param bbox        - Target cluster bounding box
 * @param padding     - Contextual padding in pixels around `bbox` (default: 48)
 * @returns Encoded PNG buffer containing the 3-panel horizontal comparison strip
 */
export function cropClusterComparisonStrip(
  baselinePng: PNG,
  currentPng: PNG,
  diffPng: PNG,
  bbox: BoundingBox,
  padding = 48,
): Buffer {
  const pad = Math.max(0, Math.floor(padding));
  const imgW = Math.min(baselinePng.width, currentPng.width, diffPng.width);
  const imgH = Math.min(baselinePng.height, currentPng.height, diffPng.height);

  const x0 = Math.max(0, Math.min(imgW - 1, Math.floor(bbox.x - pad)));
  const y0 = Math.max(0, Math.min(imgH - 1, Math.floor(bbox.y - pad)));
  const x1 = Math.max(x0 + 1, Math.min(imgW, Math.ceil(bbox.x + bbox.width + pad)));
  const y1 = Math.max(y0 + 1, Math.min(imgH, Math.ceil(bbox.y + bbox.height + pad)));

  const cropW = x1 - x0;
  const cropH = y1 - y0;

  const strip = new PNG({ width: cropW * 3, height: cropH });
  const panels = [baselinePng, currentPng, diffPng];

  for (let p = 0; p < 3; p++) {
    const src = panels[p];
    const destOffsetX = p * cropW;
    for (let dy = 0; dy < cropH; dy++) {
      const srcY = y0 + dy;
      for (let dx = 0; dx < cropW; dx++) {
        const srcX = x0 + dx;
        const srcIdx = (srcY * src.width + srcX) << 2;
        const dstIdx = (dy * strip.width + (destOffsetX + dx)) << 2;
        strip.data[dstIdx] = src.data[srcIdx];
        strip.data[dstIdx + 1] = src.data[srcIdx + 1];
        strip.data[dstIdx + 2] = src.data[srcIdx + 2];
        strip.data[dstIdx + 3] = src.data[srcIdx + 3];
      }
    }
  }

  return PNG.sync.write(strip);
}

// ---------------------------------------------------------------------------
// Set-of-Mark (SoM) Bounding Box & Numeric Badge Overlay
// ---------------------------------------------------------------------------

/** 3×5 bitmap font for digits 0–9. */
const DIGIT_FONT_3X5: Record<string, number[]> = {
  '0': [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1],
  '1': [0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1],
  '2': [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1],
  '3': [1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1],
  '4': [1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1],
  '5': [1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1],
  '6': [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1],
  '7': [1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
  '8': [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1],
  '9': [1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1],
};

function setPixelSafe(
  png: PNG,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  if (x < 0 || x >= png.width || y < 0 || y >= png.height) return;
  const idx = (y * png.width + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

/**
 * Draw high-contrast Set-of-Mark (SoM) bounding box outlines and numeric
 * marker badges directly onto a PNG image in place.
 *
 * @param png   - Target PNG image to annotate in place
 * @param boxes - Array of `{ id, bbox }` markers to draw
 */
export function drawSetOfMarkBoxes(
  png: PNG,
  boxes: Array<{ id: number; bbox: BoundingBox }>,
): void {
  // High-contrast magenta-red border and badge background with white text
  const borderR = 255;
  const borderG = 0;
  const borderB = 85;

  for (const { id, bbox } of boxes) {
    const x0 = Math.max(0, Math.min(png.width - 1, Math.floor(bbox.x)));
    const y0 = Math.max(0, Math.min(png.height - 1, Math.floor(bbox.y)));
    const x1 = Math.max(x0, Math.min(png.width - 1, Math.floor(bbox.x + bbox.width - 1)));
    const y1 = Math.max(y0, Math.min(png.height - 1, Math.floor(bbox.y + bbox.height - 1)));

    // 2px thick bounding box outline
    for (let t = 0; t < 2; t++) {
      const topY = Math.max(0, y0 - t);
      const botY = Math.min(png.height - 1, y1 + t);
      const leftX = Math.max(0, x0 - t);
      const rightX = Math.min(png.width - 1, x1 + t);

      for (let x = leftX; x <= rightX; x++) {
        setPixelSafe(png, x, topY, borderR, borderG, borderB);
        setPixelSafe(png, x, botY, borderR, borderG, borderB);
      }
      for (let y = topY; y <= botY; y++) {
        setPixelSafe(png, leftX, y, borderR, borderG, borderB);
        setPixelSafe(png, rightX, y, borderR, borderG, borderB);
      }
    }

    // Numeric marker badge at top-left of bbox
    const label = String(Math.max(0, Math.floor(id)));
    const charW = 3;
    const charH = 5;
    const pad = 2;
    const badgeW = label.length * (charW + 1) - 1 + pad * 2;
    const badgeH = charH + pad * 2;

    const bx0 = Math.max(0, Math.min(png.width - badgeW, x0));
    const by0 = Math.max(0, Math.min(png.height - badgeH, y0 >= badgeH ? y0 - badgeH : y0));

    for (let dy = 0; dy < badgeH; dy++) {
      for (let dx = 0; dx < badgeW; dx++) {
        setPixelSafe(png, bx0 + dx, by0 + dy, borderR, borderG, borderB);
      }
    }

    // Render digits in white
    for (let c = 0; c < label.length; c++) {
      const glyph = DIGIT_FONT_3X5[label[c]] ?? DIGIT_FONT_3X5['0'];
      const gx0 = bx0 + pad + c * (charW + 1);
      const gy0 = by0 + pad;
      for (let gy = 0; gy < charH; gy++) {
        for (let gx = 0; gx < charW; gx++) {
          if (glyph[gy * charW + gx]) {
            setPixelSafe(png, gx0 + gx, gy0 + gy, 255, 255, 255);
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// DOM-Aware Spatial Cluster Attribution
// ---------------------------------------------------------------------------

const GENERIC_ROOT_TAGS = new Set(['html', 'body', 'main']);
const GENERIC_ROOT_SELECTORS = new Set([
  'html',
  'body',
  'main',
  '#root',
  '#app',
  '#__next',
  'div#root',
  'div#app',
  'div#__next',
]);

function isGenericRootElement(el: DOMElementBox): boolean {
  const tag = el.tagName?.toLowerCase() ?? '';
  const sel = el.selector?.toLowerCase() ?? '';
  return GENERIC_ROOT_TAGS.has(tag) || GENERIC_ROOT_SELECTORS.has(sel);
}

/**
 * Attribute spatial diff clusters to overlapping DOM element bounding boxes.
 *
 * Computes AABB intersection, cluster coverage (`intersectionArea / clusterArea`),
 * and Intersection-over-Union (`intersectionArea / unionArea`). Penalizes generic
 * root wrappers (`html`, `body`, `main`, `#root`, `#app`, `#__next`) so specific
 * descendant components win attribution.
 *
 * @param clusters      - Extracted diff clusters to annotate
 * @param domElements   - Visible DOM element bounding boxes from the page
 * @param maxPerCluster - Maximum overlapping DOM elements to retain per cluster (default: 3)
 * @returns The annotated `clusters` array (mutated in place and returned)
 */
export function attributeClustersToDom(
  clusters: DiffCluster[],
  domElements?: DOMElementBox[],
  maxPerCluster = 3,
): DiffCluster[] {
  if (!domElements || domElements.length === 0 || clusters.length === 0) {
    return clusters;
  }

  const limit = Math.max(1, Math.floor(maxPerCluster));

  for (const cluster of clusters) {
    const cb = cluster.bbox;
    const clusterArea = Math.max(1, cb.width * cb.height);
    const scored: Array<{
      element: ClusteredDOMElement;
      score: number;
      elArea: number;
    }> = [];

    for (const el of domElements) {
      const eb = el.bbox;
      if (!eb || eb.width <= 0 || eb.height <= 0) continue;

      const ix0 = Math.max(cb.x, eb.x);
      const iy0 = Math.max(cb.y, eb.y);
      const ix1 = Math.min(cb.x + cb.width, eb.x + eb.width);
      const iy1 = Math.min(cb.y + cb.height, eb.y + eb.height);

      const iw = ix1 - ix0;
      const ih = iy1 - iy0;
      if (iw <= 0 || ih <= 0) continue;

      const intersectionArea = iw * ih;
      const elArea = Math.max(1, eb.width * eb.height);
      const unionArea = Math.max(1, clusterArea + elArea - intersectionArea);

      const coverage = Math.min(1, intersectionArea / clusterArea);
      const iou = Math.min(1, intersectionArea / unionArea);

      let score = coverage * 0.55 + iou * 0.45;
      if (isGenericRootElement(el)) {
        score *= 0.25;
      }

      scored.push({
        element: {
          ...el,
          iou: Number(iou.toFixed(4)),
          coverage: Number(coverage.toFixed(4)),
        },
        score,
        elArea,
      });
    }

    if (scored.length > 0) {
      scored.sort((a, b) => {
        if (Math.abs(b.score - a.score) > 1e-6) {
          return b.score - a.score;
        }
        if (Math.abs(b.element.iou - a.element.iou) > 1e-6) {
          return b.element.iou - a.element.iou;
        }
        return a.elArea - b.elArea;
      });

      const affectedElements = scored.slice(0, limit).map((s) => s.element);
      cluster.affectedElements = affectedElements;
      cluster.targetSelector = affectedElements[0]?.selector;
    }
  }

  return clusters;
}

