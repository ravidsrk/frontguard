/**
 * The baseline gate must audit the URL capture opened. A hosted Ladle or
 * Histoire preview keeps its directory; a normal route does not.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginContext } from '../../src/core/plugins.js';
import type { FrontguardConfig, ScreenshotResult } from '../../src/core/types.js';

const goto = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('playwright', () => ({
  chromium: {
    launch: async () => ({
      newContext: async () => ({
        newPage: async () => ({ goto, waitForSelector: async () => undefined }),
        close: async () => undefined,
      }),
      close: async () => undefined,
    }),
  },
}));

vi.mock('@axe-core/playwright', () => ({
  default: class {
    analyze = async () => ({ violations: [], passes: [], incomplete: [] });
  },
}));

import { createAccessibilityPlugin } from '../../src/plugins/accessibility.js';

function shot(path: string, discoveredVia: 'ladle' | 'histoire' | 'config' | 'storybook'): ScreenshotResult {
  return {
    route: { path, discoveredVia },
    viewport: 1280,
    browser: 'chromium',
    buffer: Buffer.alloc(0),
    domSnapshot: '',
    consoleErrors: [],
    timestamp: 0,
    duration: 0,
  };
}

function context(baseUrl: string): PluginContext {
  return {
    config: { baseUrl } as FrontguardConfig,
    logger: { debug() {}, info() {}, warn() {}, error() {} } as unknown as PluginContext['logger'],
    metadata: new Map(),
  };
}

describe('accessibility audit URL', () => {
  beforeEach(() => {
    goto.mockClear();
  });

  it('audits a hosted Ladle or Histoire preview at the captured directory', async () => {
    const plugin = createAccessibilityPlugin({ failOnViolation: true });
    const ctx = context('https://example.com/components');
    await plugin.setup!(ctx);
    await plugin.afterRender!(
      [
        shot('/?story=control--first&mode=preview', 'ladle'),
        shot('/__sandbox.html?storyId=button&variantId=primary', 'histoire'),
      ],
      ctx,
    );

    expect(goto.mock.calls.map((call) => call[0])).toEqual([
      'https://example.com/components/?story=control--first&mode=preview',
      'https://example.com/components/__sandbox.html?storyId=button&variantId=primary',
    ]);
  });

  it('keeps a normal route and a Storybook iframe on the URL capture uses', async () => {
    const plugin = createAccessibilityPlugin();
    const ctx = context('https://example.com/components');
    await plugin.setup!(ctx);
    await plugin.afterRender!(
      [shot('/pricing', 'config'), shot('/iframe.html?id=button--primary', 'storybook')],
      ctx,
    );

    expect(goto.mock.calls.map((call) => call[0])).toEqual([
      'https://example.com/pricing',
      'https://example.com/iframe.html?id=button--primary',
    ]);
  });
});
