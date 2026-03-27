/**
 * Core type definitions for Frontguard visual regression testing.
 *
 * All interfaces, types, and contracts used across the pipeline are
 * defined and exported from this single module.
 *
 * @module core/types
 */

import type { FrontguardPlugin } from './plugins.js';

// ---------------------------------------------------------------------------
// Scalar Types
// ---------------------------------------------------------------------------

/** Browser engine supported by Playwright. */
export type BrowserEngine = 'chromium' | 'firefox' | 'webkit';

/** Severity of a visual regression. */
export type Severity = 'critical' | 'warning' | 'info';

/** Status of a diff comparison. */
export type DiffStatus = 'pass' | 'changed' | 'regression' | 'new' | 'error' | 'flaky';

/** AI classification of a visual change. */
export type ChangeClassification = 'regression' | 'intentional' | 'content_update';

/** Pipeline stage identifier for progress reporting. */
export type PipelineStage =
  | 'init'
  | 'discover'
  | 'filter'
  | 'render'
  | 'compare'
  | 'analyze'
  | 'report';

// ---------------------------------------------------------------------------
// Configuration Interfaces
// ---------------------------------------------------------------------------

/**
 * Options controlling automatic route discovery via crawling.
 *
 * Used when `FrontguardConfig.discover` is set instead of (or alongside)
 * an explicit `routes` list.
 */
export interface DiscoverOptions {
  /** Starting URL for the crawler (e.g. the homepage). */
  startUrl: string;
  /** Maximum link depth to follow from the start URL. */
  maxDepth: number;
  /** Maximum number of routes to discover before stopping. */
  maxRoutes: number;
  /** URL patterns (globs or regex strings) to exclude from crawling. */
  exclude: string[];
}

/**
 * AI provider configuration (Bring Your Own Key).
 *
 * API keys should be supplied via environment variables
 * (`FRONTGUARD_OPENAI_KEY` / `FRONTGUARD_ANTHROPIC_KEY`), **not**
 * hard-coded in the config file.
 */
export interface AIConfig {
  /** AI provider to use for diff analysis. */
  provider: 'openai' | 'anthropic';
  /** Model identifier (e.g. `'gpt-4o'`, `'claude-sonnet-4-20250514'`). */
  model: string;
}

/**
 * Rule describing a DOM region to ignore during visual comparison.
 *
 * Useful for masking dynamic content (ads, timestamps, avatars) that
 * would otherwise cause false-positive regressions.
 */
export interface IgnoreRule {
  /** CSS selector matching elements to mask/ignore. */
  selector: string;
  /** Optional human-readable description of why this rule exists. */
  description?: string;
}

/**
 * Authentication configuration for accessing protected pages.
 *
 * Leverages Playwright's storage-state mechanism to inject cookies,
 * localStorage, and session data.
 */
export interface AuthConfig {
  /** Path to a Playwright storage-state JSON file. */
  storageState?: string;
}

/**
 * Main Frontguard configuration.
 *
 * Validated at load time via a Zod schema defined in `config.ts`.
 * All numeric viewport values represent widths in pixels; height is
 * determined at capture time by the page content (up to `maxHeight`).
 */
export interface FrontguardConfig {
  /** Config schema version (currently `1`). */
  version: number;
  /** Base URL of the application under test (e.g. `'http://localhost:3000'`). */
  baseUrl: string;
  /** Explicit list of route paths to test (e.g. `['/', '/about']`). */
  routes?: string[];
  /** Auto-discovery configuration — mutually usable with `routes`. */
  discover?: DiscoverOptions;
  /** Viewport widths (in px) to capture at (default `[375, 768, 1440]`). */
  viewports: number[];
  /** Browser engines to test with (default `['chromium']`). */
  browsers: BrowserEngine[];
  /** Pixel-diff threshold `0–1` — fraction of changed pixels to flag (default `0.1`). */
  threshold: number;
  /** Optional AI analysis configuration. */
  ai?: AIConfig;
  /** CSS-selector ignore rules applied globally to every route. */
  ignore: IgnoreRule[];
  /** Authentication configuration for protected routes. */
  auth?: AuthConfig;
  /** Enable smart rendering — waits for animations, fonts, lazy images (default `true`). */
  smartRender: boolean;
  /** Number of parallel browser workers (default `4`). */
  workers: number;
  /** Page navigation timeout in milliseconds (default `30 000`). */
  pageTimeout: number;
  /** Maximum screenshot height in pixels (default `5 000`). */
  maxHeight: number;
  /** Output directory for the HTML report and diff artefacts. */
  outputDir: string;
  /** Viewport height in pixels (default `720`). */
  viewportHeight?: number;
  /** Plugins to register for the pipeline run. */
  plugins?: FrontguardPlugin[];
}

