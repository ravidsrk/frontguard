/**
 * Regression test for cloud-1: prior baselines must be restored into the
 * sandbox before `frontguard run`.
 *
 * Before this fix the runner only uploaded `frontguard.config.json`, so the
 * sandbox had no prior baselines and every screenshot came back as a new
 * baseline — the cloud path could take screenshots but never raise a
 * regression. These tests cover the restore helper directly and assert the
 * end-to-end exec ordering in `executeInSandbox`.
 */
import { describe, it, expect, vi } from 'vitest';

// Shared sandbox + call log, hoisted so the @daytona/sdk mock factory can
// reference them. The mock keeps the real SDK (and its transitive `ws` dep)
// from ever loading.
const h = vi.hoisted(() => {
  const calls: string[] = [];
  const uploads = new Map<string, string>();
  const sandbox = {
    getUserHomeDir: async () => '/home/daytona',
    fs: {
      uploadFile: async (bytes: Buffer | Uint8Array, path: string) => {
        calls.push(`upload:${path}`);
        uploads.set(path, Buffer.from(bytes).toString('utf8'));
      },
      downloadFile: async (path: string) => {
        calls.push(`download:${path}`);
        if (path.endsWith('results.json')) return Buffer.from('[]');
        throw new Error('not found');
      },
      listFiles: async () => [] as Array<{ name: string }>,
    },
    process: {
      executeCommand: async (cmd: string) => {
        calls.push(`exec:${cmd}`);
        return { result: '[]' };
      },
    },
  };
  return { calls, uploads, sandbox };
});

vi.mock('@daytona/sdk', () => ({
  Daytona: class {
    async create() {
      h.calls.push('create');
      return h.sandbox;
    }
    async delete() {
      h.calls.push('delete');
    }
  },
}));

import { restoreBaselines, executeInSandbox } from '../src/daytona-runner.js';
import type { BaselineRestore } from '../src/daytona-runner.js';

