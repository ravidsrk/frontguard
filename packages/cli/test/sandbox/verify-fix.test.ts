import { describe, it, expect, vi } from 'vitest';
import { verifyFix, diffPercentageBetween, createSandbox } from '../../src/sandbox/verify-fix.js';
import { LocalSandbox } from '../../src/sandbox/local.js';
import { DaytonaSandbox } from '../../src/sandbox/daytona.js';
import type { Sandbox } from '../../src/sandbox/types.js';
import type { DiffResult, SuggestedFix, FrontguardConfig } from '../../src/core/types.js';
import { createTestPng } from '../fixtures/helpers.js';

const baseConfig = {
  version: 1,
  baseUrl: 'http://localhost:3000',
  viewports: [1440],
  browsers: ['chromium'],
  threshold: 0.1,
} as unknown as FrontguardConfig;

const fix: SuggestedFix = {
  fixType: 'css',
  category: 'overflow-fix',
  patch: '.card { overflow: hidden; }',
  confidence: 0.8,
  explanation: 'fix',
};

function makeDiff(baseline?: Buffer): DiffResult {
  return {
    route: { path: '/dashboard' },
    viewport: 1440,
    browser: 'chromium',
    status: 'regression',
    diffPercentage: 5,
    baselineImage: baseline,
  } as unknown as DiffResult;
}

/** A scriptable fake sandbox. */
class FakeSandbox implements Sandbox {
  created = false;
  destroyed = false;
  patches: string[] = [];
  constructor(private readonly shot: Buffer, private readonly failOn?: 'create' | 'screenshot') {}
  async create() {
    if (this.failOn === 'create') throw new Error('boom-create');
    this.created = true;
  }
  async applyPatch(p: { content: string }) {
    this.patches.push(p.content);
  }
  async screenshot() {
    if (this.failOn === 'screenshot') throw new Error('boom-shot');
    return this.shot;
  }
  async destroy() {
    this.destroyed = true;
  }
}

describe('diffPercentageBetween', () => {
  it('returns 0 for identical images', () => {
    const a = createTestPng(10, 10, 0, 0, 0);
    expect(diffPercentageBetween(a, a)).toBe(0);
  });

  it('returns ~100 for fully different images', () => {
    const black = createTestPng(10, 10, 0, 0, 0);
    const white = createTestPng(10, 10, 255, 255, 255);
    expect(diffPercentageBetween(black, white)).toBeGreaterThan(90);
  });

  it('returns 100 for mismatched sizes', () => {
    const a = createTestPng(10, 10);
    const b = createTestPng(20, 20);
    expect(diffPercentageBetween(a, b)).toBe(100);
  });

  it('returns 100 for undecodable buffers', () => {
    expect(diffPercentageBetween(Buffer.from('x'), Buffer.from('y'))).toBe(100);
  });
});

describe('createSandbox', () => {
  it('returns LocalSandbox for local', () => {
    expect(createSandbox('local')).toBeInstanceOf(LocalSandbox);
  });
  it('returns DaytonaSandbox for daytona', () => {
    expect(createSandbox('daytona')).toBeInstanceOf(DaytonaSandbox);
  });
});

describe('verifyFix', () => {
  it('verifies a fix that restores the baseline (within threshold)', async () => {
    const baseline = createTestPng(20, 20, 0, 0, 0);
    const sandbox = new FakeSandbox(baseline); // after-fix == baseline → 0% diff
    const result = await verifyFix(makeDiff(baseline), fix, baseConfig, {
      baseUrl: 'http://localhost:3000',
      sandboxImpl: sandbox,
    });
    expect(result.fixApplied).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.diffPercentage).toBe(0);
    expect(sandbox.patches).toContain(fix.patch);
    expect(sandbox.destroyed).toBe(true);
  });

  it('rejects a fix that does not help (over threshold)', async () => {
    const baseline = createTestPng(20, 20, 0, 0, 0);
    const broken = createTestPng(20, 20, 255, 255, 255);
    const sandbox = new FakeSandbox(broken);
    const result = await verifyFix(makeDiff(baseline), fix, baseConfig, {
      baseUrl: 'http://localhost:3000',
      sandboxImpl: sandbox,
    });
    expect(result.fixApplied).toBe(true);
    expect(result.verified).toBe(false);
  });

  it('returns error when no baseline image present', async () => {
    const result = await verifyFix(makeDiff(undefined), fix, baseConfig, {
      baseUrl: 'http://localhost:3000',
      sandboxImpl: new FakeSandbox(createTestPng(10, 10)),
    });
    expect(result.fixApplied).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('cleans up the sandbox even when screenshot throws', async () => {
    const baseline = createTestPng(20, 20, 0, 0, 0);
    const sandbox = new FakeSandbox(baseline, 'screenshot');
    const result = await verifyFix(makeDiff(baseline), fix, baseConfig, {
      baseUrl: 'http://localhost:3000',
      sandboxImpl: sandbox,
    });
    expect(result.fixApplied).toBe(false);
    expect(result.error).toContain('boom-shot');
    expect(sandbox.destroyed).toBe(true); // guaranteed cleanup
  });

  it('cleans up the sandbox even when create throws', async () => {
    const baseline = createTestPng(20, 20, 0, 0, 0);
    const sandbox = new FakeSandbox(baseline, 'create');
    const result = await verifyFix(makeDiff(baseline), fix, baseConfig, {
      baseUrl: 'http://localhost:3000',
      sandboxImpl: sandbox,
    });
    expect(result.fixApplied).toBe(false);
    expect(sandbox.destroyed).toBe(true);
  });

  it('respects per-route threshold override', async () => {
    const baseline = createTestPng(20, 20, 0, 0, 0);
    // ~25% of pixels differ
    const slightlyOff = createTestPng(20, 20, 0, 0, 0);
    const png = (await import('pngjs')).PNG.sync.read(slightlyOff);
    for (let i = 0; i < png.data.length / 4 / 4; i++) {
      png.data[i * 4] = 255;
    }
    const modified = (await import('pngjs')).PNG.sync.write(png);
    const diff = makeDiff(baseline);
    (diff.route as { threshold?: number }).threshold = 0.5; // 50% allowed
    const result = await verifyFix(diff, fix, baseConfig, {
      baseUrl: 'http://localhost:3000',
      sandboxImpl: new FakeSandbox(modified),
    });
    expect(result.verified).toBe(true);
  });
});
