import { describe, it, expect, afterEach } from 'vitest';
import { uploadImages } from '../../src/storage/upload-stage.js';
import type { DiffResult, FrontguardConfig } from '../../src/core/types.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function baseConfig(overrides?: Partial<FrontguardConfig>): FrontguardConfig {
  return {
    version: 1,
    baseUrl: 'http://localhost:3000',
    viewports: [1440],
    browsers: ['chromium'],
    threshold: 0.1,
    ignore: [],
    smartRender: true,
    workers: 4,
    pageTimeout: 30_000,
    maxHeight: 5_000,
    outputDir: '/tmp/fg-report',
    ...overrides,
  };
}

function diff(status: DiffResult['status'], withBuffers = true): DiffResult {
  return {
    route: { path: '/home' },
    viewport: 1440,
    browser: 'chromium',
    status,
    diffPercentage: status === 'regression' ? 10 : 0,
    baselineImage: withBuffers ? Buffer.from('base') : undefined,
    currentImage: withBuffers ? Buffer.from('curr') : undefined,
    diffImage: withBuffers ? Buffer.from('diff') : undefined,
  };
}

describe('uploadImages', () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('returns 0 when no imageUpload config', async () => {
    const count = await uploadImages([diff('regression')], baseConfig(), 'run1');
    expect(count).toBe(0);
  });

  it('uploads images for regressions and sets URLs (local provider)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'fg-up-'));
    const config = baseConfig({ imageUpload: { provider: 'local', outputDir: dir } });
    const d = diff('regression');
    const count = await uploadImages([d], config, 'run1');
    expect(count).toBe(3);
    expect(d.baselineImageUrl).toContain('file://');
    expect(d.currentImageUrl).toContain('file://');
    expect(d.diffImageUrl).toContain('file://');
  });

  it('skips passing diffs', async () => {
    dir = mkdtempSync(join(tmpdir(), 'fg-up-'));
    const config = baseConfig({ imageUpload: { provider: 'local', outputDir: dir } });
    const d = diff('pass');
    const count = await uploadImages([d], config, 'run1');
    expect(count).toBe(0);
    expect(d.baselineImageUrl).toBeUndefined();
  });

  it('uploads "new" and "changed" diffs', async () => {
    dir = mkdtempSync(join(tmpdir(), 'fg-up-'));
    const config = baseConfig({ imageUpload: { provider: 'local', outputDir: dir } });
    const changed = diff('changed');
    const newp = diff('new');
    const count = await uploadImages([changed, newp], config, 'run1');
    expect(count).toBe(6);
  });

  it('handles diffs without buffers gracefully', async () => {
    dir = mkdtempSync(join(tmpdir(), 'fg-up-'));
    const config = baseConfig({ imageUpload: { provider: 'local', outputDir: dir } });
    const d = diff('regression', false);
    const count = await uploadImages([d], config, 'run1');
    expect(count).toBe(0);
  });
});
