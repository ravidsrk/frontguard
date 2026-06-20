import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig } from '../../src/core/config.js';
import { createTempDir, writeFiles } from '../fixtures/helpers.js';

describe('loadConfig: TypeScript config files', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
  });

  it('loads a discovered frontguard.config.ts default export', async () => {
    const { dir, cleanup: c } = createTempDir();
    cleanup = c;
    writeFiles(dir, {
      'frontguard.config.ts': `export default {
  baseUrl: 'http://localhost:3000',
};`,
    });

    const originalCwd = process.cwd();
    process.chdir(dir);
    try {
      const config = await loadConfig();
      expect(config.baseUrl).toBe('http://localhost:3000');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('loads a .ts config via an explicit --config path', async () => {
    const { dir, cleanup: c } = createTempDir();
    cleanup = c;
    writeFiles(dir, {
      'custom.config.ts': `export default {
  baseUrl: 'http://localhost:4000',
};`,
    });

    const originalCwd = process.cwd();
    process.chdir(dir);
    try {
      const config = await loadConfig('custom.config.ts');
      expect(config.baseUrl).toBe('http://localhost:4000');
    } finally {
      process.chdir(originalCwd);
    }
  });
});