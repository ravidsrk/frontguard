import type { FrontguardConfig } from './src/core/types.js';

/**
 * Dogfooding config — tests the Frontguard documentation site itself.
 */
export default {
  baseUrl: 'http://localhost:5173',
  routes: [
    '/',
    '/guide/getting-started',
    '/guide/what-is-frontguard',
    '/config/',
  ],
  viewports: [375, 1440],
  browsers: ['chromium'],
  threshold: 0.01,
  outputDir: '.frontguard',
  ai: {
    provider: 'openai',
    model: 'gpt-4o',
  },
} satisfies Partial<FrontguardConfig>;
