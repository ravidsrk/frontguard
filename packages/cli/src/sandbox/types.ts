/**
 * Sandbox abstraction for fix verification.
 *
 * A sandbox lets Frontguard apply a generated CSS/HTML patch to a page,
 * re-render it, and screenshot the result — so a fix can be *verified* before
 * it's presented to the developer. Two implementations exist:
 *
 * - `LocalSandbox`   — uses local Playwright + CSS injection (no external deps)
 * - `DaytonaSandbox` — runs in a remote Daytona sandbox (opt-in, cost-aware)
 *
 * @module sandbox/types
 */

import type { BrowserEngine } from '../core/types.js';

/** A patch to apply before re-rendering. */
export interface SandboxPatch {
  /** Patch kind. CSS is injected as a stylesheet; others are advisory. */
  type: 'css' | 'html' | 'config';
  /** The patch contents. */
  content: string;
}

/** Parameters for a sandbox screenshot. */
export interface SandboxScreenshotParams {
  /** Absolute URL to render. */
  url: string;
  /** Viewport width in px. */
  viewport: number;
  /** Browser engine. */
  browser: BrowserEngine;
  /** Optional viewport height (defaults to 720). */
  viewportHeight?: number;
}

/**
 * Sandbox contract. Implementations must guarantee cleanup of any resources
 * in {@link destroy}, even after errors.
 */
export interface Sandbox {
  /** Create / boot the sandbox. */
  create(): Promise<void>;
  /** Stage a patch to be applied on the next screenshot. */
  applyPatch(patch: SandboxPatch): Promise<void>;
  /** Render a URL with all staged patches applied and return the PNG buffer. */
  screenshot(params: SandboxScreenshotParams): Promise<Buffer>;
  /** Tear down the sandbox and free all resources. */
  destroy(): Promise<void>;
}
