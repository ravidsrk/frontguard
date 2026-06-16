/**
 * Tests for the `frontguard-render` CLI (packages/cli/bin/frontguard-render).
 *
 * The actual binary at `bin/frontguard-render` is a thin shim that imports
 * `renderCli` from the bundled `dist/cli/render.js`. We test the source
 * `renderCli` directly so the tests don't need the dist artifact.
 *
 * The Playwright renderer is replaced with a stub that returns a known PNG,
 * so the tests run without launching a real browser.
 */

import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'node:stream';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderCli, type RenderFn } from '../../src/cli/render.js';
import { createTestPng } from '../fixtures/helpers.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** A writable that collects output as a Buffer for binary-safe assertions. */
class BufferSink extends Writable {
  chunks: Buffer[] = [];
  _write(chunk: Buffer | string, _enc: BufferEncoding, cb: (e?: Error) => void): void {
    this.chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
    cb();
  }
  get buffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
  get text(): string {
    return this.buffer.toString('utf8');
  }
}

/** Builds argv as if the binary was run with the given flags. */
function argv(...flags: string[]): string[] {
  return ['node', '/abs/path/to/bin/frontguard-render', ...flags];
}

/** A render stub that captures its params and returns a fixed PNG. */
function stubRender(png = createTestPng(4, 4)): { render: RenderFn; calls: Parameters<RenderFn>[0][] } {
  const calls: Parameters<RenderFn>[0][] = [];
  const render: RenderFn = vi.fn(async (p) => {
    calls.push(p);
    return png;
  });
  return { render, calls };
}

// ---------------------------------------------------------------------------
// --help / --version
// ---------------------------------------------------------------------------

describe('frontguard-render: --help', () => {
  it('prints the documented flags and exits 0', async () => {
    const stdout = new BufferSink();
    const stderr = new BufferSink();
    const { render } = stubRender();

    const code = await renderCli(argv('--help'), { render, stdout, stderr });

    expect(code).toBe(0);
    const out = stdout.text + stderr.text;
    // Every flag the Daytona sandbox already shells to must be documented.
    for (const flag of ['--url', '--viewport', '--browser', '--inject-css-file', '--out']) {
      expect(out).toContain(flag);
    }
  });

  it('--version prints the version and exits 0', async () => {
    const stdout = new BufferSink();
    const stderr = new BufferSink();
    const { render } = stubRender();
    const code = await renderCli(argv('--version'), { render, stdout, stderr });
    expect(code).toBe(0);
    expect(stdout.text).toMatch(/\d+\.\d+\.\d+/);
  });
});

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

