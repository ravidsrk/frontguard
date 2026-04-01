/**
 * Plugin system for Frontguard.
 *
 * Plugins hook into pipeline lifecycle events to extend functionality
 * (e.g. Figma design compliance, Slack notifications, custom reporters).
 *
 * @module core/plugins
 */

import type {
  FrontguardConfig,
  ScreenshotResult,
  DiffResult,
  RunResult,
  Route,
} from './types.js';
import { logger as defaultLogger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Plugin Context
// ---------------------------------------------------------------------------

/**
 * Context object passed to plugin setup.
 *
 * Provides access to the resolved configuration, a logger, and a shared
 * metadata store that plugins can use to pass data between hooks.
 */
export interface PluginContext {
  /** The resolved Frontguard configuration for this run. */
  config: FrontguardConfig;

  /** Logger instance for plugin output. */
  logger: typeof defaultLogger;

  /**
   * Shared key-value metadata store.
   *
   * Plugins can attach arbitrary data here (e.g. Figma images keyed by
   * route path) and read it back in later hooks.
   */
  metadata: Map<string, unknown>;
}

// ---------------------------------------------------------------------------
// Plugin Interface
// ---------------------------------------------------------------------------

/**
 * Frontguard plugin interface.
 *
 * Plugins implement one or more lifecycle hooks. All hooks are optional
 * except `name`, which must be a unique identifier for the plugin.
 *
 * Hook signatures are kept flexible: the pipeline passes the relevant
 * data array and config directly. For richer context, use the `setup`
 * hook which receives the full `PluginContext`.
 */
export interface FrontguardPlugin {
  /** Unique plugin identifier (e.g. `'figma'`, `'slack'`). */
  name: string;

  /**
   * Called once before the pipeline starts.
   * Use for validation, authentication checks, and one-time setup.
   */
  setup?(ctx: PluginContext): Promise<void> | void;

  /**
   * Called before route discovery — can modify config.
   */
  beforeDiscover?(config: FrontguardConfig): FrontguardConfig | Promise<FrontguardConfig>;

  /**
   * Called after route discovery — can modify discovered routes.
   */
  afterDiscover?(routes: Route[], config: FrontguardConfig): Route[] | Promise<Route[]>;

  /**
   * Called before rendering — can modify routes or config.
   */
  beforeRender?(input: { routes: Route[]; config: FrontguardConfig }): { routes: Route[]; config: FrontguardConfig } | Promise<{ routes: Route[]; config: FrontguardConfig }>;

  /**
   * Called after all screenshots have been captured.
   *
   * Receives the full array of screenshot results and the plugin context.
   * Plugins may return a modified array or void (original is used).
   */
  afterRender?(
    screenshots: ScreenshotResult[],
    ctx: PluginContext,
  ): ScreenshotResult[] | Promise<ScreenshotResult[]> | void | Promise<void>;

  /**
   * Called after all pixel comparisons have completed.
   *
   * Receives the full array of diff results and the plugin context.
   * Plugins may return a modified array or void.
   */
  afterCompare?(
    diffs: DiffResult[],
    ctx: PluginContext,
  ): DiffResult[] | Promise<DiffResult[]> | void | Promise<void>;

  /**
   * Called after the entire pipeline run completes, before reporting.
   *
   * Receives the final RunResult and the plugin context.
   */
  afterRun?(result: RunResult, ctx: PluginContext): Promise<void> | void;

  /**
   * Called on pipeline error — can inspect or suppress errors.
   * Return `true` to suppress the error.
   */
  onError?(error: Error, stage: string): boolean | Promise<boolean> | void | Promise<void>;

  /**
   * Called once after the pipeline finishes (success or failure).
   * Use for cleanup (temp files, open connections, etc.).
   */
  teardown?(): Promise<void> | void;
}

// ---------------------------------------------------------------------------
// Plugin Manager
// ---------------------------------------------------------------------------

/**
 * Manages plugin registration and lifecycle hook execution.
 *
 * Wraps the pipeline's raw calls into the plugin interface, maintaining
 * a shared PluginContext for each plugin that supports it.
 */
export class PluginManager {
  private plugins: FrontguardPlugin[] = [];
  private context: PluginContext | null = null;

  /** Number of registered plugins. */
  get count(): number {
    return this.plugins.length;
  }

  /** Names of all registered plugins in registration order. */
  get names(): string[] {
    return this.plugins.map((p) => p.name);
  }

  /**
   * Register a plugin. Plugins are called in registration order.
   * Throws if a plugin with the same name is already registered.
   */
  register(plugin: FrontguardPlugin): void {
    if (this.plugins.some((p) => p.name === plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }
    this.plugins.push(plugin);
  }

  /**
   * Run the setup hook for all registered plugins.
   *
   * @param ctx - The PluginContext to pass to each plugin's setup hook
   */
  async setup(ctx: PluginContext): Promise<void> {
    this.context = ctx;

    for (const plugin of this.plugins) {
      if (plugin.setup) {
        await plugin.setup(this.context);
      }
    }
  }

  /**
   * Run a named hook on all registered plugins, sequentially.
   *
   * The return value of each hook replaces the first positional argument
   * for the next plugin in the chain — this enables value transforms like
   * route filtering, diff modification, etc.
   *
   * If no hook returns a value, the original first argument is returned
   * unchanged (pass-through).
   */
  async runHook(hook: string, ...args: unknown[]): Promise<any> {
    const currentArgs = [...args];

    for (const plugin of this.plugins) {
      const hookFn = (plugin as unknown as Record<string, unknown>)[hook];
      if (typeof hookFn === 'function') {
        const result = await hookFn.call(plugin, ...currentArgs);
        if (result !== undefined) {
          currentArgs[0] = result;
        }
      }
    }

    return currentArgs[0];
  }

  /**
   * Run the teardown hook for all registered plugins in **reverse** order.
   *
   * Reverse order ensures that plugins cleaned up in LIFO fashion —
   * the last plugin set up is the first to be torn down.
   */
  async teardown(): Promise<void> {
    const reversed = [...this.plugins].reverse();
    for (const plugin of reversed) {
      if (plugin.teardown) {
        try {
          await plugin.teardown();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          (this.context?.logger ?? defaultLogger).warn(
            `Plugin "${plugin.name}" teardown failed: ${msg}`,
          );
        }
      }
    }
  }

  /** Get the shared plugin context (available after setup). */
  getContext(): PluginContext | null {
    return this.context;
  }

  /** Get all registered plugins. */
  getPlugins(): readonly FrontguardPlugin[] {
    return this.plugins;
  }
}
