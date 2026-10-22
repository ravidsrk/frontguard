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
    expect(coverageGateEnabled(['node', 'vitest', 'run', '--testNamePattern=pixel'])).toBe(false);
  });
});