describe('frontguard-render: rendering', () => {
  it('writes raw PNG bytes to stdout by default', async () => {
    const stdout = new BufferSink();
    const stderr = new BufferSink();
    const png = createTestPng(8, 8);
    const { render, calls } = stubRender(png);

    const code = await renderCli(
      argv(
        '--url',
        'http://localhost:3000/dashboard',
        '--viewport',
        '1440',
        '--browser',
        'chromium',
      ),
      { render, stdout, stderr },
    );

    expect(code).toBe(0);
    // PNG signature 89 50 4E 47 — proves we wrote binary, not base64 text.
    expect(stdout.buffer.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(stdout.buffer.equals(png)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: 'http://localhost:3000/dashboard',
      viewport: 1440,
      browser: 'chromium',
      css: '',
    });
  });

  it('reads --inject-css-file and forwards the contents to the renderer', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'frontguard-render-'));
    const cssPath = join(dir, 'inject.css');
    writeFileSync(cssPath, '.card { overflow: hidden; }');

    const stdout = new BufferSink();
    const stderr = new BufferSink();
    const { render, calls } = stubRender();

    const code = await renderCli(
      argv(
        '--url',
        'http://localhost:3000/',
        '--viewport',
        '375',
        '--browser',
        'webkit',
        '--inject-css-file',
        cssPath,
      ),
      { render, stdout, stderr },
    );

    expect(code).toBe(0);
    expect(calls[0].css).toContain('.card { overflow: hidden; }');
    expect(calls[0].browser).toBe('webkit');
    expect(calls[0].viewport).toBe(375);
  });

  it('writes base64 to --out when --encoding=base64 (matches Daytona contract)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'frontguard-render-'));
    const out = join(dir, 'shot-b64.txt');

    const stdout = new BufferSink();
    const stderr = new BufferSink();
    const png = createTestPng(4, 4);
    const { render } = stubRender(png);

    const code = await renderCli(
      argv(
        '--url',
        'http://localhost:3000/',
        '--viewport',
        '1440',
        '--browser',
        'chromium',
        '--out',
        out,
        '--encoding',
        'base64',
      ),
      { render, stdout, stderr },
    );

    expect(code).toBe(0);
    expect(existsSync(out)).toBe(true);
    const written = readFileSync(out, 'utf8');
    expect(Buffer.from(written, 'base64').equals(png)).toBe(true);
    // Nothing to stdout when --out is set.
    expect(stdout.buffer.length).toBe(0);
  });

  it('writes raw PNG bytes to --out when --encoding=binary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'frontguard-render-'));
    const out = join(dir, 'shot.png');

    const stdout = new BufferSink();
    const stderr = new BufferSink();
    const png = createTestPng(4, 4);
    const { render } = stubRender(png);

    const code = await renderCli(
      argv(
        '--url',
        'http://localhost:3000/',
        '--viewport',
        '1440',
        '--browser',
        'chromium',
        '--out',
        out,
      ),
      { render, stdout, stderr },
    );

    expect(code).toBe(0);
    const written = readFileSync(out);
    expect(written.equals(png)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('frontguard-render: validation', () => {
  it('rejects a missing --url with a non-zero exit', async () => {
    const stdout = new BufferSink();
    const stderr = new BufferSink();
    const { render } = stubRender();

    const code = await renderCli(
      argv('--viewport', '1440', '--browser', 'chromium'),
      { render, stdout, stderr },
    );

    expect(code).not.toBe(0);
  });

  it('rejects a non-http(s) URL', async () => {
    const stdout = new BufferSink();
    const stderr = new BufferSink();
    const { render } = stubRender();
    const code = await renderCli(
      argv('--url', 'file:///etc/passwd', '--viewport', '1440', '--browser', 'chromium'),
      { render, stdout, stderr },
    );
    expect(code).not.toBe(0);
    expect(stderr.text).toMatch(/protocol/i);
  });

  it('rejects an invalid --browser', async () => {
    const stdout = new BufferSink();
    const stderr = new BufferSink();
    const { render } = stubRender();
    const code = await renderCli(
      argv(
        '--url',
        'http://localhost:3000/',
        '--viewport',
        '1440',
        '--browser',
        'evil-browser',
      ),
      { render, stdout, stderr },
    );
    expect(code).not.toBe(0);
    expect(stderr.text).toMatch(/browser/i);
  });

  it('rejects a non-numeric --viewport', async () => {
    const stdout = new BufferSink();
    const stderr = new BufferSink();
    const { render } = stubRender();
    const code = await renderCli(
      argv('--url', 'http://localhost:3000/', '--viewport', 'big', '--browser', 'chromium'),
      { render, stdout, stderr },
    );
    expect(code).not.toBe(0);
    expect(stderr.text).toMatch(/viewport/i);
  });

  it('rejects an invalid --encoding', async () => {
    const stdout = new BufferSink();
    const stderr = new BufferSink();
    const { render } = stubRender();
    const code = await renderCli(
      argv(
        '--url',
        'http://localhost:3000/',
        '--viewport',
        '1440',
        '--browser',
        'chromium',
        '--encoding',
        'hex',
      ),
      { render, stdout, stderr },
    );
    expect(code).not.toBe(0);
    expect(stderr.text).toMatch(/encoding/i);
  });
});
