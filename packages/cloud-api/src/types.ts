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

export interface RunResult {
  route: string;
  viewport: number;
  status: string;
  diffPercentage: number;
  classification?: string;
  timestamp: string;
}