// ---------------------------------------------------------------------------
// Runtime Data Interfaces
// ---------------------------------------------------------------------------

/**
 * A single discovered or configured route.
 *
 * Carries metadata about *how* it was found so the pipeline can
 * prioritise and de-duplicate routes from multiple sources.
 */
export interface Route {
  /** URL path relative to `baseUrl` (e.g. `'/about'`, `'/dashboard'`). */
  path: string;
  /** Optional human-readable label for reports. */
  label?: string;
  /** Whether this route requires authentication. */
  auth?: boolean;
  /** How this route was discovered. */
  discoveredVia?: 'crawl' | 'filesystem' | 'config' | 'sitemap';
}

/**
 * Result of capturing a single screenshot.
 *
 * Contains the raw image buffer, DOM snapshot, and timing data needed
 * by downstream comparison and analysis stages.
 */
export interface ScreenshotResult {
  /** The route that was captured. */
  route: Route;
  /** Viewport width (in px) used for the capture. */
  viewport: number;
  /** Browser engine used for the capture. */
  browser: BrowserEngine;
  /** Raw PNG image data. */
  buffer: Buffer;
  /** Full-page DOM snapshot (serialised HTML). */
  domSnapshot: string;
  /** Console errors captured during page load. */
  consoleErrors: string[];
  /** UNIX epoch timestamp (ms) when capture completed. */
  timestamp: number;
  /** Capture duration in milliseconds. */
  duration: number;
}

/**
 * Result of comparing a screenshot against its baseline.
 *
 * Contains pixel-level diff data plus optional AI analysis.
 */
export interface DiffResult {
  /** The route that was compared. */
  route: Route;
  /** Viewport width used for this comparison. */
  viewport: number;
  /** Browser engine used for this comparison. */
  browser: BrowserEngine;
  /** Overall comparison status. */
  status: DiffStatus;
  /** Percentage of pixels that differ (`0–100`). */
  diffPercentage: number;
  /** PNG image highlighting pixel-level differences. */
  diffImage?: Buffer;
  /** The baseline image used for comparison. */
  baselineImage?: Buffer;
  /** The current (new) screenshot image. */
  currentImage?: Buffer;
  /** AI-powered analysis of the visual change, if available. */
  aiAnalysis?: AIAnalysis;
  /** Error message when `status` is `'error'`. */
  error?: string;
}

/**
 * AI-powered analysis of a visual diff.
 *
 * Produced by sending baseline + current screenshots to an LLM
 * with a structured prompt.
 */
export interface AIAnalysis {
  /** AI's classification of the change. */
  classification: ChangeClassification;
  /** Human-readable explanation of what changed and why. */
  explanation: string;
  /** Severity assessment of the detected change. */
  severity: Severity;
  /** Confidence score (`0–1`) in the classification. */
  confidence: number;
  /** Suggested fix or action to resolve the regression. */
  suggestedFix?: string;
  /** Raw LLM response for debugging / audit. */
  rawResponse?: string;
}

// ---------------------------------------------------------------------------
// Run Result Interfaces
// ---------------------------------------------------------------------------

/**
 * Timing breakdown of a complete pipeline run.
 *
 * All values are in milliseconds.
 */
