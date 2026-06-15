/**
 * `frontguard-render` — thin CLI wrapper around the Playwright render pipeline.
 *
 * Used by the Daytona snapshot to render a single URL with an optional CSS
 * patch injected, and stream the resulting PNG back to the caller. The Daytona
 * sandbox (`src/sandbox/daytona.ts`) and the cloud runner
 * (`packages/cloud-api/src/daytona-runner.ts`) both shell to this binary.
 *
 * Flags match the contract the sandbox already shells to (`--url`, `--viewport`,
 * `--browser`, `--inject-css-file`, `--out`). `--encoding` lets the caller pick
 * raw PNG bytes (`binary`, the default — convenient for local piping) or a
 * base64 string (used by the Daytona sandbox so the result survives a shell
 * round-trip via `cat`).
 *
 * The renderer is dependency-injectable via the `render` option so unit tests
 * can stub Playwright entirely.
 *
 * @module cli/render
 */

import { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { BrowserEngine } from '../core/types.js';

/** Allowed browser engines (mirrors `sandbox/daytona.ts`). */
const ALLOWED_BROWSERS: readonly BrowserEngine[] = ['chromium', 'firefox', 'webkit'];

/** Parameters accepted by a {@link RenderFn}. */
export interface RenderParams {
  url: string;
  viewport: number;
  viewportHeight: number;
  browser: BrowserEngine;
  /** CSS string to inject after the page loads (empty string = nothing to inject). */
  css: string;
  /** Hard timeout for `page.goto`, in ms. */
  pageTimeoutMs: number;
}

/** Renderer contract — produces a PNG buffer for the given params. */
export type RenderFn = (params: RenderParams) => Promise<Buffer>;

/** Options for {@link renderCli}. Tests pass `render` to bypass Playwright. */
export interface RenderCliOptions {
  /** Override the renderer (for tests). Defaults to the Playwright renderer. */
  render?: RenderFn;
  /** Writable stream for the PNG / base64 result. Defaults to `process.stdout`. */
  stdout?: NodeJS.WritableStream;
  /** Writable stream for logs and errors. Defaults to `process.stderr`. */
  stderr?: NodeJS.WritableStream;
}

/** CLI version — kept in sync with the parent CLI. */
const VERSION = '0.2.0';

/**
 * Validates a render URL: must be a well-formed http(s) URL with no control
 * characters. Mirrors `sandbox/daytona.ts` so the binary refuses the same
 * inputs the sandbox already refuses upstream.
 */
function validateUrl(raw: string): string {
   
  if (/[\x00-\x1f\x7f]/.test(raw)) {
    throw new Error('frontguard-render: URL contains control characters.');
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`frontguard-render: invalid URL "${raw}".`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`frontguard-render: unsupported URL protocol "${parsed.protocol}".`);
  }
  return parsed.href;
}

/**
 * Default Playwright-backed renderer. Imported lazily so the bin doesn't pay
 * the Playwright import cost in tests that inject a stub.
 */
const playwrightRender: RenderFn = async (params) => {
  const pw = await import('playwright');
  const engine = pw[params.browser];
  const browser = await engine.launch({
    headless: true,
    args:
      params.browser === 'chromium'
        ? ['--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox']
        : undefined,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: params.viewport, height: params.viewportHeight },
    });
    const page = await context.newPage();
    await page.goto(params.url, { waitUntil: 'networkidle', timeout: params.pageTimeoutMs });

    // Freeze animations so the screenshot is deterministic.
    await page.addStyleTag({
      content:
        '*,*::before,*::after{animation:none!important;transition:none!important;}',
    });

    if (params.css.length > 0) {
      await page.addStyleTag({ content: params.css });
    }

    // Let layout settle after the injection.
    await page.waitForTimeout(300);

    const png = await page.screenshot({ fullPage: true, type: 'png' });
    await context.close();
    return Buffer.from(png);
  } finally {
    await browser.close();
  }
};

/**
 * Entry point for the `frontguard-render` binary.
 *
 * @param argv  - Raw process argv (including `node` + script path).
 * @param opts  - Optional render override + stream overrides for testing.
 * @returns Exit code (0 on success, 2 on usage / runtime error).
 */
