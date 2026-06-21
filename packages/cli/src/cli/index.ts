/**
 * Frontguard CLI entry point.
 *
 * Commands:
 *   run               Run visual regression tests (default)
 *   init              Generate a starter config file
 *   update-baselines  Accept current screenshots as new baselines
 *   doctor            Diagnose environment readiness
 *
 * @module cli/index
 */

import { Command } from 'commander';
import { loadConfig } from '../core/config.js';
import { runPipeline, runJudgePipeline, updateBaselines } from '../core/pipeline.js';
import {
  installPlugin,
  uninstallPlugin,
  listInstalledPlugins,
  resolvePackageName,
  detectPackageManager,
} from '../core/plugin-registry.js';
import { runDoctor } from './doctor.js';
import { runInit } from './init.js';
import { maybeRunInDocker } from './run.js';
import { sendTelemetry, isTelemetryEnabled, type TelemetryEvent } from '../utils/telemetry.js';
import { ConsoleReporter } from '../report/console.js';
import { JSONReporter } from '../report/json.js';
import { HTMLReporter } from '../report/html.js';
import { logger, setLogLevel } from '../utils/logger.js';
import { FixPatternDB } from '../storage/fix-patterns.js';
import {
  createMonitorPlugin,
  createPollingController,
  runPollingLoop,
  readRecentHistory,
  formatHistoryTable,
} from '../plugins/monitor.js';
import type { FrontguardConfig, Reporter, BrowserEngine } from '../core/types.js';
import { writeFileSync } from 'node:fs';

// Global error handlers
process.on('unhandledRejection', (reason) => {
  console.error('[frontguard] Unhandled promise rejection:', reason instanceof Error ? reason.message : reason);
  process.exitCode = 1;
});

