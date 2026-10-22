import { defineConfig } from 'vitest/config';

const VITEST_COMMANDS = new Set(['run', 'watch', 'dev', 'related', 'list', 'bench']);

/**
 * The floors apply to a full `vitest run` only. A file path or a test-name
 * filter would otherwise be measured against the whole src tree and fail
 * even when those tests pass.
 */
export function coverageGateEnabled(argv: readonly string[]): boolean {
  for (const arg of argv.slice(2)) {
    if (arg === '-t' || arg === '--testNamePattern' || arg.startsWith('--testNamePattern=')) {
      return false;
    }
    if (!arg.startsWith('-') && !VITEST_COMMANDS.has(arg)) return false;
  }
  return true;
}

// Floors are the lower v8 total measured for each metric on 2026-10-22.
// macOS Node 22.23.2 and Node 24.20.0: statements 79.32 (6358/8015),
// branches 70.33 (3773/5364), functions 82.99 (893/1076), lines 81.02 (5823/7187).
// GitHub ubuntu Node 22 and Node 24: statements 79.35 (6360/8015),
// branches 70.24 (3768/5364), functions 82.99 (893/1076), lines 81.04 (5825/7187).
// External research did not supply a coverage number. This config measures
// packages/cli source only. Undeployed cloud-api is not included, and the
// experimental judge's model quality is not a separate gate.
const gate = coverageGateEnabled(process.argv);

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts', '../../scripts/test/**/*.test.ts'],
    exclude: ['test/e2e/**'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      enabled: gate,
      include: ['src/**/*.ts'],
      reporter: ['text-summary'],
      ...(gate
        ? {
            thresholds: {
              statements: 79.32,
              branches: 70.24,
              functions: 82.99,
              lines: 81.02,
            },
          }
        : {}),
    },
  },
});
