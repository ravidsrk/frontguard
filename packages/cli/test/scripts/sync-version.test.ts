import { describe, expect, it } from 'vitest';
import { applyRequiredEdits } from '../../../../scripts/sync-version-core.js';

describe('sync-version required targets', () => {
  it('fails when a configured version target disappears', () => {
    expect(() =>
      applyRequiredEdits('fixture.ts', 'export const OTHER = "value";', [
        {
          find: /CLI_VERSION = '[^']*';/g,
          replace: "CLI_VERSION = '1.2.3';",
          label: 'shared CLI version',
          expected: 1,
        },
      ]),
    ).toThrow('fixture.ts: shared CLI version matched 0 time(s); expected 1');
  });

  it('fails when a target appears more often than expected', () => {
    expect(() =>
      applyRequiredEdits('fixture.yml', 'version: old\nversion: old\n', [
        {
          find: /version: \w+/g,
          replace: 'version: 1.2.3',
          label: 'manifest version',
          expected: 1,
        },
      ]),
    ).toThrow('fixture.yml: manifest version matched 2 time(s); expected 1');
  });
});
