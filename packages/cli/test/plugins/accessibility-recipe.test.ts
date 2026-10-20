import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { configSchema } from '../../src/core/config.js';
import { PluginManager, type PluginContext } from '../../src/core/plugins.js';
import type { FrontguardConfig, ScreenshotResult } from '../../src/core/types.js';
import * as plugins from '../../src/plugins/index.js';
import { logger } from '../../src/utils/logger.js';

vi.mock('@axe-core/playwright', () => ({
  default: class {
    async analyze() {
      return { violations: [{
        id: 'color-contrast', impact: 'serious', description: 'Insufficient contrast',
        help: 'Increase contrast', helpUrl: 'https://example.test/contrast', nodes: [],
      }] };
    }
  },
}));

// Exercise the real plugin and manager with deterministic audit evidence,
// rather than requiring a browser or network to make an accessibility mistake.
vi.mock('playwright', () => ({ chromium: {
  launch: async () => ({
    newContext: async () => ({
      newPage: async () => ({ goto: async () => {} }),
      close: async () => {},
    }),
    close: async () => {},
  }),
} }));

describe('documented accessibility recipes', () => {
  it.each(['README.md', 'packages/cli/README.md'])('%s fails on a serious audit finding', async (file) => {
    const root = fileURLToPath(new URL('../../../../', import.meta.url));
    const text = readFileSync(`${root}/${file}`, 'utf8');
    const example = [...text.matchAll(/```(?:typescript|ts)\n([\s\S]*?)```/g)]
      .map((match) => match[1]).find((code) => code.includes('createAccessibilityPlugin'));
    expect(example).toBeDefined();
    const compiled = ts.transpileModule(example!, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
    const exported = { default: undefined as unknown };
    new Function('require', 'exports', compiled.outputText)((name: string) => {
      if (name !== '@frontguard/cli/plugins') throw new Error(`Unexpected recipe import: ${name}`);
      return plugins;
    }, exported);
    const config = configSchema.parse(exported.default) as FrontguardConfig;
    const plugin = config.plugins?.find((candidate) => candidate.name === 'accessibility');
    expect(plugin).toBeDefined();
    const manager = new PluginManager();
    manager.register(plugin!);
    const ctx: PluginContext = { config, logger, metadata: new Map() };
    await manager.setup(ctx);
    const screenshots = [{ route: { path: '/' }, viewport: 1440, browser: 'chromium' }] as ScreenshotResult[];
    await expect(manager.runHook('afterRender', screenshots, ctx))
      .rejects.toThrow('Accessibility check failed: 1 violation(s)');
    await manager.teardown();
  });
});
