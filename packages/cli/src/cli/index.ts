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
import { loadConfig, detectFramework, generateDefaultConfig } from '../core/config.js';
import { runPipeline, updateBaselines } from '../core/pipeline.js';
import { runDoctor } from './doctor.js';
import { getFrameworkInfo } from '../templates/index.js';
import { generateGitHubActionsWorkflow } from '../templates/github-actions.js';
import { sendTelemetry, isTelemetryEnabled, type TelemetryEvent } from '../utils/telemetry.js';
import { ConsoleReporter } from '../report/console.js';
import { JSONReporter } from '../report/json.js';
import { HTMLReporter } from '../report/html.js';
import { logger, setLogLevel } from '../utils/logger.js';
import type { FrontguardConfig, Reporter, BrowserEngine } from '../core/types.js';
import { writeFileSync, readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

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
const VERSION = '0.1.0';

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
    .action(async (opts) => {
      try {
        const cwd = process.cwd();
        const format = opts.format as 'ts' | 'js' | 'json';

        // Detect framework
        logger.info('Detecting framework…');
        const framework = await detectFramework(cwd);
        if (framework) {
          logger.info(`Detected: ${framework}`);
        } else {
          logger.info('No specific framework detected — using defaults');
        }

        // Resolve framework metadata (port, dev command) for config + CI.
        const fwInfo = getFrameworkInfo(framework);

        // Determine file name
        const extensions: Record<string, string> = {
          ts: 'frontguard.config.ts',
          js: 'frontguard.config.js',
          json: 'frontguard.config.json',
        };
        const fileName = extensions[format] ?? 'frontguard.config.ts';
        const filePath = join(cwd, fileName);

        // Check if config already exists
        if (existsSync(filePath)) {
          logger.warn(`Config file already exists: ${fileName}`);
          logger.info('Delete it first if you want to regenerate.');
          exitCode = 1;
          return;
        }

        // Generate config content (baseUrl derived from framework default port)
        const content = generateDefaultConfig({
          framework,
          format,
        });

        writeFileSync(filePath, content, 'utf-8');
        logger.info(`✅ Created ${fileName}`);

        // Optionally generate a GitHub Actions workflow (--ci)
        if (opts.ci) {
          const workflowDir = join(cwd, '.github', 'workflows');
          const workflowPath = join(workflowDir, 'frontguard.yml');
          if (existsSync(workflowPath)) {
            logger.warn('.github/workflows/frontguard.yml already exists — skipping');
          } else {
            mkdirSync(workflowDir, { recursive: true });
            const workflow = generateGitHubActionsWorkflow({
              devCommand: `npm run dev`,
              port: fwInfo.defaultPort,
            });
            writeFileSync(workflowPath, workflow, 'utf-8');
            logger.info('✅ Created .github/workflows/frontguard.yml');
          }
        }

        // Update .gitignore
        const gitignorePath = join(cwd, '.gitignore');
        const entriesToAdd = ['auth.json', '.frontguard/', '.frontguard-debug/', 'frontguard-report/'];
        let gitignoreContent = '';

        if (existsSync(gitignorePath)) {
          gitignoreContent = readFileSync(gitignorePath, 'utf-8');
        }

        const newEntries: string[] = [];
        for (const entry of entriesToAdd) {
          if (!gitignoreContent.includes(entry)) {
            newEntries.push(entry);
          }
        }

        if (newEntries.length > 0) {
          const addition =
            (gitignoreContent.endsWith('\n') || gitignoreContent === '' ? '' : '\n') +
            '\n# Frontguard\n' +
            newEntries.join('\n') +
            '\n';
          appendFileSync(gitignorePath, addition, 'utf-8');
          logger.info(`Updated .gitignore with: ${newEntries.join(', ')}`);
        }

        // Print next steps
        logger.info('');
        logger.info('Next steps:');
        logger.info(`  1. Edit ${fileName} to set your baseUrl and routes`);
        logger.info('  2. Start your dev server (e.g. npm run dev)');
        logger.info('  3. Run: npx frontguard run');
        logger.info('');
        logger.info('On first run, Frontguard will capture baseline screenshots.');
        logger.info('On subsequent runs, it will compare against them and report changes.');

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
