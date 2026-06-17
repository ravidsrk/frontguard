export interface Run {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  url: string;
  routes: Array<{ path: string }>;
  viewports: number[];
  browsers: string[];
  threshold: number;
  ai: { provider: string; model: string } | null;
  createdAt: string;
  completedAt?: string;
  duration?: number;
  results: RunResult[] | null;
  reportUrl: string | null;
  reportHtml?: string;
  baselinesApproved?: boolean;
  projectId?: string;
  error?: string;
  /** CI linkage forwarded by the GitHub/Vercel integrations (Tasks 7.1/7.2). */
  github?: {
    owner: string;
    repo: string;
    prNumber?: number;
    commitSha?: string;
  };
  checkRunId?: number;
  installationId?: number;
}

/**
 * An AI-generated fix for a single visual regression.
 *
 * Mirrors the shape the CLI's JSON reporter emits
 * (`packages/cli/src/report/json.ts`) so it survives the
 * sandbox → processor → D1 → MCP round-trip unchanged. The MCP
 * `get_suggested_fix` tool returns this object verbatim.
 */
export interface SuggestedFix {
  /** Whether the fix is CSS, HTML, or config. */
  fixType: string;
  /** Fine-grained category for pattern matching and reporting. */
  category: string;
  /** The minimal patch (e.g. a CSS snippet), not a full file. */
  patch: string;
  /** Confidence the fix resolves the regression (0–1). */
  confidence: number;
  /** Human-readable explanation of what the fix does and why. */
  explanation: string;
  /** Optional CSS selector or file hint the patch targets. */
  target?: string;
}

export interface RunResult {
  route: string;
  viewport: number;
  status: string;
  diffPercentage: number;
  classification?: string;
  timestamp: string;
  /** AI-generated fix for this diff, when an `ai` provider produced one. */
  suggestedFix?: SuggestedFix;
}
