import type { Preview } from '@storybook/react';

/**
 * Storybook 8 preview parameters for the Frontguard fixture.
 *
 * The `frontguard` parameter block is read by Frontguard's discovery
 * adapter (`packages/cli/src/discovery/storybook.ts`) — per-story overrides
 * stack on top of these globals.
 */
const preview: Preview = {
  parameters: {
    layout: 'centered',
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#0a0a0a' },
      ],
    },
    // Global Frontguard defaults — individual stories can override.
    frontguard: {
      // Mirrors the Frontguard global default; declared here for visibility.
      viewports: [375, 768, 1440],
    },
  },
};

export default preview;
