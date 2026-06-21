import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['test/e2e/**/*.test.ts'],
    timeout: 60000,
    // Run e2e files serially: ts-config-loader rebuilds dist/ in its beforeAll,
    // which races docker-build packing dist/ when files run in parallel (the
    // half-written CLI then fails `frontguard --version` with exit 127).
    fileParallelism: false,
  },
});
