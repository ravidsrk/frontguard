import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.ts', '../../scripts/test/**/*.test.ts'],
    exclude: ['test/e2e/**'],
    testTimeout: 30000,
  },
});
