import { describe, it, expect } from 'vitest';
import { DaytonaSandbox, shellQuote } from '../../src/sandbox/daytona.js';
import type { SandboxScreenshotParams } from '../../src/sandbox/types.js';
import { createTestPng } from '../fixtures/helpers.js';

/** Builds a DaytonaSandbox with its internals stubbed to capture the command. */
function stubbedSandbox(shotBase64: string) {
  const calls: { cmd: string }[] = [];
  const uploads: { path: string; content: string }[] = [];
  const sb = new DaytonaSandbox();
  // Inject a fake remote sandbox object via the private field.
  (sb as unknown as { sandbox: unknown }).sandbox = {
    process: {
      executeCommand: async (cmd: string) => {
        calls.push({ cmd });
        return { result: shotBase64, exitCode: 0 };
      },
    },
    fs: {
      uploadFile: async (file: Buffer, remotePath: string) => {
        uploads.push({ path: remotePath, content: file.toString('utf8') });
      },
    },
  };
  return { sb, calls, uploads };
}

const validParams: SandboxScreenshotParams = {
  url: 'http://localhost:3000/dashboard',
  viewport: 1440,
  browser: 'chromium',
};

describe('shellQuote', () => {
  it('wraps in single quotes and escapes embedded quotes', () => {
    expect(shellQuote('abc')).toBe("'abc'");
    expect(shellQuote("a'b")).toBe("'a'\\''b'");
    // A classic injection attempt is fully neutralised inside the quotes.
    const quoted = shellQuote("x'; rm -rf / #");
    expect(quoted.startsWith("'")).toBe(true);
    expect(quoted.endsWith("'")).toBe(true);
    expect(quoted).toBe("'x'\\''; rm -rf / #'");
  });
});

describe('DaytonaSandbox.screenshot — injection safety', () => {
  it('rejects a malicious URL that tries to break out of the shell', async () => {
    const { sb, calls } = stubbedSandbox(createTestPng(4, 4).toString('base64'));
    await expect(
      sb.screenshot({ ...validParams, url: "http://x'; rm -rf / #" }),
    ).rejects.toThrow();
    expect(calls.length).toBe(0); // never reached executeCommand
  });

  it('rejects a non-http(s) URL', async () => {
    const { sb } = stubbedSandbox('');
    await expect(sb.screenshot({ ...validParams, url: 'file:///etc/passwd' })).rejects.toThrow(
      /protocol/i,
    );
  });

  it('rejects an invalid browser engine', async () => {
    const { sb } = stubbedSandbox('');
    await expect(
      sb.screenshot({ ...validParams, browser: 'evil; rm -rf /' as never }),
    ).rejects.toThrow(/browser/i);
  });

  it('rejects a non-numeric viewport', async () => {
    const { sb } = stubbedSandbox('');
    await expect(
      sb.screenshot({ ...validParams, viewport: '1440; reboot' as never }),
    ).rejects.toThrow(/viewport/i);
  });

  it('uploads CSS to a temp file instead of interpolating it, and quotes args', async () => {
    const { sb, calls, uploads } = stubbedSandbox(createTestPng(4, 4).toString('base64'));
    // AI-generated CSS containing shell metacharacters must never reach the cmd.
    const malCss = ".x{color:red} '; rm -rf / #";
    await sb.applyPatch({ type: 'css', content: malCss });
    await sb.screenshot(validParams);

    expect(uploads.length).toBe(1);
    expect(uploads[0].content).toContain('rm -rf'); // raw CSS landed in the file
    expect(calls.length).toBe(1);
    const cmd = calls[0].cmd;
    // The dangerous CSS is NOT in the command string.
    expect(cmd).not.toContain('rm -rf');
    // The renderer is pointed at the uploaded file, with quoted args.
    expect(cmd).toContain('--inject-css-file');
    expect(cmd).toContain(`'${uploads[0].path}'`);
    expect(cmd).toContain("--url 'http://localhost:3000/dashboard'");
    expect(cmd).toContain("--browser 'chromium'");
  });

  it('throws a clear error if create() was not called', async () => {
    const sb = new DaytonaSandbox();
    await expect(sb.screenshot(validParams)).rejects.toThrow(/not created/i);
  });
});

describe('DaytonaSandbox.create — configuration errors', () => {
  it('surfaces a clear "fall back to local sandbox" message when DAYTONA_API_KEY is unset', async () => {
    const prev = process.env.DAYTONA_API_KEY;
    delete process.env.DAYTONA_API_KEY;
    try {
      const sb = new DaytonaSandbox();
      // The wording is verbatim what verify-fix surfaces, and what the docs
      // page on sandboxes calls out. Don't loosen this assertion without
      // updating apps/web/src/lib/docs-content.ts (guides/sandbox article).
      await expect(sb.create()).rejects.toThrow(/Daytona fix verification unconfigured/i);
      await expect(sb.create()).rejects.toThrow(/Falling back to local sandbox/i);
      await expect(sb.create()).rejects.toThrow(/DAYTONA_API_KEY/);
    } finally {
      if (prev !== undefined) process.env.DAYTONA_API_KEY = prev;
    }
  });
});
