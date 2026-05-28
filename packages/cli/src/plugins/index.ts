/**
 * Plugin entry point — re-exports core plugin types, manager, and all built-in plugins.
 *
 * @module plugins
 */

// Re-export plugin types and manager
export type { FrontguardPlugin, PluginContext } from '../core/plugins.js';
export { PluginManager } from '../core/plugins.js';

// Figma design compliance plugin
export { createFigmaPlugin, fetchFigmaImage } from './figma.js';
export type { FigmaConfig } from './figma.js';

// Production monitoring plugin
export {
  createMonitorPlugin,
  sendWebhookAlert,
  urlToSlug,
} from './monitor.js';
export type {
  MonitorConfig,
  AlertEntry,
  AlertPayload,
  HistoryEntry,
} from './monitor.js';

// Performance budgets plugin
export {
  createPerfBudgetPlugin,
  checkBudgets,
  extractMetricsFromSnapshot,
  PERF_COLLECTION_SCRIPT,
} from './perf-budgets.js';
export type {
  PerfBudgetConfig,
  PerfMetrics,
  BudgetCheckResult,
  BudgetViolation,
} from './perf-budgets.js';
// Accessibility audit plugin (axe-core)
export {
  createAccessibilityPlugin,
  parseAxeResults,
  meetsImpactThreshold,
  normalizeImpact,
  countFailingViolations,
  ACCESSIBILITY_RESULTS_KEY,
} from './accessibility.js';
export type {
  AccessibilityConfig,
  RawAxeResults,
} from './accessibility.js';