process.on('uncaughtException', (error) => {
  console.error('[frontguard] Uncaught exception:', error.message);
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Version (read from package.json at build time, fallback to hardcoded)
// ---------------------------------------------------------------------------
const VERSION = '0.2.2';

// ---------------------------------------------------------------------------
// Config Builder (merges CLI opts with config file)
// ---------------------------------------------------------------------------

export async function buildConfig(
  opts: Record<string, unknown>,
): Promise<FrontguardConfig> {
  // Load base config from file (or defaults)
  let config: FrontguardConfig;
  try {
    config = await loadConfig(opts.config as string | undefined);
  } catch (err) {
    // If no config file found and we have a URL, use sensible defaults
    if (opts.url) {
      config = {
        version: 1,
        baseUrl: opts.url as string,
        viewports: [375, 768, 1440],
        browsers: ['chromium'],
        threshold: 0.1,
        ignore: [],
        smartRender: true,
        workers: 4,
        pageTimeout: 30_000,
        maxHeight: 5_000,
        outputDir: './frontguard-report',
      };
    } else {
      throw err;
    }
  }

  // Merge CLI overrides

  if (opts.url && typeof opts.url === 'string') {
    config.baseUrl = opts.url;
  }

  if (opts.routes && typeof opts.routes === 'string') {
    config.routes = opts.routes
      .split(',')
      .map((r: string) => r.trim())
      .filter(Boolean);
  }

  if (opts.viewports && typeof opts.viewports === 'string') {
    config.viewports = opts.viewports
      .split(',')
      .map((v: string) => parseInt(v.trim(), 10))
      .filter((v: number) => !isNaN(v) && v > 0);
  }

  if (opts.browsers && typeof opts.browsers === 'string') {
    config.browsers = opts.browsers
      .split(',')
      .map((b: string) => b.trim())
      .filter(Boolean) as BrowserEngine[];
  }

  if (opts.threshold && typeof opts.threshold === 'string') {
    const parsed = parseFloat(opts.threshold);
    if (!isNaN(parsed)) {
      // If user passes a percentage (e.g. 5), convert to fraction (0.05)
      config.threshold = parsed > 1 ? parsed / 100 : parsed;
    }
  }

  if (opts.generateFixes) {
    config.generateFixes = true;
  }

  if (opts.verifyFixes) {
    config.generateFixes = true; // verification implies generation
    config.verifyFixes = true;
  }

  if (opts.fixSandbox && typeof opts.fixSandbox === 'string') {
    config.fixSandbox = opts.fixSandbox === 'daytona' ? 'daytona' : 'local';
  }

  // Validate baseUrl is set
  if (!config.baseUrl) {
    throw new Error(
      'No base URL specified. Provide one via:\n' +
        '  --url http://localhost:3000\n' +
        '  or set baseUrl in your frontguard config file\n' +
        '  Run `frontguard init` to create a config file.',
    );
  }

  return config;
}

// ---------------------------------------------------------------------------
// Reporter Factory
// ---------------------------------------------------------------------------

export function createReporter(format: string): Reporter {
  switch (format) {
    case 'json':
      return new JSONReporter();
    case 'console':
    default:
      return new ConsoleReporter();
  }
}

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

function formatFatalError(err: unknown): string {
  const error = err instanceof Error ? err : new Error(String(err));

  const lines: string[] = [];
  lines.push('');
  lines.push('╔══════════════════════════════════════════════════════════╗');
  lines.push('║                   FRONTGUARD ERROR                      ║');
  lines.push('╚══════════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`  ${error.message}`);

  // Provide actionable hints for common errors
  if (error.message.includes('ECONNREFUSED') || error.message.includes('Cannot reach')) {
    lines.push('');
    lines.push('  Hint: Is your dev server running?');
    lines.push('  Try: npm run dev (in another terminal)');
  } else if (error.message.includes('Config file not found') || error.message.includes('No base URL')) {
    lines.push('');
    lines.push('  Hint: Run `frontguard init` to create a config file,');
    lines.push('  or pass --url to specify the base URL directly.');
  } else if (error.message.includes('browserType.launch')) {
    lines.push('');
    lines.push('  Hint: Playwright browsers may not be installed.');
    lines.push('  Try: npx playwright install');
  }

  lines.push('');

  if (process.env.FRONTGUARD_DEBUG === '1' || process.env.DEBUG) {
    lines.push('Stack trace:');
    lines.push(error.stack ?? '(no stack)');
  } else {
    lines.push('  Set FRONTGUARD_DEBUG=1 for full stack trace.');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function main(argv?: string[]): Promise<number> {
  // --docker short-circuit: when present, re-execute the CLI inside the
  // pinned render image and skip the entire local code path. Done before
  // commander parses so we don't pay for config loading or plugin init.
  const dockerExit = await maybeRunInDocker(argv ?? process.argv);
  if (dockerExit !== null) {
    return dockerExit;
  }

  const program = new Command();

  program
    .name('frontguard')
    .description('AI-powered frontend visual regression testing')
    .version(VERSION)
    .option('--no-telemetry', 'Disable anonymous usage telemetry');

  /** Helper: emit a telemetry event, honoring --no-telemetry and config. */
  const emitTelemetry = async (
    event: TelemetryEvent,
    configEnabled?: boolean,
  ): Promise<void> => {
    // Commander stores --no-telemetry as opts.telemetry === false.
    const optOutFlag = program.opts().telemetry === false;
    if (!isTelemetryEnabled({ optOutFlag, configEnabled })) return;
    await sendTelemetry(event, { enabled: true });
  };

  // Track the exit code from command actions
  let exitCode = 0;

  // ---------------------------------------------------------------------------
  // Command: run (default)
  // ---------------------------------------------------------------------------

  program
    .command('run', { isDefault: true })
    .description('Run visual regression tests')
    .option('-u, --url <url>', 'Base URL to test')
    .option('-r, --routes <routes>', 'Comma-separated routes')
    .option('-v, --viewports <vp>', 'Comma-separated viewport widths')
    .option('-b, --browsers <br>', 'Comma-separated browsers')
    .option('-c, --config <path>', 'Config file path')
    .option('-o, --output <format>', 'Output format: console, json', 'console')
    .option('-t, --threshold <n>', 'Pixel diff threshold percentage (0-100)')
    .option('--verbose', 'Verbose output')
    .option('--debug', 'Debug output (includes Playwright traces)')
    .option('--update-baselines', 'Accept current screenshots as new baselines')
    .option('--generate-fixes', 'Generate AI-powered CSS fixes for regressions (requires AI)')
    .option('--verify-fixes', 'Verify generated fixes in a sandbox (implies --generate-fixes)')
    .option('--fix-sandbox <kind>', 'Sandbox for fix verification: local or daytona', 'local')
    .option('--mode <mode>', 'Run mode: compare (baseline diff) or judge (AI design eval, beta)', 'compare')
    .option('--experimental', 'Enable experimental features (required for --mode judge)')
    .option(
      '--docker',
      'Run the renderer inside the pinned frontguard/render Docker image for deterministic cross-OS baselines (build the image locally until the registry-publish release step lands: `docker build --platform linux/amd64 -t frontguard/render:latest packages/cli/docker`)',
    )
    .action(async (opts) => {
      try {
        // Set log level
        if (opts.debug) {
          setLogLevel('debug');
        } else if (opts.verbose) {
          setLogLevel('info');
        }

        // Load and merge config
        const config = await buildConfig(opts);

        // Create reporter
        const reporter = createReporter(opts.output);

        // Update baselines mode
        if (opts.updateBaselines) {
          logger.info('Updating baselines…');
          await updateBaselines(config, reporter);
          logger.info('✅ Baselines updated successfully');
          exitCode = 0;
          return;
        }

        // Model-as-judge mode (Task 8.4, experimental)
        if (opts.mode === 'judge') {
          if (!opts.experimental) {
            logger.error(
              '⚠️  Judge mode is experimental. Re-run with --experimental to enable it:\n' +
                '    frontguard run --mode judge --experimental',
            );
            exitCode = 2;
            return;
          }
          if (!config.ai) {
            logger.error(
              'Judge mode requires AI configuration. Add an `ai` block to your config ' +
                '(provider + model) and set the matching API key env var.',
            );
            exitCode = 2;
            return;
          }
          logger.warn('🧪 Judge mode (beta): evaluating against design intent — no baselines used.');
          const judgeResult = await runJudgePipeline(config, reporter);
          const js = judgeResult.summary;
          logger.info('');
          logger.info('─'.repeat(60));
          logger.info(
            `Judge results: ${js.total} judged, ${js.passed} passed, ` +
              `${js.regressions} failed, ${js.warnings} with warnings, ${js.errors} errors`,
          );
          logger.info('─'.repeat(60));
          if (js.errors > 0 && js.regressions === 0) {
            exitCode = 2;
          } else if (js.regressions > 0) {
            logger.error(`❌ ${js.regressions} screenshot(s) failed the design bar`);
            exitCode = 1;
          } else {
            logger.info('✅ All screenshots passed the design bar');
            exitCode = 0;
          }
          return;
        }

        // Run the pipeline
        logger.info(`Running Frontguard against ${config.baseUrl}`);
        const result = await runPipeline(config, reporter);

        // Generate HTML report
        try {
          const htmlReporter = new HTMLReporter();
          htmlReporter.onComplete(result);
        } catch (err) {
          logger.warn(
            `HTML report generation failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        // Print summary
        const { summary } = result;
        logger.info('');
        logger.info('─'.repeat(60));
        logger.info(
          `Results: ${summary.total} tested, ` +
            `${summary.passed} passed, ` +
            `${summary.regressions} regressions, ` +
            `${summary.warnings} warnings, ` +
            `${summary.newPages} new, ` +
            `${summary.errors} errors`,
        );
        logger.info(`Timing: ${result.timing.total}ms total`);
        logger.info('─'.repeat(60));

        // Exit code
        if (summary.errors > 0 && summary.regressions === 0) {
          // Errors in the tool itself, but no regressions found
          exitCode = 2;
        } else if (summary.regressions > 0) {
          logger.error(`❌ ${summary.regressions} regression(s) detected`);
          exitCode = 1;
        } else {
          logger.info('✅ No regressions detected');
          exitCode = 0;
        }

        // Anonymous telemetry (opt-out).
        await emitTelemetry(
          {
            command: 'run',
            version: VERSION,
            routes: new Set(result.diffs.map((d) => d.route.path)).size,
            regressions: summary.regressions,
            aiProvider: config.ai?.provider ?? 'none',
            antiFlake: (config.antiFlakeRenders ?? 1) > 1,
            durationMs: result.timing.total,
          },
          config.telemetry,
        );
      } catch (err) {
        logger.error(formatFatalError(err));
        exitCode = 2;
        await emitTelemetry({
          command: 'run',
          version: VERSION,
          errorType: err instanceof Error ? err.name : 'UnknownError',
        });
      }
    });

  // ---------------------------------------------------------------------------
  // Command: init
  // ---------------------------------------------------------------------------

  program
    .command('init')
    .description('Generate a starter Frontguard config file')
    .option('--format <format>', 'Config format: ts, js, json', 'ts')
    .option('-y, --yes', 'Skip prompts and use defaults (CI-friendly)')
    .option('--ci', 'Also generate a GitHub Actions workflow at .github/workflows/frontguard.yml')
    .option('--storybook', 'Force-emit a Storybook-aware config (auto-detected when .storybook/main.* exists)')
    .option('--no-storybook', 'Skip Storybook scaffolding even when .storybook/main.* is present')
    .option('--storybook-url <url>', 'Storybook URL to scaffold against', 'http://localhost:6006')
    .action(async (opts) => {
      try {
        const result = runInit({
          cwd: process.cwd(),
          format: opts.format as 'ts' | 'js' | 'json',
          yes: opts.yes as boolean | undefined,
          ci: opts.ci as boolean | undefined,
          storybook: opts.storybook as boolean | undefined,
          noStorybook: opts.storybook === false ? true : undefined,
          storybookUrl: opts.storybookUrl as string | undefined,
        });
        if (result.exitCode !== 0) {
          exitCode = result.exitCode;
          return;
        }
        await emitTelemetry({ command: 'init', version: VERSION });
      } catch (err) {
        logger.error(formatFatalError(err));
        exitCode = 2;
      }
    });

  // ---------------------------------------------------------------------------
  // Command: update-baselines
  // ---------------------------------------------------------------------------

  program
    .command('update-baselines')
    .description('Accept current screenshots as new baselines')
    .option('-u, --url <url>', 'Base URL to test')
    .option('-r, --routes <routes>', 'Comma-separated routes')
    .option('-c, --config <path>', 'Config file path')
    .option('--verbose', 'Verbose output')
    .option('--debug', 'Debug output')
    .action(async (opts) => {
      try {
        if (opts.debug) {
          setLogLevel('debug');
        } else if (opts.verbose) {
          setLogLevel('info');
        }

        const config = await buildConfig(opts);
        const reporter = new ConsoleReporter();

        logger.info('Updating baselines…');
        await updateBaselines(config, reporter);
        logger.info('✅ Baselines updated successfully');
        exitCode = 0;
      } catch (err) {
        logger.error(formatFatalError(err));
        exitCode = 2;
      }
    });

  // ---------------------------------------------------------------------------
  // Command: doctor
  // ---------------------------------------------------------------------------

  program
    .command('doctor')
    .description('Diagnose environment readiness (Node, Playwright, browsers, config, git)')
    .action(async () => {
      try {
        exitCode = await runDoctor(process.cwd());
        await emitTelemetry({ command: 'doctor', version: VERSION });
      } catch (err) {
        logger.error(formatFatalError(err));
        exitCode = 2;
      }
    });

  // ---------------------------------------------------------------------------
  // Command: monitor (Task 7.3) — run checks against live production URLs
  // ---------------------------------------------------------------------------

  program
    .command('monitor')
    .description('Monitor live production URLs for visual regressions')
    .option('-u, --url <urls>', 'Comma-separated URLs to monitor (overrides config)')
    .option('-c, --config <path>', 'Config file path')
    .option('-t, --threshold <n>', 'Alert threshold percentage (0-100)', '5')
    .option('--webhook <url>', 'Webhook URL for alerts (Slack, Discord, etc.)')
    .option('--history-dir <dir>', 'Directory to store run history', '.frontguard/monitor-history')
    .option('--interval <minutes>', 'Run repeatedly every N minutes (daemon mode)')
    .option('--watch', 'Continuously poll (local dev). Use --interval to set the period (default 1m)')
    .option('--history', 'Show recent stored monitoring history and exit (no checks run)')
    .option('--limit <n>', 'Number of history rows to show with --history', '20')
    .option('--once', 'Run a single check and exit (default)')
    .option('--verbose', 'Verbose output')
    .option('--debug', 'Debug output')
    .action(async (opts) => {
      try {
        if (opts.debug) setLogLevel('debug');
        else if (opts.verbose) setLogLevel('info');

        // ----- --history: print stored history and exit (no checks) -----
        if (opts.history) {
          const historyDir = opts.historyDir as string;
          const limit = Math.max(1, parseInt(opts.limit as string, 10) || 20);
          const records = readRecentHistory(historyDir, limit);
          logger.info(`📜 Recent monitoring history (${historyDir}):`);
          // Print the table to stdout so it can be piped/captured cleanly.
          console.log(formatHistoryTable(records));
          await emitTelemetry({ command: 'monitor', version: VERSION });
          exitCode = 0;
          return;
        }

        const urls = typeof opts.url === 'string'
          ? opts.url.split(',').map((u: string) => u.trim()).filter(Boolean)
          : undefined;

        const thresholdPct = parseFloat(opts.threshold);
        const alertThreshold = isNaN(thresholdPct)
          ? 0.05
          : thresholdPct > 1
            ? thresholdPct / 100
            : thresholdPct;

        const runOnce = async (): Promise<number> => {
          const config = await buildConfig({ ...opts, url: urls?.[0] ?? opts.url });
          const monitorUrls = urls ?? config.routes ?? [config.baseUrl];

          const monitorPlugin = createMonitorPlugin({
            urls: monitorUrls,
            alertThreshold,
            alerts: opts.webhook ? { webhook: opts.webhook as string } : undefined,
            historyDir: opts.historyDir as string,
          });
          config.plugins = [...(config.plugins ?? []), monitorPlugin];

          const reporter = new ConsoleReporter();
          logger.info(`🔍 Monitoring ${monitorUrls.length} URL(s)…`);
          const result = await runPipeline(config, reporter);
          const regressions = result.summary.regressions + result.summary.warnings;
          if (regressions > 0) {
            logger.error(`⚠ ${regressions} URL(s) exceeded the alert threshold`);
            return 1;
          }
          logger.info('✅ All monitored URLs within threshold');
          return 0;
        };

        const intervalMin = opts.interval ? parseInt(opts.interval as string, 10) : null;
        // --watch enters a continuous polling loop. When --interval is also
        // given it sets the watch period; otherwise default to 1 minute.
        const isLoop = (intervalMin && intervalMin > 0) || Boolean(opts.watch);

        if (isLoop) {
          const periodMin = intervalMin && intervalMin > 0 ? intervalMin : 1;
          const intervalMs = periodMin * 60_000;
          const mode = opts.watch ? 'watch' : 'daemon';
          logger.info(
            `Starting monitor ${mode} (every ${periodMin}m). Press Ctrl+C to stop.`,
          );

          const controller = createPollingController();

          // ----- Graceful shutdown on SIGINT/SIGTERM -----
          const onSignal = (signal: NodeJS.Signals): void => {
            logger.newline();
            logger.info(`Received ${signal} — shutting down monitor after current iteration…`);
            controller.stop();
          };
          const sigintHandler = (): void => onSignal('SIGINT');
          const sigtermHandler = (): void => onSignal('SIGTERM');
          process.on('SIGINT', sigintHandler);
          process.on('SIGTERM', sigtermHandler);

          try {
            await runPollingLoop(controller, {
              intervalMs,
              iterate: async () => {
                await runOnce();
              },
              onError: (err) =>
                logger.error(
                  `Monitor run failed: ${err instanceof Error ? err.message : String(err)}`,
                ),
            });
          } finally {
            process.removeListener('SIGINT', sigintHandler);
            process.removeListener('SIGTERM', sigtermHandler);
          }

          logger.info('👋 Monitor stopped.');
          exitCode = 0;
        } else {
          exitCode = await runOnce();
        }

        await emitTelemetry({ command: 'monitor', version: VERSION });
      } catch (err) {
        logger.error(formatFatalError(err));
        exitCode = 2;
      }
    });

  // ---------------------------------------------------------------------------
  // Commands: accept-fix / reject-fix / export-patterns (Task 4.4)
  // ---------------------------------------------------------------------------

  const withPatternDB = async (fn: (db: FixPatternDB) => number): Promise<void> => {
    const db = new FixPatternDB();
    const ok = await db.open();
    if (!ok) {
      logger.error(
        'Fix-pattern database is unavailable. Install the optional dependency: npm install better-sqlite3',
      );
      exitCode = 2;
      return;
    }
    try {
      exitCode = fn(db);
    } finally {
      db.close();
    }
  };

  program
    .command('accept-fix <id>')
    .description('Mark a suggested fix as accepted (improves future suggestions)')
    .action(async (id: string) => {
      await withPatternDB((db) => {
        const found = db.setAccepted(id, true);
        if (found) {
          logger.info(`✅ Fix ${id} marked as accepted`);
          return 0;
        }
        logger.error(`No fix pattern found with id ${id}`);
        return 1;
      });
    });

  program
    .command('reject-fix <id>')
    .description('Mark a suggested fix as rejected (negative training signal)')
    .action(async (id: string) => {
      await withPatternDB((db) => {
        const found = db.setAccepted(id, false);
        if (found) {
          logger.info(`🚫 Fix ${id} marked as rejected`);
          return 0;
        }
        logger.error(`No fix pattern found with id ${id}`);
        return 1;
      });
    });

  program
    .command('export-patterns')
    .description('Export the local fix-pattern database as JSON (shareable)')
    .option('-o, --output <path>', 'Write JSON to a file instead of stdout')
    .action(async (opts: { output?: string }) => {
      await withPatternDB((db) => {
        const patterns = db.exportAll();
        const json = JSON.stringify({ version: 1, patterns }, null, 2);
        if (opts.output) {
          writeFileSync(opts.output, json, 'utf8');
          logger.info(`Exported ${patterns.length} pattern(s) to ${opts.output}`);
        } else {
          process.stdout.write(json + '\n');
        }
        return 0;
      });
    });

  // ---------------------------------------------------------------------------
  // Command: plugin (Task 8.5) — install / list / uninstall marketplace plugins
  // ---------------------------------------------------------------------------

  const pluginCmd = program
    .command('plugin')
    .description('Manage Frontguard plugins from the npm registry');

  pluginCmd
    .command('install <name>')
    .alias('add')
    .description('Install a Frontguard plugin (e.g. "slack" → frontguard-plugin-slack)')
    .action(async (name: string) => {
      try {
        const pm = detectPackageManager();
        const target = resolvePackageName(name);
        logger.info(`Installing ${target} with ${pm}…`);
        const { packageName } = await installPlugin(name, { pm });
        logger.info(`✅ Installed ${packageName}`);
        logger.info(
          `Add it to your config:\n` +
            `  import plugin from '${packageName}';\n` +
            `  export default { plugins: [plugin()] };`,
        );
        exitCode = 0;
        await emitTelemetry({ command: 'plugin-install', version: VERSION });
      } catch (err) {
        logger.error(formatFatalError(err));
        exitCode = 2;
      }
    });

  pluginCmd
    .command('uninstall <name>')
    .alias('remove')
    .description('Uninstall a Frontguard plugin')
    .action(async (name: string) => {
      try {
        const { packageName } = await uninstallPlugin(name);
        logger.info(`✅ Uninstalled ${packageName}`);
        exitCode = 0;
      } catch (err) {
        logger.error(formatFatalError(err));
        exitCode = 2;
      }
    });

  pluginCmd
    .command('list')
    .alias('ls')
    .description('List installed Frontguard plugins')
    .action(async () => {
      try {
        const installed = listInstalledPlugins();
        if (installed.length === 0) {
          logger.info('No Frontguard plugins installed.');
          logger.info('Browse plugins on npm: https://www.npmjs.com/search?q=frontguard-plugin');
          exitCode = 0;
          return;
        }
        logger.info(`Installed plugins (${installed.length}):`);
        for (const p of installed) {
          const ver = p.version ? `@${p.version}` : '';
          const desc = p.description ? ` — ${p.description}` : '';
          logger.info(`  • ${p.shortName} (${p.packageName}${ver})${desc}`);
        }
        exitCode = 0;
      } catch (err) {
        logger.error(formatFatalError(err));
        exitCode = 2;
      }
    });

  // ---------------------------------------------------------------------------
  // Parse & Execute
  // ---------------------------------------------------------------------------

  await program.parseAsync(argv ?? process.argv);
  return exitCode;
}

// ---------------------------------------------------------------------------
// Auto-run when executed directly (not imported)
// ---------------------------------------------------------------------------

main(process.argv).then((code) => process.exit(code)).catch((err) => {
  console.error('[frontguard] Fatal:', err instanceof Error ? err.message : err);
  process.exit(2);
});
