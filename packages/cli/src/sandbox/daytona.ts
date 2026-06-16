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

import type { BrowserEngine } from '../core/types.js';
import type { Sandbox, SandboxPatch, SandboxScreenshotParams } from './types.js';
import { logger } from '../utils/logger.js';
import { cropToMaxHeight } from '../render/crop.js';

/** Pre-baked snapshot with Playwright + Frontguard installed. */
const FRONTGUARD_SNAPSHOT = 'frontguard-playwright-v1';

/** Allowed browser engines (must match what the snapshot renderer accepts). */
const ALLOWED_BROWSERS: readonly BrowserEngine[] = ['chromium', 'firefox', 'webkit'];

/**
 * Shell-quotes a value for safe single-argument interpolation: wraps it in
 * single quotes and escapes any embedded single quote. Nothing inside single
 * quotes is interpreted by the shell, so this neutralises injection.
 */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Validates a render URL. Throws if it is not a well-formed http(s) URL or if
 * it contains control characters (which could smuggle shell metacharacters or
 * break out of an argument).
 */
function validateUrl(raw: string): string {
   
  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    throw new Error('Daytona render: URL contains control characters.');
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`Daytona render: invalid URL "${raw}".`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Daytona render: unsupported URL protocol "${parsed.protocol}".`);
  }
  return parsed.href;
}

/** Daytona-backed sandbox. */
export class DaytonaSandbox implements Sandbox {
  private cssPatches: string[] = [];
  private sandbox: {
    process: { executeCommand: (cmd: string) => Promise<{ result: string; exitCode: number }> };
    fs?: { uploadFile?: (file: Buffer, remotePath: string) => Promise<void> };
  } | null = null;
  private daytona: { create: (opts: unknown) => Promise<unknown>; remove: (s: unknown) => Promise<void> } | null = null;

  async create(): Promise<void> {
    // Validate config BEFORE attempting the SDK import. Otherwise a missing
    // transitive dep (`ws`, etc.) masks the real reason — "you forgot to set
    // DAYTONA_API_KEY" — behind a confusing module-resolution error.
    if (!process.env.DAYTONA_API_KEY) {
      // The caller (verifyFix) catches this and surfaces the message verbatim.
      // Phrasing is deliberate: it tells the user *why* this came up (fix
      // verification needed the Daytona path), what to do (set the env var),
      // and that nothing is broken in the meantime (local sandbox keeps
      // working). The CLI flag is `--fix-sandbox=local|daytona`.
      throw new Error(
        'Daytona fix verification unconfigured: DAYTONA_API_KEY is not set. ' +
          'Falling back to local sandbox. Set DAYTONA_API_KEY or run with ' +
          '--fix-sandbox=local to suppress this warning.',
      );
    }

    let mod: typeof import('@daytonaio/sdk');
    try {
      mod = await import('@daytonaio/sdk');
    } catch {
      throw new Error(
        'Daytona sandbox requires "@daytonaio/sdk". Install it or use the local sandbox.',
      );
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

    // --- Validate every interpolated value before it touches a shell ---------
    const url = validateUrl(params.url);
    if (!Number.isInteger(params.viewport) || params.viewport <= 0) {
      throw new Error(`Daytona render: invalid viewport "${params.viewport}".`);
    }
    if (!ALLOWED_BROWSERS.includes(params.browser)) {
      throw new Error(`Daytona render: invalid browser "${params.browser}".`);
    }

    // CSS is AI-generated from page content, so it is attacker-influenceable.
    // Never interpolate it into the command. Write it to a temp file inside the
    // sandbox (via the SDK filesystem) and point the renderer at the path.
    const css = this.cssPatches.join('\n');
    const cssPath = '/tmp/frontguard-inject.css';
    const upload = this.sandbox.fs?.uploadFile;
    if (typeof upload !== 'function') {
      throw new Error('Daytona render: sandbox filesystem (fs.uploadFile) is unavailable.');
    }
    await upload(Buffer.from(css, 'utf8'), cssPath);

    // All remaining interpolated values are validated above, and quoted as a
    // belt-and-braces measure so they cannot break out of their argument.
    const cmd =
      `frontguard-render --url ${shellQuote(url)} --viewport ${shellQuote(String(params.viewport))} ` +
      `--browser ${shellQuote(params.browser)} --inject-css-file ${shellQuote(cssPath)} ` +
      `--out /tmp/shot-b64.txt && cat /tmp/shot-b64.txt`;

    const res = await this.sandbox.process.executeCommand(cmd);
    if (res.exitCode !== 0) {
      throw new Error(`Daytona render failed (exit ${res.exitCode})`);
    }
    let buffer = Buffer.from(res.result.trim(), 'base64');

    // Crop to maxHeight so dimensions match the main renderer on tall pages.
    if (params.maxHeight && params.maxHeight > 0) {
      buffer = Buffer.from(await cropToMaxHeight(buffer, params.maxHeight));
    }
    return buffer;
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
