/**
 * Frontguard config for the Storybook fixture.
 *
 * Boot Storybook (`npm run storybook`) on port 6006, then:
 *
 *   npx -p @frontguard/cli frontguard run --config packages/cli/__fixtures__/storybook/frontguard.config.ts
 */
export default {
  version: 1,
  baseUrl: 'http://localhost:6006',
  viewports: [375, 768, 1440],
  browsers: ['chromium'],
  threshold: 0.01,
  ignore: [],
  smartRender: true,
  workers: 4,
  pageTimeout: 30_000,
  maxHeight: 5_000,
  outputDir: './frontguard-report',
  storybook: {
    url: 'http://localhost:6006',
    stories: ['**'],
    projectRoot: import.meta.dirname,
  },
};
