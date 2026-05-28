/**
 * Daytona sandbox for fix verification.
 *
 * Boots a remote Daytona sandbox, renders a URL with the staged CSS patch
 * injected, and returns the screenshot. The `@daytonaio/sdk` is imported
 * dynamically so it stays optional. Falls back to {@link LocalSandbox}
 * semantics if Daytona is unavailable (the caller decides).
 *
 * @module sandbox/daytona
 */

import type { Sandbox, SandboxPatch, SandboxScreenshotParams } from './types.js';
import { logger } from '../utils/logger.js';

/** Pre-baked snapshot with Playwright + Frontguard installed. */
const FRONTGUARD_SNAPSHOT = 'frontguard-playwright-v1';

/** Daytona-backed sandbox. */
export class DaytonaSandbox implements Sandbox {
  private cssPatches: string[] = [];
  private sandbox: {
    process: { executeCommand: (cmd: string) => Promise<{ result: string; exitCode: number }> };
    fs?: unknown;
  } | null = null;
  private daytona: { create: (opts: unknown) => Promise<unknown>; remove: (s: unknown) => Promise<void> } | null = null;

  async create(): Promise<void> {
    let mod: typeof import('@daytonaio/sdk');
    try {
      mod = await import('@daytonaio/sdk');
    } catch {
      throw new Error(
        'Daytona sandbox requires "@daytonaio/sdk". Install it or use the local sandbox.',
      );
    }
    if (!process.env.DAYTONA_API_KEY) {
      throw new Error('DAYTONA_API_KEY is not set — cannot create a Daytona sandbox.');
    }

    const Daytona = mod.Daytona as unknown as new () => {
      create: (opts: unknown) => Promise<unknown>;
      remove: (s: unknown) => Promise<void>;
    };
    this.daytona = new Daytona();
    this.sandbox = (await this.daytona.create({ snapshot: FRONTGUARD_SNAPSHOT })) as typeof this.sandbox;
    logger.debug('Daytona sandbox created');
  }

  async applyPatch(patch: SandboxPatch): Promise<void> {
    if (patch.type === 'css') {
      this.cssPatches.push(patch.content);
    } else {
      logger.debug(`DaytonaSandbox: ignoring non-CSS patch of type "${patch.type}"`);
    }
  }

  async screenshot(params: SandboxScreenshotParams): Promise<Buffer> {
    if (!this.sandbox) throw new Error('Daytona sandbox not created — call create() first.');

    // Build a small render script and execute it in the sandbox. The snapshot
    // is expected to have a `frontguard-render` helper; we pass patches via a
    // temp CSS file. Implementation detail kept minimal and defensive.
    const css = this.cssPatches.join('\n').replace(/'/g, "'\\''");
    const cmd =
      `frontguard-render --url '${params.url}' --viewport ${params.viewport} ` +
      `--browser ${params.browser} --inject-css '${css}' --out /tmp/shot-b64.txt && cat /tmp/shot-b64.txt`;

    const res = await this.sandbox.process.executeCommand(cmd);
    if (res.exitCode !== 0) {
      throw new Error(`Daytona render failed (exit ${res.exitCode})`);
    }
    return Buffer.from(res.result.trim(), 'base64');
  }

  async destroy(): Promise<void> {
    this.cssPatches = [];
    if (this.daytona && this.sandbox) {
      try {
        await this.daytona.remove(this.sandbox);
        logger.debug('Daytona sandbox destroyed');
      } catch (err) {
        logger.warn(`Failed to destroy Daytona sandbox: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    this.sandbox = null;
    this.daytona = null;
  }
}
