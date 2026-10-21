export interface PlaywrightDiffCluster {
  id: number;
  bbox: { x: number; y: number; width: number; height: number };
  rawDiffPixels: number;
  targetSelector?: string;
}

export interface VisualTestOptions {
  /** Max pixel diff as fraction 0-1 (default: 0.01 = 1%) */
  threshold?: number;
  /** Screenshot options passed to Playwright */
  fullPage?: boolean;
  /** Mask elements by CSS selector before screenshot */
  mask?: string[];
  /** Mask regions by coordinates */
  maskRegions?: Array<{ x: number; y: number; width: number; height: number }>;
  /** Enable AI analysis of visual diffs */
  ai?: boolean | { provider: 'openai' | 'anthropic' | 'gemini'; model?: string; baseUrl?: string };
  /** Freeze Date.now() during screenshot (boolean, epoch ms, or ISO date string) */
  freezeTime?: boolean | number | string;
  /** Seed Math.random() with a deterministic Mulberry32 PRNG before capture */
  seedRandom?: boolean | number;
  /** Block matching network URLs (e.g. analytics, ads) during capture */
  blockUrls?: string[];
  /** Capture a Playwright ARIA / accessibility tree snapshot alongside the visual test */
  captureAriaSnapshot?: boolean;
  /**
   * Optional JSON or Markdown text stored beside the PNG. A mismatch is
   * reported and does not change `passed`.
   */
  textSnapshot?: { json?: string; markdown?: string };
  /** Custom baseline directory (default: __visual_baselines__) */
  baselineDir?: string;
  /** Update baselines instead of comparing */
  update?: boolean;
  /** Optional CSS selector to capture a single element/component bounding box instead of the full page */
  selector?: string;
  /** Automatically redact password, payment, and [data-frontguard-redact] inputs during capture */
  redactSensitive?: boolean | string[];
  /** Wait for two consecutive frames to converge before capturing */
  waitForStable?: boolean | { maxAttempts?: number; intervalMs?: number };
}

export interface VisualTestResult {
  passed: boolean;
  diffPercentage: number;
  /** Largest differing-pixel count in any 16×16 window. */
  windowMax?: number;
  baselinePath: string;
  currentPath: string;
  diffPath?: string;
  ai?: {
    classification: string;
    severity: string;
    explanation: string;
  };
  ssim?: number;
  isNewBaseline: boolean;
  settled?: boolean;
  clusters?: PlaywrightDiffCluster[];
  blockedRequestsCount?: number;
  ariaSnapshot?: string;
  /** Text files beside the PNG. They do not change `passed`. */
  textSnapshots?: TextSnapshotDiff[];
}

export type TextSnapshotKind = 'aria' | 'json' | 'markdown';

export interface TextSnapshotDiff {
  kind: TextSnapshotKind;
  status: 'match' | 'mismatch' | 'new' | 'error';
  path: string;
  /** Short mismatch preview. Absent unless status is mismatch. */
  excerpt?: string;
}

export interface CompareResult {
  passed: boolean;
  diffPercentage: number;
  /** Largest differing-pixel count in any 16×16 window. Above 64 fails. */
  windowMax: number;
  diffBuffer: Buffer | null;
  ssim: number;
  clusters?: PlaywrightDiffCluster[];
}

export type DiffOutput = CompareResult;

export interface AIAnalysisResult {
  classification: string;
  severity: string;
  explanation: string;
}
