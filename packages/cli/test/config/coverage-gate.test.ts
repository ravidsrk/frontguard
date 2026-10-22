import { coverageGateEnabled } from '../../vitest.config.js';

describe('coverage gate', () => {
  it('enforces an unfiltered vitest run', () => {
    expect(coverageGateEnabled(['node', 'vitest', 'run', '--pool=forks', '--exclude=test/e2e/**'])).toBe(
      true,
    );
  });

  it('does not enforce a file filter', () => {
    expect(
      coverageGateEnabled(['node', 'vitest', 'run', '--pool=forks', 'test/diff/pixel.test.ts']),
    ).toBe(false);
  });

  it('does not enforce a test-name filter', () => {
    expect(coverageGateEnabled(['node', 'vitest', 'run', '-t', 'pixel'])).toBe(false);
    expect(coverageGateEnabled(['node', 'vitest', 'run', '--testNamePattern', 'pixel'])).toBe(false);
    expect(coverageGateEnabled(['node', 'vitest', 'run', '--testNamePattern=pixel'])).toBe(false);
  });

  it('keeps the gate when an option value is a separate argument', () => {
    expect(
      coverageGateEnabled([
        'node',
        'vitest',
        'run',
        '--pool=forks',
        '--exclude=test/e2e/**',
        '--reporter',
        'verbose',
      ]),
    ).toBe(true);
    expect(coverageGateEnabled(['node', 'vitest', 'run', '--pool', 'forks'])).toBe(true);
    expect(coverageGateEnabled(['node', 'vitest', 'run', '--update', 'all'])).toBe(true);
  });

  it('does not treat a file after an optional flag as that flag\'s value', () => {
    expect(coverageGateEnabled(['node', 'vitest', 'run', '--update', 'test/diff/pixel.test.ts'])).toBe(
      false,
    );
  });

  it('does not enforce a shard, a changed-only run, or a tag filter', () => {
    expect(coverageGateEnabled(['node', 'vitest', 'run', '--shard', '1/2'])).toBe(false);
    expect(coverageGateEnabled(['node', 'vitest', 'run', '--changed', 'origin/main'])).toBe(false);
    expect(coverageGateEnabled(['node', 'vitest', 'run', '--tagsFilter', 'smoke'])).toBe(false);
  });
});
