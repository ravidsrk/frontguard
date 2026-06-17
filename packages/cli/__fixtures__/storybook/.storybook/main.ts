import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook 8 (Vite builder) configuration for the Frontguard fixture.
 *
 * Used by:
 *   - packages/cli/test/discovery/storybook.test.ts — served from a static
 *     prebuilt copy or via `npm run preview` against a real Storybook.
 *   - apps/docs — referenced in the integration page as a worked example.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx|js|jsx)'],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    // Disable autodocs entries — Frontguard skips `type === 'docs'`, but
    // keeping the fixture small makes the index easier to assert on.
    autodocs: false,
  },
  // staticDirs not needed for the fixture
};

export default config;
