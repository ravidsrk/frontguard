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
  ai?: boolean | { provider: 'openai' | 'anthropic'; model?: string };
  /** Freeze Date.now() during screenshot */
  freezeTime?: boolean | number;
  /** Custom baseline directory (default: __visual_baselines__) */
  baselineDir?: string;
  /** Update baselines instead of comparing */
  update?: boolean;
}

export interface VisualTestResult {
  passed: boolean;
  diffPercentage: number;
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
}

export interface CompareResult {
  passed: boolean;
  diffPercentage: number;
  diffBuffer: Buffer | null;
  ssim: number;
}

export interface AIAnalysisResult {
  classification: string;
  severity: string;
  explanation: string;
}
