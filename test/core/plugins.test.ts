import { describe, it, expect } from 'vitest';
import { PluginManager } from '../../src/core/plugins.js';
import type { FrontguardPlugin, PluginContext } from '../../src/core/plugins.js';
import type { Route, FrontguardConfig, DiffResult } from '../../src/core/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides?: Partial<PluginContext>): PluginContext {
  return {
    config: {
      version: 1,
      baseUrl: 'http://localhost:3000',
      viewports: [1440],
      browsers: ['chromium'],
      threshold: 0.1,
      ignore: [],
      smartRender: true,
      workers: 1,
      pageTimeout: 30_000,
      maxHeight: 5_000,
      outputDir: './out',
    },
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    metadata: new Map(),
    ...overrides,
  };
}

function makePlugin(name: string, hooks?: Partial<FrontguardPlugin>): FrontguardPlugin {
  return { name, ...hooks };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PluginManager', () => {
  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------

  describe('register', () => {
    it('registers a plugin', () => {
      const pm = new PluginManager();
      pm.register(makePlugin('alpha'));

      expect(pm.count).toBe(1);
      expect(pm.names).toEqual(['alpha']);
    });

    it('throws on duplicate plugin name', () => {
      const pm = new PluginManager();
      pm.register(makePlugin('alpha'));

      expect(() => pm.register(makePlugin('alpha'))).toThrowError(
        'Plugin "alpha" is already registered',
      );
    });

    it('allows multiple plugins with different names', () => {
      const pm = new PluginManager();
      pm.register(makePlugin('alpha'));
      pm.register(makePlugin('beta'));

      expect(pm.count).toBe(2);
      expect(pm.names).toEqual(['alpha', 'beta']);
    });
  });

  // -----------------------------------------------------------------------
  // Hook execution order
  // -----------------------------------------------------------------------

  describe('hook execution order', () => {
    it('calls hooks in registration order', async () => {
      const order: string[] = [];

      const pm = new PluginManager();
      pm.register(
        makePlugin('first', {
          afterDiscover: async (routes: Route[]) => {
            order.push('first');
            return routes;
          },
        }),
      );
      pm.register(
        makePlugin('second', {
          afterDiscover: async (routes: Route[]) => {
            order.push('second');
            return routes;
          },
        }),
      );

      const config = makeContext().config;
      await pm.runHook('afterDiscover', [] as Route[], config);

      expect(order).toEqual(['first', 'second']);
    });
  });

  // -----------------------------------------------------------------------
  // Hook can modify routes (afterDiscover)
  // -----------------------------------------------------------------------

  describe('afterDiscover', () => {
    it('plugin can add routes', async () => {
      const pm = new PluginManager();
      pm.register(
        makePlugin('add-route', {
          afterDiscover: async (routes: Route[]) => {
            return [...routes, { path: '/injected', label: 'Injected' }];
          },
        }),
      );

      const config = makeContext().config;
      const initial: Route[] = [{ path: '/', label: 'Home' }];
      const result = await pm.runHook('afterDiscover', initial, config);

      expect(result).toHaveLength(2);
      expect(result[1].path).toBe('/injected');
    });

    it('multiple plugins chain modifications', async () => {
      const pm = new PluginManager();
      pm.register(
        makePlugin('add-a', {
          afterDiscover: async (routes: Route[]) => {
            return [...routes, { path: '/a' }];
          },
        }),
      );
      pm.register(
        makePlugin('add-b', {
          afterDiscover: async (routes: Route[]) => {
            return [...routes, { path: '/b' }];
          },
        }),
      );

      const config = makeContext().config;
      const result = await pm.runHook('afterDiscover', [] as Route[], config);

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.path)).toEqual(['/a', '/b']);
    });
  });

  // -----------------------------------------------------------------------
  // Hook can modify diffs (afterCompare)
  // -----------------------------------------------------------------------

  describe('afterCompare', () => {
    it('plugin can modify diff results', async () => {
      const pm = new PluginManager();
      pm.register(
        makePlugin('annotate', {
          afterCompare: async (diffs: DiffResult[]) => {
            return diffs.map((d) => ({
              ...d,
              error: 'annotated-by-plugin',
            }));
          },
        }),
      );

      const config = makeContext().config;
      const initial: DiffResult[] = [
        {
          route: { path: '/' },
          viewport: 1440,
          browser: 'chromium',
          status: 'pass',
          diffPercentage: 0,
        },
      ];

      const result = await pm.runHook('afterCompare', initial, config);
      expect(result[0].error).toBe('annotated-by-plugin');
    });
  });

  // -----------------------------------------------------------------------
  // Teardown called in reverse order
  // -----------------------------------------------------------------------

  describe('teardown', () => {
    it('calls teardown in reverse registration order', async () => {
      const order: string[] = [];

      const pm = new PluginManager();
      pm.register(
        makePlugin('first', {
          teardown: async () => {
            order.push('first');
          },
        }),
      );
      pm.register(
        makePlugin('second', {
          teardown: async () => {
            order.push('second');
          },
        }),
      );
      pm.register(
        makePlugin('third', {
          teardown: async () => {
            order.push('third');
          },
        }),
      );

      await pm.teardown();

      expect(order).toEqual(['third', 'second', 'first']);
    });
  });

  // -----------------------------------------------------------------------
  // Missing hooks are skipped (no error)
  // -----------------------------------------------------------------------

  describe('missing hooks', () => {
    it('skips plugins that do not implement a hook', async () => {
      const pm = new PluginManager();
      pm.register(makePlugin('empty'));
      pm.register(makePlugin('also-empty'));

      const config = makeContext().config;
      const routes: Route[] = [{ path: '/' }];

      // Should not throw — hooks are optional
      const result = await pm.runHook('afterDiscover', routes, config);
      expect(result).toEqual(routes);
    });

    it('skips non-existent hooks gracefully', async () => {
      const pm = new PluginManager();
      pm.register(makePlugin('a'));

      const result = await pm.runHook('nonExistentHook', 42);
      expect(result).toBe(42);
    });
  });

  // -----------------------------------------------------------------------
  // setup() lifecycle
  // -----------------------------------------------------------------------

  describe('setup', () => {
    it('calls setup on all plugins with context', async () => {
      const received: PluginContext[] = [];

      const pm = new PluginManager();
      pm.register(
        makePlugin('a', {
          setup: async (ctx) => {
            received.push(ctx);
          },
        }),
      );
      pm.register(
        makePlugin('b', {
          setup: async (ctx) => {
            received.push(ctx);
          },
        }),
      );

      const ctx = makeContext();
      await pm.setup(ctx);

      expect(received).toHaveLength(2);
      expect(received[0]).toBe(ctx);
      expect(received[1]).toBe(ctx);
    });
  });

  // -----------------------------------------------------------------------
  // onError can suppress errors
  // -----------------------------------------------------------------------

  describe('onError', () => {
    it('onError hook can suppress errors by returning true', async () => {
      const pm = new PluginManager();
      pm.register(
        makePlugin('suppress', {
          onError: async (_error: Error, _stage: string) => {
            return true;
          },
        }),
      );

      const error = new Error('test error');
      const result = await pm.runHook('onError', error, 'render');

      // The hook returned true, which becomes the threaded value
      expect(result).toBe(true);
    });

    it('onError hook that returns void does not suppress', async () => {
      const pm = new PluginManager();
      pm.register(
        makePlugin('observer', {
          onError: async (_error: Error, _stage: string) => {
            // Just observe, don't suppress
          },
        }),
      );

      const error = new Error('test error');
      const result = await pm.runHook('onError', error, 'render');

      // undefined return → original value preserved
      expect(result).toBe(error);
    });

    it('multiple onError hooks — last one wins', async () => {
      const order: string[] = [];

      const pm = new PluginManager();
      pm.register(
        makePlugin('observer', {
          onError: async () => {
            order.push('observer');
            // Returns undefined → doesn't change value
          },
        }),
      );
      pm.register(
        makePlugin('suppressor', {
          onError: async () => {
            order.push('suppressor');
            return true;
          },
        }),
      );

      const error = new Error('oops');
      const result = await pm.runHook('onError', error, 'compare');

      expect(order).toEqual(['observer', 'suppressor']);
      expect(result).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // beforeRender hook
  // -----------------------------------------------------------------------

  describe('beforeRender', () => {
    it('can modify both routes and config', async () => {
      const pm = new PluginManager();
      pm.register(
        makePlugin('modifier', {
          beforeRender: async (input: { routes: Route[]; config: FrontguardConfig }) => {
            return {
              routes: input.routes.filter((r) => r.path !== '/skip'),
              config: { ...input.config, workers: 8 },
            };
          },
        }),
      );

      const config = makeContext().config;
      const routes: Route[] = [{ path: '/' }, { path: '/skip' }, { path: '/keep' }];
      const result = await pm.runHook('beforeRender', { routes, config });

      expect(result.routes).toHaveLength(2);
      expect(result.routes.map((r: Route) => r.path)).toEqual(['/', '/keep']);
      expect(result.config.workers).toBe(8);
    });
  });
});