export interface RunTiming {
  /** Time spent discovering routes. */
  discovery: number;
  /** Time spent rendering screenshots. */
  render: number;
  /** Time spent running pixel comparisons. */
  compare: number;
  /** Time spent on AI analysis. */
  ai: number;
  /** Total wall-clock time for the entire run. */
  total: number;
}

/**
 * Complete result of a Frontguard pipeline run.
 *
 * Includes aggregate summary, per-route diffs, timing, and the config
 * that was used so reports can reproduce the run.
 */
export interface RunResult {
  /** Aggregate summary counts. */
  summary: {
    /** Total number of route × viewport × browser combinations tested. */
    total: number;
    /** Combinations that passed (within threshold). */
    passed: number;
    /** Combinations flagged as regressions. */
    regressions: number;
    /** Combinations that changed but below regression threshold. */
    warnings: number;
    /** Routes with no existing baseline (first capture). */
    newPages: number;
    /** Combinations that errored during capture or comparison. */
    errors: number;
  };
  /** Per-combination diff results. */
  diffs: DiffResult[];
  /** Timing breakdown of the run. */
  timing: RunTiming;
  /** Configuration used for this run. */
  config: FrontguardConfig;
}

// ---------------------------------------------------------------------------
// Baseline Interfaces
// ---------------------------------------------------------------------------

/**
 * Manifest tracking all stored baselines.
 *
 * Persisted in the Git orphan branch (`frontguard-baselines`) alongside
 * the PNG baseline images.
 */
export interface BaselineManifest {
  /** Schema version for forward-compatible manifest evolution. */
  schemaVersion: number;
  /** Frontguard version string that created this manifest. */
  createdBy: string;
  /** ISO-8601 timestamp of the last manifest update. */
  updatedAt: string;
  /** Route-keyed map of baseline metadata. */
  routes: Record<string, BaselineRouteInfo>;
}

/**
 * Metadata about a single route's baseline images.
 */
export interface BaselineRouteInfo {
  /** Viewport widths that have baselines stored. */
  viewports: number[];
  /** Browser engines that have baselines stored. */
  browsers: BrowserEngine[];
  /** ISO-8601 timestamp of the last baseline update for this route. */
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Contract Interfaces (Reporters & Storage)
// ---------------------------------------------------------------------------

/**
 * Reporter interface — all output reporters implement this contract.
 *
 * Reporters receive lifecycle callbacks throughout the pipeline and are
 * responsible for presenting progress and final results to the user
 * (terminal, HTML file, CI comment, etc.).
 */
export interface Reporter {
  /** Called when a pipeline stage begins. */
  onStageStart(stage: PipelineStage, detail?: string): void;
  /** Called periodically during a stage with progress numbers. */
  onStageProgress(stage: PipelineStage, current: number, total: number, detail?: string): void;
  /** Called when a pipeline stage completes successfully. */
  onStageComplete(stage: PipelineStage, detail?: string): void;
  /** Called once after the entire pipeline finishes. */
  onComplete(result: RunResult): void;
  /** Called on a fatal, unrecoverable pipeline error. */
  onError(error: Error): void;
}

/**
 * Baseline storage interface.
 *
 * Abstracts where baseline images live — could be a Git orphan branch,
 * a local directory, or a remote object store.
 */
export interface BaselineStorage {
  /** Initialise the storage backend (create dirs, checkout branch, etc.). */
  init(): Promise<void>;
  /** Read a baseline image. Returns `null` if no baseline exists yet. */
  readBaseline(route: string, viewport: number, browser: BrowserEngine): Promise<Buffer | null>;
  /** Write (or overwrite) a baseline image. */
  writeBaseline(route: string, viewport: number, browser: BrowserEngine, buffer: Buffer): Promise<void>;
  /** Read the baseline manifest. Returns `null` if none exists. */
  readManifest(): Promise<BaselineManifest | null>;
  /** Write (or overwrite) the baseline manifest. */
  writeManifest(manifest: BaselineManifest): Promise<void>;
  /** Check whether any baselines have been stored yet. */
  hasBaselines(): Promise<boolean>;
}