/** Fake R2 bucket whose objects map key → bytes. */
function fakeBucket(objects: Record<string, Uint8Array>): BaselineRestore['bucket'] {
  return {
    async get(key: string) {
      if (!(key in objects)) return null;
      const bytes = objects[key];
      return {
        async arrayBuffer() {
          return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        },
      };
    },
  };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe('restoreBaselines (cloud-1)', () => {
  it('uploads one baseline PNG per record into the orphan baseline layout', async () => {
    const uploads: string[] = [];
    const sandbox = {
      fs: {
        uploadFile: async (_b: Buffer | Uint8Array, path: string) => {
          uploads.push(path);
        },
      },
    };
    const restore: BaselineRestore = {
      bucket: fakeBucket({ 'u/r/home-1440-chromium-baseline.png': PNG, 'u/r/home-1440-firefox-baseline.png': PNG }),
      baselines: [
        { route: '/', viewport: 1440, browser: 'chromium', r2Key: 'u/r/home-1440-chromium-baseline.png' },
        { route: '/', viewport: 1440, browser: 'firefox', r2Key: 'u/r/home-1440-firefox-baseline.png' },
      ],
    };

    const count = await restoreBaselines(sandbox, restore, '/home/daytona');

    expect(count).toBe(2);
    expect(uploads).toEqual([
      '/home/daytona/baselines/_root/1440/chromium.png',
      '/home/daytona/baselines/_root/1440/firefox.png',
    ]);
  });

  it('uploads nothing and does not throw when there are no baselines', async () => {
    const uploads: string[] = [];
    const sandbox = { fs: { uploadFile: async (_b: Buffer | Uint8Array, p: string) => void uploads.push(p) } };

    expect(await restoreBaselines(sandbox, undefined, '/home/daytona')).toBe(0);
    expect(
      await restoreBaselines(sandbox, { bucket: fakeBucket({}), baselines: [] }, '/home/daytona'),
    ).toBe(0);
    expect(uploads).toEqual([]);
  });

  it('skips a baseline whose bytes are missing from R2', async () => {
    const uploads: string[] = [];
    const sandbox = { fs: { uploadFile: async (_b: Buffer | Uint8Array, p: string) => void uploads.push(p) } };
    const restore: BaselineRestore = {
      bucket: fakeBucket({ 'present.png': PNG }),
      baselines: [
        { route: '/', viewport: 1440, browser: 'chromium', r2Key: 'present.png' },
        { route: '/about', viewport: 1440, browser: 'chromium', r2Key: 'missing.png' },
      ],
    };
    expect(await restoreBaselines(sandbox, restore, '/w')).toBe(1);
    expect(uploads).toEqual(['/w/baselines/_root/1440/chromium.png']);
  });
});

describe('executeInSandbox — restore happens before the run (cloud-1)', () => {
  it('orders createSandbox -> restoreBaselines -> uploadConfig -> exec -> download', async () => {
    h.calls.length = 0;
    const restore: BaselineRestore = {
      bucket: fakeBucket({ 'u/r/home-1440-chromium-baseline.png': PNG }),
      baselines: [{ route: '/', viewport: 1440, browser: 'chromium', r2Key: 'u/r/home-1440-chromium-baseline.png' }],
    };

    await executeInSandbox({
      url: 'https://shop.example.com',
      routes: [{ path: '/' }],
      viewports: [1440],
      browsers: ['chromium'],
      threshold: 0.01,
      daytonaApiKey: 'dt_key',
      baselineRestore: restore,
    });

    const idx = (pred: (c: string) => boolean) => h.calls.findIndex(pred);
    const createIdx = idx((c) => c === 'create');
    const baselineUploadIdx = idx((c) => c.startsWith('upload:') && c.includes('/baselines/'));
    const configUploadIdx = idx((c) => c.includes('frontguard.config.json'));
    const runIdx = idx((c) => c.startsWith('exec:frontguard run'));
    const resultsIdx = idx((c) => c.startsWith('download:') && c.endsWith('results.json'));

    // All steps present.
    expect(createIdx).toBe(0);
    expect(baselineUploadIdx).toBeGreaterThan(-1);
    expect(configUploadIdx).toBeGreaterThan(-1);
    expect(runIdx).toBeGreaterThan(-1);
    expect(resultsIdx).toBeGreaterThan(-1);

    // Ordering: baseline restore -> config -> run -> download results.
    expect(baselineUploadIdx).toBeLessThan(configUploadIdx);
    expect(configUploadIdx).toBeLessThan(runIdx);
    expect(runIdx).toBeLessThan(resultsIdx);

    // The orphan branch was seeded from the restored baselines before the run.
    const seedIdx = idx((c) => c.startsWith('exec:') && c.includes('--orphan frontguard-baselines'));
    expect(seedIdx).toBeGreaterThan(baselineUploadIdx);
    expect(seedIdx).toBeLessThan(runIdx);

    const runCmd = h.calls.find((c) => c.startsWith('exec:frontguard run'));
    expect(runCmd).toBe(
      'exec:frontguard run --config /home/daytona/frontguard.config.json --output json',
    );
    expect(runCmd).not.toContain('--reporter');
    const config = JSON.parse(h.uploads.get('/home/daytona/frontguard.config.json') ?? '{}') as {
      outputDir?: string;
    };
    expect(config.outputDir).toBe('/home/daytona/output');
  });

  it('parses CLI json diffs from stdout when results.json is absent', async () => {
    h.calls.length = 0;
    const originalExec = h.sandbox.process.executeCommand;
    const originalDownload = h.sandbox.fs.downloadFile;
    h.sandbox.process.executeCommand = async (cmd: string) => {
      h.calls.push(`exec:${cmd}`);
      if (cmd.startsWith('frontguard run')) {
        return {
          result: JSON.stringify({
            diffs: [
              {
                route: '/',
                viewport: 1440,
                browser: 'chromium',
                status: 'pass',
                diffPercentage: 0,
                comparisonMethod: 'pixelmatch',
              },
            ],
          }),
        };
      }
      return { result: '' };
    };
    h.sandbox.fs.downloadFile = async (path: string) => {
      h.calls.push(`download:${path}`);
      if (path.endsWith('report.html')) return Buffer.from('<html>compared</html>');
      throw new Error('not found');
    };
    try {
      const out = await executeInSandbox({
        url: 'https://shop.example.com',
        routes: [{ path: '/' }],
        viewports: [1440],
        browsers: ['chromium'],
        threshold: 0.01,
        daytonaApiKey: 'dt_key',
      });
      expect(out.results).toEqual([
        expect.objectContaining({
          route: '/',
          status: 'pass',
          comparisonMethod: 'pixelmatch',
        }),
      ]);
      const runCmd = h.calls.find((c) => c.startsWith('exec:frontguard run'));
      expect(runCmd).not.toContain('--reporter');
      expect(runCmd).toContain('--output json');
    } finally {
      h.sandbox.process.executeCommand = originalExec;
      h.sandbox.fs.downloadFile = originalDownload;
    }
  });
});
