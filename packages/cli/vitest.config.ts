import { defineConfig } from 'vitest/config';

// Floors are the v8 totals measured on this tree on 2026-10-22, on Node 22.23.2
// and Node 24.20.0: statements 79.32 (6358/8015), branches 70.33 (3773/5364),
// functions 82.99 (893/1076), lines 81.02 (5823/7187). External research did
// not supply a coverage number. This config measures packages/cli source only.
// Undeployed cloud-api is not included, and the experimental judge's model
// quality is not a separate gate.
export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts', '../../scripts/test/**/*.test.ts'],
    exclude: ['test/e2e/**'],
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      enabled: true,
      include: ['src/**/*.ts'],
      reporter: ['text-summary'],
      thresholds: {
        statements: 79.32,
        branches: 70.33,
        functions: 82.99,
        lines: 81.02,
      },
    },
  },
});
