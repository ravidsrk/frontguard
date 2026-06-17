/**
 * Fix verification pipeline.
 *
 * Applies a {@link SuggestedFix} in a sandbox, re-renders the affected page,
 * and compares the result against the baseline. If the after-fix diff falls
 * within threshold, the fix is `verified`. Otherwise it is discarded.
 *
 * Cleanup of the sandbox is guaranteed via try/finally, even on error.
 *
 * @module sandbox/verify-fix
 */

import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import type {
  DiffResult,
  SuggestedFix,
  FixVerification,
  FrontguardConfig,
} from '../core/types.js';
import type { Sandbox } from './types.js';
import { LocalSandbox } from './local.js';
import { DaytonaSandbox } from './daytona.js';
import { logger } from '../utils/logger.js';

/** Selects a sandbox implementation. */
export function createSandbox(kind: 'local' | 'daytona'): Sandbox {
  return kind === 'daytona' ? new DaytonaSandbox() : new LocalSandbox();
}

/**
 * Computes the percentage of differing pixels between two PNG buffers.
 * Returns 100 if the images can't be compared (different sizes / decode fail).
 */
export function diffPercentageBetween(a: Buffer, b: Buffer): number {
  try {
    const imgA = PNG.sync.read(a);
    const imgB = PNG.sync.read(b);
    if (imgA.width !== imgB.width || imgA.height !== imgB.height) return 100;
    const total = imgA.width * imgA.height;
    if (total === 0) return 100;
    const diff = pixelmatch(imgA.data, imgB.data, null, imgA.width, imgA.height, {
      threshold: 0.1,
    });
    return (diff / total) * 100;
  } catch {
    return 100;
  }
}

/** Options for {@link verifyFix}. */
export interface VerifyFixOptions {
  /** Base URL of the running app (to build the route URL). */
  baseUrl: string;
  /** Sandbox kind. Defaults to `local`. */
  sandbox?: 'local' | 'daytona';
  /** Override sandbox instance (for testing). */
  sandboxImpl?: Sandbox;
}

/**
 * Verifies a suggested fix by applying it in a sandbox, re-rendering, and
 * comparing to the baseline.
 *
 * @param diff   - The regression diff (must have `baselineImage`).
 * @param fix    - The fix to verify.
 * @param config - Run config (for threshold).
 * @param opts   - Verification options.
 * @returns A {@link FixVerification} result.
 */
export async function verifyFix(
  diff: DiffResult,
  fix: SuggestedFix,
  config: FrontguardConfig,
  opts: VerifyFixOptions,
): Promise<FixVerification> {
  if (!diff.baselineImage) {
    return { fixApplied: false, diffPercentage: 100, verified: false, error: 'No baseline image to verify against.' };
  }

  const requestedKind = opts.sandbox ?? 'local';
  let sandbox = opts.sandboxImpl ?? createSandbox(requestedKind);
  const url = new URL(diff.route.path, opts.baseUrl).href;

  try {
    try {
      await sandbox.create();
    } catch (createErr) {
      // Daytona is the only sandbox that can fail at create-time for a
      // *configuration* reason (missing DAYTONA_API_KEY or SDK). Surface a
      // clear warning and fall back to the local sandbox so a missing cloud
      // credential never silently drops fix verification.
      const msg = createErr instanceof Error ? createErr.message : String(createErr);
      const isDaytonaConfig =
        requestedKind === 'daytona' &&
        !opts.sandboxImpl &&
        (msg.includes('DAYTONA_API_KEY') || msg.includes('@daytonaio/sdk'));
      if (!isDaytonaConfig) throw createErr;
      logger.warn(
        `Daytona fix verification unconfigured (${msg}). Falling back to local sandbox.`,
      );
      await sandbox.destroy().catch(() => {});
      sandbox = createSandbox('local');
      await sandbox.create();
    }
    await sandbox.applyPatch({ type: fix.fixType, content: fix.patch });

    const afterBuffer = await sandbox.screenshot({
      url,
      viewport: diff.viewport,
      browser: diff.browser,
      viewportHeight: config.viewportHeight,
      maxHeight: config.maxHeight,
    });

    const afterDiff = diffPercentageBetween(diff.baselineImage, afterBuffer);
    const threshold =
      (typeof diff.route.threshold === 'number' ? diff.route.threshold : config.threshold) * 100;
    const verified = afterDiff <= threshold;

    logger.debug(
      `Fix verification for ${diff.route.path}: after-fix diff ${afterDiff.toFixed(2)}% ` +
        `(threshold ${threshold.toFixed(2)}%) → ${verified ? 'verified' : 'rejected'}`,
    );

    return { fixApplied: true, diffPercentage: afterDiff, verified };
  } catch (err) {
    return {
      fixApplied: false,
      diffPercentage: 100,
      verified: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    // Cleanup is guaranteed — no leaked sandboxes even on crash.
    await sandbox.destroy().catch(() => {});
  }
}
