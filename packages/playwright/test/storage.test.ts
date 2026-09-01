import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BaselineStorage } from '../src/storage.js';

describe('BaselineStorage', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(join(tmpdir(), 'frontguard-playwright-storage-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('keeps distinct keys distinct when their readable names sanitize identically', () => {
    const storage = new BaselineStorage(testDir);

    const slashPath = storage.getPath('checkout/card');
    const colonPath = storage.getPath('checkout:card');

    expect(slashPath).not.toBe(colonPath);
    expect(basename(slashPath)).toContain('checkout');
    expect(basename(slashPath)).toMatch(/-[a-f0-9]{64}\.png$/);
    expect(storage.getPath('checkout/card')).toBe(slashPath);
  });

  it('returns null when a baseline does not exist', () => {
    const storage = new BaselineStorage(testDir);

    expect(storage.readBaseline('missing')).toBeNull();
  });

  it('propagates non-ENOENT filesystem errors', () => {
    const notADirectory = join(testDir, 'baseline-root');
    fs.writeFileSync(notADirectory, 'not a directory');
    const storage = new BaselineStorage(notADirectory);

    let operationError: unknown;
    try {
      storage.readBaseline('checkout');
    } catch (error) {
      operationError = error;
    }

    expect(operationError).toMatchObject({ code: 'ENOTDIR' });
  });
});
