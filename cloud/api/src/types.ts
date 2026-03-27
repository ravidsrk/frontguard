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
  results: RunResult[] | null;
  reportUrl: string | null;
  reportHtml?: string;
  baselinesApproved?: boolean;
  error?: string;
}

export interface RunResult {
  route: string;
  viewport: number;
  status: string;
  diffPercentage: number;
  classification?: string;
  timestamp: string;
}
