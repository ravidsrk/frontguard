import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BaselineStorage } from '../src/storage.js';
import { diffTextSnapshot, normalizeTextSnapshot, recordTextSnapshots } from '../src/text-snapshot.js';

describe('text snapshot diff', () => {
  it('ignores one trailing newline and CRLF', () => {
    expect(normalizeTextSnapshot('a\r\nb\n')).toBe('a\nb');
    expect(diffTextSnapshot('a\r\nb\n', 'a\nb')).toBe('match');
    expect(diffTextSnapshot(null, 'a')).toBe('new');
    expect(diffTextSnapshot('a', 'b')).toBe('mismatch');
  });

  it('writes only the allowed sibling suffixes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fg-pw-text-'));
    try {
      const storage = new BaselineStorage(dir);
      const written = recordTextSnapshots(
        storage,
        'home',
        [{ kind: 'json', ext: '.json', body: '{"ok":true}\n' }],
        true,
      );
      expect(written).toEqual([{ kind: 'json', status: 'new', path: storage.textPath('home', '.json') }]);
      expect(storage.readText('home', '.json')).toBe('{"ok":true}');
      expect(() => storage.textPath('home', '.html')).toThrow('Unknown text snapshot');
      const compared = recordTextSnapshots(
        storage,
        'home',
        [{ kind: 'json', ext: '.json', body: '{"ok":false}' }],
        false,
      );
      expect(compared[0]?.status).toBe('mismatch');
      expect(storage.readText('home', '.json')).toBe('{"ok":true}');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
