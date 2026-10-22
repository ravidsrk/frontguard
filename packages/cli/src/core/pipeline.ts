/**
 * Published entry for the Frontguard pipeline.
 *
 * Stages live in sibling modules. This file keeps the public re-exports that
 * the library bundle must still ship.
 *
 * @module core/pipeline
 */

export { defineConfig, DEFAULT_AI_MODELS } from './config.js';
export type { UserFrontguardConfig } from './config.js';
export type * from './types.js';
export type { PluginContext, FrontguardPlugin } from './plugins.js';
export {
  extractDiffClusters,
  attributeClustersToDom,
  cropClusterComparisonStrip,
  drawSetOfMarkBoxes,
  type ClusterExtractionOptions,
} from '../diff/regions.js';
export { extractDomElementBoxes } from '../render/dom-elements.js';
export {
  computeSSIM,
  computeChromaSSIM,
  computeRegionSimilarity,
  type RegionSimilarityMetrics,
} from '../diff/ssim.js';
export {
  captureStableScreenshot,
  compareConsecutiveFrames,
  type StabilityOptions,
  type StabilityResult,
  type FrameConvergenceComparison,
} from '../render/stability.js';
export {
  DEFAULT_SENSITIVE_SELECTORS,
  resolveRedactSelectors,
  redactSensitiveDomHtml,
} from '../render/redaction.js';
export { UnreachableBaseUrlError, isUnreachableHostError } from './pipeline-errors.js';
export { toRouteObjects, resolveThreshold } from './pipeline-discover.js';
export { runPipeline } from './pipeline-run.js';
export { updateBaselines } from './pipeline-update.js';
export { runJudgePipeline } from './pipeline-judge.js';