export async function renderCli(argv: string[], opts: RenderCliOptions = {}): Promise<number> {
  const stdout = opts.stdout ?? process.stdout;
  const stderr = opts.stderr ?? process.stderr;
  const render = opts.render ?? playwrightRender;

  const program = new Command();
  program
    .name('frontguard-render')
    .description(
      'Render a single URL with an optional CSS patch and return a PNG. ' +
        'Used by the Daytona snapshot to verify AI-generated fixes.',
    )
    .version(VERSION)
    .requiredOption('--url <url>', 'Absolute http(s) URL to render')
    .requiredOption('--viewport <px>', 'Viewport width in px')
    .requiredOption('--browser <engine>', 'Browser engine: chromium | firefox | webkit')
    .option('--inject-css-file <path>', 'Path to a CSS file whose contents are injected after load')
    .option('--viewport-height <px>', 'Viewport height in px', '720')
    .option('--page-timeout <ms>', 'Page load timeout in ms', '30000')
    .option('--out <path>', 'Write the result to PATH instead of stdout')
    .option(
      '--encoding <kind>',
      'Output encoding: binary (raw PNG bytes) or base64 (utf8 text)',
      'binary',
    )
    .exitOverride()
    .configureOutput({
      writeOut: (str) => { stdout.write(str); },
      writeErr: (str) => { stderr.write(str); },
    });

  // Parse without auto-exit so we can return an exit code instead of throwing.
  try {
    program.parse(argv);
  } catch (err) {
    // commander.exitOverride throws CommanderError for --help / --version / parse errors.
    const e = err as { code?: string; exitCode?: number };
    if (e.code === 'commander.helpDisplayed' || e.code === 'commander.version') {
      return 0;
    }
    return typeof e.exitCode === 'number' ? e.exitCode : 2;
  }

  const o = program.opts<{
    url: string;
    viewport: string;
    viewportHeight: string;
    browser: string;
    injectCssFile?: string;
    pageTimeout: string;
    out?: string;
    encoding: string;
  }>();

  try {
    const url = validateUrl(o.url);

    const viewport = Number.parseInt(o.viewport, 10);
    if (!Number.isInteger(viewport) || viewport <= 0) {
      throw new Error(`frontguard-render: invalid --viewport "${o.viewport}".`);
    }

    const viewportHeight = Number.parseInt(o.viewportHeight, 10);
    if (!Number.isInteger(viewportHeight) || viewportHeight <= 0) {
      throw new Error(`frontguard-render: invalid --viewport-height "${o.viewportHeight}".`);
    }

    const pageTimeoutMs = Number.parseInt(o.pageTimeout, 10);
    if (!Number.isInteger(pageTimeoutMs) || pageTimeoutMs <= 0) {
      throw new Error(`frontguard-render: invalid --page-timeout "${o.pageTimeout}".`);
    }

    const browser = o.browser as BrowserEngine;
    if (!ALLOWED_BROWSERS.includes(browser)) {
      throw new Error(
        `frontguard-render: invalid --browser "${o.browser}". ` +
          `Allowed: ${ALLOWED_BROWSERS.join(', ')}.`,
      );
    }

    const encoding = o.encoding;
    if (encoding !== 'binary' && encoding !== 'base64') {
      throw new Error(
        `frontguard-render: invalid --encoding "${encoding}". Allowed: binary, base64.`,
      );
    }

    let css = '';
    if (o.injectCssFile) {
      css = await readFile(o.injectCssFile, 'utf8');
    }

    const png = await render({
      url,
      viewport,
      viewportHeight,
      browser,
      css,
      pageTimeoutMs,
    });

    if (o.out) {
      // Write to file. For base64 the contents are utf8 text; for binary it's
      // raw PNG bytes.
      const payload = encoding === 'base64' ? png.toString('base64') : png;
      writeFileSync(o.out, payload);
    } else if (encoding === 'base64') {
      stdout.write(png.toString('base64'));
    } else {
      stdout.write(png);
    }
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    stderr.write(`${msg}\n`);
    return 2;
  }
}
