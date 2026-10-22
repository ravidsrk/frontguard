import { defineConfig } from 'vitest/config';

const VITEST_COMMANDS = new Set(['run', 'watch', 'dev', 'related', 'list', 'bench']);

/** These select a subset of tests, so the full-package floors do not apply. */
const FILTER_FLAGS = new Set([
  '-t',
  '--testNamePattern',
  '--changed',
  '--shard',
  '--tagsFilter',
]);

/**
 * Flags whose next argv token is an option value, not a test file.
 * Names match `vitest run --help` for Vitest 5.0.5.
 */
const VALUE_FLAGS = new Set([
  '-r',
  '--root',
  '-c',
  '--config',
  '--dir',
  '--reporter',
  '--outputFile',
  '--mode',
  '--browser',
  '--pool',
  '--execArgv',
  '--vmMemoryLimit',
  '--maxWorkers',
  '--environment',
  '--sequence',
  '--testTimeout',
  '--hookTimeout',
  '--bail',
  '--retry',
  '--repeats',
  '--diff',
  '--exclude',
  '-p',
  '--project',
  '--slowTestThreshold',
  '--teardownTimeout',
  '--maxConcurrency',
  '--fsModuleCachePath',
  '--attachmentsDir',
  '--configLoader',
  '--experimental',
]);

const UPDATE_VALUES = new Set(['new', 'all', 'none', 'true', 'false']);
const SILENT_VALUES = new Set(['passed-only', 'true', 'false']);

function flagName(arg: string): string {
  const eq = arg.indexOf('=');
  return eq === -1 ? arg : arg.slice(0, eq);
}

function consumesOptionalValue(name: string, next: string): boolean {
  if ((name === '-u' || name === '--update') && UPDATE_VALUES.has(next)) return true;
  if (name === '--silent' && SILENT_VALUES.has(next)) return true;
  if (name === '--listTags' && next === 'json') return true;
  if (
    (name === '--api' || name === '--inspect' || name === '--inspectBrk') &&
    /^(\d+|[\w.-]+:\d+)$/.test(next)
  ) {
    return true;
  }
  return false;
}

/**
 * The floors apply to a full `vitest run` only. A file path, a test-name
 * pattern, a shard, a changed-only run, or a tag filter would otherwise be
 * measured against the whole src tree and fail even when those tests pass.
 * Space-separated option values, such as `--reporter verbose`, stay on the gate.
 */
export function coverageGateEnabled(argv: readonly string[]): boolean {
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') {
      return !args.slice(i + 1).some((rest) => !VITEST_COMMANDS.has(rest));
    }
    if (!arg.startsWith('-')) {
      if (!VITEST_COMMANDS.has(arg)) return false;
      continue;
    }
    const name = flagName(arg);
    if (FILTER_FLAGS.has(name)) return false;
    if (arg.includes('=')) continue;
    const next = args[i + 1];
    if (next === undefined || next.startsWith('-')) continue;
    if (VALUE_FLAGS.has(name) || name.startsWith('--coverage.') || consumesOptionalValue(name, next)) {
      i += 1;
    }
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
