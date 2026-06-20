/**
 * JSON reporter for Frontguard.
 *
 * Outputs the full RunResult as formatted JSON to stdout.
 * Useful for CI pipelines, scripting, and machine consumption.
 * Image buffers are excluded from output to keep it manageable.
 *
 * @module report/json
 */

import type { Reporter, PipelineStage, RunResult, DiffResult } from '../core/types.js';

// ---------------------------------------------------------------------------
// JSON Reporter
// ---------------------------------------------------------------------------

export class JSONReporter implements Reporter {
  /** Silently track stages — no console output during pipeline */
  onStageStart(_stage: PipelineStage, _detail?: string): void {
    // No-op: JSON reporter is silent during execution
  }

  onStageProgress(_stage: PipelineStage, _current: number, _total: number, _detail?: string): void {
    // No-op
  }

  onStageComplete(_stage: PipelineStage, _detail?: string): void {
    // No-op
  }

  onError(error: Error): void {
    const output = {
      error: true,
      message: error.message,
      stack: error.stack,
    };
    console.log(JSON.stringify(output, null, 2));
  }

  onComplete(result: RunResult): void {
    const output = serializeRunResult(result);
    console.log(JSON.stringify(output, null, 2));
  }
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

interface SerializedDiff {
  route: string;
  label?: string;
  viewport: number;
  browser: string;
  status: string;
  diffPercentage: number;
  hasBaselineImage: boolean;
  hasCurrentImage: boolean;
  hasDiffImage: boolean;
  comparisonMethod?: 'byte-identical' | 'pixelmatch';
  aiAnalysis?: {
    classification: string;
    explanation: string;
    severity: string;
    confidence: number;
    suggestedFix?: string;
  };
  suggestedFix?: {
    fixType: string;
    category: string;
    patch: string;
    confidence: number;
    explanation: string;
    target?: string;
  };
  fixVerification?: {
    fixApplied: boolean;
    diffPercentage: number;
    verified: boolean;
    error?: string;
  };
  error?: string;
}

interface SerializedRunResult {
  summary: RunResult['summary'];
  timing: RunResult['timing'];
  diffs: SerializedDiff[];
  accessibility?: RunResult['accessibility'];
  perf?: RunResult['perf'];
  thirdPartyScripts?: RunResult['thirdPartyScripts'];
  config: {
    baseUrl: string;
    viewports: number[];
    browsers: string[];
    threshold: number;
    outputDir: string;
    ai?: { provider: string; model: string };
  };
}

/**
 * Serialize RunResult to a JSON-safe structure.
 * Strips Buffer fields (images) and includes only metadata.
 */
function serializeRunResult(result: RunResult): SerializedRunResult {
  return {
    summary: result.summary,
    timing: result.timing,
    diffs: result.diffs.map(serializeDiff),
    accessibility: result.accessibility,
    perf: result.perf,
    thirdPartyScripts: result.thirdPartyScripts,
    config: {
      baseUrl: result.config.baseUrl,
      viewports: result.config.viewports,
      browsers: [...result.config.browsers],
      threshold: result.config.threshold,
      outputDir: result.config.outputDir,
      ai: result.config.ai ? { provider: result.config.ai.provider, model: result.config.ai.model } : undefined,
    },
  };
}

function serializeDiff(diff: DiffResult): SerializedDiff {
  const serialized: SerializedDiff = {
    route: diff.route.path,
    label: diff.route.label,
    viewport: diff.viewport,
    browser: diff.browser,
    status: diff.status,
    diffPercentage: diff.diffPercentage,
    hasBaselineImage: diff.comparedAgainstBaseline ?? !!diff.baselineImage,
    hasCurrentImage: !!diff.currentImage,
    hasDiffImage: !!diff.diffImage,
    comparisonMethod: diff.comparisonMethod,
  };

  if (diff.aiAnalysis) {
    serialized.aiAnalysis = {
      classification: diff.aiAnalysis.classification,
      explanation: diff.aiAnalysis.explanation,
      severity: diff.aiAnalysis.severity,
      confidence: diff.aiAnalysis.confidence,
      suggestedFix: diff.aiAnalysis.suggestedFix,
    };
  }

  if (diff.suggestedFix) {
    serialized.suggestedFix = {
      fixType: diff.suggestedFix.fixType,
      category: diff.suggestedFix.category,
      patch: diff.suggestedFix.patch,
      confidence: diff.suggestedFix.confidence,
      explanation: diff.suggestedFix.explanation,
      target: diff.suggestedFix.target,
    };
  }

  if (diff.fixVerification) {
    serialized.fixVerification = {
      fixApplied: diff.fixVerification.fixApplied,
      diffPercentage: diff.fixVerification.diffPercentage,
      verified: diff.fixVerification.verified,
      error: diff.fixVerification.error,
    };
  }

  if (diff.error) {
    serialized.error = diff.error;
  }

  return serialized;
}
