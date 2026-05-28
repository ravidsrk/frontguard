import { describe, it, expect, vi, afterEach } from 'vitest';
import { configSchema, detectSecrets, detectFramework } from '../../src/core/config.js';
import { createTempDir, writeFiles } from '../fixtures/helpers.js';
import { ZodError } from 'zod';

describe('configSchema', () => {
  it('applies correct defaults for minimal valid config', () => {
    const result = configSchema.parse({ baseUrl: 'http://localhost:3000' });

    expect(result.viewports).toEqual([375, 768, 1440]);
    expect(result.browsers).toEqual(['chromium']);
    expect(result.threshold).toBe(0.1);
    expect(result.workers).toBe(4);
    expect(result.smartRender).toBe(true);
    expect(result.pageTimeout).toBe(30000);
    expect(result.maxHeight).toBe(5000);
    expect(result.outputDir).toBe('./frontguard-report');
    expect(result.version).toBe(1);
    expect(result.ignore).toEqual([]);
  });

  it('throws ZodError when threshold is a string', () => {
    expect(() =>
      configSchema.parse({
        baseUrl: 'http://localhost:3000',
        threshold: 'high',
      })
    ).toThrow(ZodError);
  });

  it('throws ZodError when baseUrl is missing', () => {
    expect(() => configSchema.parse({})).toThrow(ZodError);
  });

  it('throws ZodError when baseUrl is not a valid URL', () => {
    expect(() => configSchema.parse({ baseUrl: 'not-a-url' })).toThrow(ZodError);
  });

  it('throws ZodError when threshold exceeds 1', () => {
    expect(() =>
      configSchema.parse({ baseUrl: 'http://localhost:3000', threshold: 2 })
    ).toThrow(ZodError);
  });

  it('accepts a fully specified valid config', () => {
    const config = configSchema.parse({
      baseUrl: 'http://localhost:3000',
      version: 1,
      routes: ['/', '/about'],
      viewports: [1024],
      browsers: ['chromium', 'firefox'],
      threshold: 0.05,
      workers: 2,
      smartRender: false,
      pageTimeout: 15000,
      maxHeight: 10000,
      outputDir: './reports',
      ignore: [{ selector: '.ad-banner', description: 'ads' }],
    });

    expect(config.viewports).toEqual([1024]);
    expect(config.browsers).toEqual(['chromium', 'firefox']);
    expect(config.workers).toBe(2);
  });

  // --- Per-route configuration (Task 1.2) --------------------------------
  it('accepts string-only routes (backward compatible)', () => {
    const config = configSchema.parse({
      baseUrl: 'http://localhost:3000',
      routes: ['/', '/about', '/pricing'],
    });
    expect(config.routes).toEqual(['/', '/about', '/pricing']);
  });

  it('accepts RouteConfig objects with per-route threshold', () => {
    const config = configSchema.parse({
      baseUrl: 'http://localhost:3000',
      routes: [{ path: '/checkout', threshold: 0.01 }, { path: '/blog', threshold: 0.5 }],
    });
    expect(config.routes).toHaveLength(2);
    expect((config.routes![0] as { threshold: number }).threshold).toBe(0.01);
  });

  it('accepts mixed string + object route arrays', () => {
    const config = configSchema.parse({
      baseUrl: 'http://localhost:3000',
      routes: ['/', { path: '/checkout', threshold: 0.01 }],
    });
    expect(config.routes![0]).toBe('/');
    expect((config.routes![1] as { path: string }).path).toBe('/checkout');
  });

  it('accepts per-route ignore rules and viewport overrides', () => {
    const config = configSchema.parse({
      baseUrl: 'http://localhost:3000',
      routes: [
        { path: '/blog', ignore: [{ selector: '.timestamp' }], viewport: [1440] },
      ],
    });
    const route = config.routes![0] as {
      ignore: { selector: string }[];
      viewport: number[];
    };
    expect(route.ignore[0].selector).toBe('.timestamp');
    expect(route.viewport).toEqual([1440]);
  });

  it('rejects per-route threshold above 1', () => {
    expect(() =>
      configSchema.parse({
        baseUrl: 'http://localhost:3000',
        routes: [{ path: '/x', threshold: 5 }],
      })
    ).toThrow(ZodError);
  });

  it('rejects route object without a path', () => {
    expect(() =>
      configSchema.parse({
        baseUrl: 'http://localhost:3000',
        routes: [{ threshold: 0.1 }],
      })
    ).toThrow(ZodError);
  });
});

describe('detectSecrets', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns when config contains an OpenAI-style key', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    detectSecrets({ apiKey: 'sk-test1234567890123456789' });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Possible API key detected')
    );
  });

  it('warns for nested secrets in arrays', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    detectSecrets({ tokens: ['sk-test1234567890123456789'] });

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('does not warn for safe values', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    detectSecrets({
      baseUrl: 'http://localhost:3000',
      threshold: 0.1,
      routes: ['/', '/about'],
    });

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('handles null and non-object input gracefully', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    detectSecrets(null);
    detectSecrets(42);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('detectFramework', () => {
  let tempDir: string;
  let cleanup: () => void;

  afterEach(() => {
    cleanup?.();
  });

  it('detects Next.js from package.json dependencies', async () => {
    ({ dir: tempDir, cleanup } = createTempDir());
    writeFiles(tempDir, {
      'package.json': JSON.stringify({
        dependencies: { next: '^14.0.0', react: '^18.0.0' },
      }),
    });

    const result = await detectFramework(tempDir);
    expect(result).toBe('Next.js');
  });

  it('detects Remix from package.json', async () => {
    ({ dir: tempDir, cleanup } = createTempDir());
    writeFiles(tempDir, {
      'package.json': JSON.stringify({
        dependencies: { '@remix-run/react': '^2.0.0' },
      }),
    });

    const result = await detectFramework(tempDir);
    expect(result).toBe('Remix');
  });

  it('detects Create React App from react-scripts', async () => {
    ({ dir: tempDir, cleanup } = createTempDir());
    writeFiles(tempDir, {
      'package.json': JSON.stringify({
        dependencies: { 'react-scripts': '^5.0.0', react: '^18.0.0' },
      }),
    });

    const result = await detectFramework(tempDir);
    expect(result).toBe('Create React App');
  });

  it('detects Astro from devDependencies', async () => {
    ({ dir: tempDir, cleanup } = createTempDir());
    writeFiles(tempDir, {
      'package.json': JSON.stringify({ devDependencies: { astro: '^4.0.0' } }),
    });

    const result = await detectFramework(tempDir);
    expect(result).toBe('Astro');
  });

  it('returns null when no framework is detected', async () => {
    ({ dir: tempDir, cleanup } = createTempDir());
    writeFiles(tempDir, {
      'package.json': JSON.stringify({
        dependencies: { lodash: '^4.0.0' },
      }),
    });

    const result = await detectFramework(tempDir);
    expect(result).toBeNull();
  });

  it('returns null when package.json does not exist', async () => {
    ({ dir: tempDir, cleanup } = createTempDir());
    // No files at all
    const result = await detectFramework(tempDir);
    expect(result).toBeNull();
  });
});
