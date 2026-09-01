/**
 * `frontguard init` command implementation.
 *
 * Generates a starter config file. When a `.storybook/main.{ts,js,mjs,cjs}`
 * file is present in the project, the emitted config additionally includes
 * a `storybook` block so baseline updates capture every story.
 *
 * Extracted from `cli/index.ts` so it can be unit tested without spawning
 * the CLI process.
 *
 * @module cli/init
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { detectFramework, generateDefaultConfig } from '../core/config.js';
import {
  generateGitHubActionsWorkflow,
  type PackageManager,
} from '../templates/github-actions.js';
import { getFrameworkInfo } from '../templates/index.js';
import { logger } from '../utils/logger.js';

/** Storybook config filenames init looks for, in order. */
const STORYBOOK_CONFIG_FILES = [
  '.storybook/main.ts',
  '.storybook/main.mts',
  '.storybook/main.js',
  '.storybook/main.mjs',
  '.storybook/main.cjs',
] as const;

/** Default Storybook dev-server URL — the canonical SB default. */
export const DEFAULT_STORYBOOK_URL = 'http://localhost:6006';

const PACKAGE_MANAGER_LOCKFILES: Record<PackageManager, readonly string[]> = {
  npm: ['package-lock.json'],
  pnpm: ['pnpm-lock.yaml'],
  yarn: ['yarn.lock'],
  bun: ['bun.lock', 'bun.lockb'],
};

interface CiWorkflowConfig {
  packageManager: PackageManager;
  lockfile: string;
  devScript: string;
}

type CiWorkflowResolution =
  | { config: CiWorkflowConfig }
  | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function formatScriptList(scripts: readonly string[]): string {
  const quoted = scripts.map((script) => `"${script}"`);
  if (quoted.length <= 1) return quoted[0] ?? '';
  return `${quoted.slice(0, -1).join(', ')} or ${quoted.at(-1)}`;
}

function resolveCiWorkflowConfig(
  cwd: string,
  framework: string | null,
  useStorybook: boolean,
): CiWorkflowResolution {
  const packagePath = join(cwd, 'package.json');
  if (!existsSync(packagePath)) {
    return {
      error: 'Cannot generate CI workflow: package.json was not found.',
    };
  }

  let pkg: Record<string, unknown>;
  try {
    const parsed = JSON.parse(readFileSync(packagePath, 'utf-8')) as unknown;
    if (!isRecord(parsed)) throw new Error('package.json must contain an object');
    pkg = parsed;
  } catch {
    return {
      error: 'Cannot generate CI workflow: package.json is not valid JSON.',
    };
  }

  const expectedScripts = useStorybook
    ? ['storybook']
    : getFrameworkInfo(framework).ciScripts;
  const scripts = isRecord(pkg.scripts) ? pkg.scripts : {};
  const devScript = expectedScripts.find(
    (script) => typeof scripts[script] === 'string' && scripts[script].trim() !== '',
  );
  if (!devScript) {
    const target = useStorybook ? 'Storybook' : (framework ?? 'this project');
    return {
      error:
        `Cannot generate CI workflow: package.json needs a non-empty ` +
        `${formatScriptList(expectedScripts)} script to start ${target}.`,
    };
  }

  const detectedManagers: Array<{
    packageManager: PackageManager;
    lockfile: string;
  }> = [];
  for (const packageManager of Object.keys(PACKAGE_MANAGER_LOCKFILES) as PackageManager[]) {
    const lockfile = PACKAGE_MANAGER_LOCKFILES[packageManager].find((candidate) =>
      existsSync(join(cwd, candidate)),
    );
    if (lockfile) detectedManagers.push({ packageManager, lockfile });
  }

  if (detectedManagers.length === 0) {
    return {
      error:
        'Cannot generate CI workflow: no supported lockfile found ' +
        '(package-lock.json, pnpm-lock.yaml, yarn.lock, bun.lock, or bun.lockb).',
    };
  }

  const packageManagerHint =
    typeof pkg.packageManager === 'string'
      ? (/^(npm|pnpm|yarn|bun)(?:@|$)/.exec(pkg.packageManager)?.[1] as
          | PackageManager
          | undefined)
      : undefined;
  const selected = packageManagerHint
    ? detectedManagers.find(({ packageManager }) => packageManager === packageManagerHint)
    : detectedManagers.length === 1
      ? detectedManagers[0]
      : undefined;

  if (!selected) {
    return {
      error:
        'Cannot generate CI workflow: multiple package-manager lockfiles found. ' +
        'Remove stale lockfiles or set package.json "packageManager" to select one.',
    };
  }

  return { config: { ...selected, devScript } };
}

/**
 * Detects whether the directory `cwd` looks like a Storybook project.
 *
 * Heuristic: presence of any of {@link STORYBOOK_CONFIG_FILES}. Returns the
 * relative path of the first match (so the CLI can name it in user output)
 * or `null` when none exists.
 */
export function detectStorybook(cwd: string): string | null {
  for (const rel of STORYBOOK_CONFIG_FILES) {
    if (existsSync(join(cwd, rel))) return rel;
  }
  return null;
}

/**
 * Inject a `storybook: { url, stories: ['**'] }` block into a generated
 * config string. Operates on the *string* output of {@link generateDefaultConfig}
 * to keep the scaffolding fully declarative — no runtime evaluation of the
 * template needed.
 *
 * The block is inserted before the closing `}` of the config object. Falls
 * back to returning the original string unchanged if the structure is
 * unrecognised (e.g. the user picked `json` format — handled separately).
 */
export function injectStorybookBlock(
  configSource: string,
  format: 'ts' | 'js' | 'json',
  storybookUrl: string,
): string {
  if (format === 'json') {
    try {
      const parsed = JSON.parse(configSource) as Record<string, unknown>;
      parsed.storybook = { url: storybookUrl, stories: ['**'] };
      // When using Storybook the rendered URL IS the Storybook URL.
      parsed.baseUrl = storybookUrl;
      // Drop `routes` — Storybook discovery owns route enumeration.
      delete parsed.routes;
      return JSON.stringify(parsed, null, 2) + '\n';
    } catch {
      return configSource;
    }
  }

  // For TS/JS: replace the literal route list with a `storybook` block and
  // re-point baseUrl to the Storybook server.
  let next = configSource.replace(
    /baseUrl:\s*['"`][^'"`]*['"`],/,
    `baseUrl: '${storybookUrl}',`,
  );

  // Remove the existing routes line (string or commented hint) — Storybook
  // discovery replaces it.
  next = next.replace(/\n\s*\/\/\s*routes:[^\n]*\n/, '\n');
  next = next.replace(/\n\s*routes:\s*\[[^\]]*\],?\n/, '\n');

  const storybookSnippet =
    `  storybook: {\n` +
    `    url: '${storybookUrl}',\n` +
    `    stories: ['**'], // enumerate every story; narrow with globs if needed\n` +
    `  },\n`;

  // Insert before the closing brace + optional `satisfies`.
  const closingMatch = next.match(/\n\}(?:\s+satisfies\s+\w+)?\s*;?\s*$/);
  if (!closingMatch) return next;
  const insertAt = closingMatch.index!;
  return next.slice(0, insertAt) + '\n' + storybookSnippet + next.slice(insertAt);
}

/**
 * Options accepted by {@link runInit}. Mirrors the CLI flags so the same
 * implementation runs from both contexts.
 */
export interface InitOptions {
  /** Working directory to scaffold into. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Output format. */
  format?: 'ts' | 'js' | 'json';
  /** Force Storybook scaffolding even if `.storybook/main.*` is absent. */
  storybook?: boolean;
  /** Skip Storybook scaffolding even when `.storybook/main.*` is present. */
  noStorybook?: boolean;
  /** Skip interactive prompts and use defaults (CI-friendly). */
  yes?: boolean;
  /** Also generate `.github/workflows/frontguard.yml`. */
  ci?: boolean;
  /** Override the Storybook URL (default: `http://localhost:6006`). */
  storybookUrl?: string;
}

/**
 * Result returned by {@link runInit}. `exitCode` is non-zero on user-visible
 * failures (existing config, etc.) so the CLI driver can propagate it.
 */
export interface InitResult {
  exitCode: number;
  /** Absolute path of the config file written, when one was created. */
  configPath?: string;
  /** Detected framework label or `null`. */
  framework: string | null;
  /** Relative path of the detected Storybook config, or `null`. */
  storybookConfig: string | null;
  /** Whether the emitted config includes a Storybook block. */
  storybookScaffolded: boolean;
}

/**
 * Run the init flow. Pure I/O — does not exit the process; callers translate
 * the returned `exitCode` into `process.exitCode`.
 *
 * Behaviour:
 *   1. Detect framework (Next, Remix, etc.) via package.json.
 *   2. Detect Storybook (`.storybook/main.*`).
 *   3. Generate the base config and, when Storybook is present (or `--storybook`
 *      is passed), splice in a `storybook:` block + flip `baseUrl` to the SB URL.
 *   4. Optionally write a GitHub Actions workflow.
 *   5. Append Frontguard entries to `.gitignore` if not already there.
 */
export function runInit(opts: InitOptions = {}): InitResult {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const format: 'ts' | 'js' | 'json' = opts.format ?? 'ts';
  const storybookUrl = opts.storybookUrl ?? DEFAULT_STORYBOOK_URL;

  // --- Detect framework + Storybook -----------------------------------------
  logger.info('Detecting framework…');
  const framework = detectFramework(cwd);
  if (framework) logger.info(`Detected: ${framework}`);
  else logger.info('No specific framework detected — using defaults');

  const storybookConfig = detectStorybook(cwd);
  // Storybook scaffolding fires when EITHER `.storybook/main.*` exists OR
  // the user explicitly opts in via `--storybook`, and isn't explicitly
  // opted out via `--no-storybook`.
  const useStorybook = !opts.noStorybook && (opts.storybook || storybookConfig !== null);

  if (storybookConfig) {
    logger.info(`Detected Storybook config: ${storybookConfig}`);
  } else if (opts.storybook) {
    logger.info('Storybook scaffolding forced via --storybook');
  }

  // --- Resolve target filename ---------------------------------------------
  const fileName =
    format === 'js' ? 'frontguard.config.js'
    : format === 'json' ? 'frontguard.config.json'
    : 'frontguard.config.ts';
  const filePath = join(cwd, fileName);

  if (existsSync(filePath)) {
    logger.warn(`Config file already exists: ${fileName}`);
    logger.info('Delete it first if you want to regenerate.');
    return { exitCode: 1, framework, storybookConfig, storybookScaffolded: false };
  }

  const workflowDir = join(cwd, '.github', 'workflows');
  const workflowPath = join(workflowDir, 'frontguard.yml');
  let ciWorkflowConfig: CiWorkflowConfig | null = null;
  if (opts.ci && !existsSync(workflowPath)) {
    const resolution = resolveCiWorkflowConfig(cwd, framework, useStorybook);
    if ('error' in resolution) {
      logger.error(resolution.error);
      return { exitCode: 1, framework, storybookConfig, storybookScaffolded: false };
    }
    ciWorkflowConfig = resolution.config;
  }

  // --- Generate config ------------------------------------------------------
  let content = generateDefaultConfig({ framework, format });
  if (useStorybook) {
    content = injectStorybookBlock(content, format, storybookUrl);
  }
  writeFileSync(filePath, content, 'utf-8');
  logger.info(`✅ Created ${fileName}`);
  if (useStorybook) {
    logger.info(`✅ Storybook integration scaffolded (baseUrl → ${storybookUrl})`);
  }

  // --- Optional CI workflow -------------------------------------------------
  if (opts.ci) {
    if (existsSync(workflowPath)) {
      logger.warn('.github/workflows/frontguard.yml already exists — skipping');
    } else if (ciWorkflowConfig) {
      mkdirSync(workflowDir, { recursive: true });
      const port = useStorybook ? 6006 : getFrameworkInfo(framework).defaultPort;
      const workflow = generateGitHubActionsWorkflow({
        devScript: ciWorkflowConfig.devScript,
        packageManager: ciWorkflowConfig.packageManager,
        lockfile: ciWorkflowConfig.lockfile,
        port,
      });
      writeFileSync(workflowPath, workflow, 'utf-8');
      logger.info('✅ Created .github/workflows/frontguard.yml');
    }
  }

  // --- .gitignore -----------------------------------------------------------
  const gitignorePath = join(cwd, '.gitignore');
  // `node_modules/` is critical (install-2): without it a natural
  // `git init && npm install && frontguard init && git commit -am init`
  // drags node_modules into the repo, and the orphan-baseline worktree
  // checkout then explodes with ENOBUFS on first run. `.env`/`.env.*`
  // keep secrets out of git (leak-hygiene policy); `auth.json` holds
  // captured login state and must never be committed.
  const entriesToAdd = [
    'node_modules/',
    'auth.json',
    '.env',
    '.env.*',
    '.frontguard/',
    '.frontguard-debug/',
    'frontguard-report/',
  ];
  let gitignoreContent = '';
  if (existsSync(gitignorePath)) {
    gitignoreContent = readFileSync(gitignorePath, 'utf-8');
  }
  const existingLines = new Set(gitignoreContent.split('\n').map((line) => line.trim()));
  const newEntries = entriesToAdd.filter((entry) => !existingLines.has(entry));
  if (newEntries.length > 0) {
    const addition =
      (gitignoreContent.endsWith('\n') || gitignoreContent === '' ? '' : '\n') +
      '\n# Frontguard\n' +
      newEntries.join('\n') +
      '\n';
    appendFileSync(gitignorePath, addition, 'utf-8');
    logger.info(`Updated .gitignore with: ${newEntries.join(', ')}`);
  }

  // --- Next steps -----------------------------------------------------------
  logger.info('');
  logger.info('Next steps:');
  if (useStorybook) {
    logger.info('  1. Start your Storybook (e.g. npm run storybook)');
    logger.info(`     Frontguard expects it at ${storybookUrl}`);
    logger.info('  2. Accept the initial state:');
    logger.info('     npx -p @frontguard/cli frontguard update-baselines');
    logger.info('  3. Run comparisons: npx -p @frontguard/cli frontguard run');
    logger.info('  4. (Optional) Add `parameters.frontguard` to individual stories');
    logger.info('     to set per-story viewports, threshold, or ignore rules.');
  } else {
    logger.info(`  1. Edit ${fileName} to set your baseUrl and routes`);
    logger.info('  2. Start your dev server (e.g. npm run dev)');
    logger.info('  3. Accept the initial state:');
    logger.info('     npx -p @frontguard/cli frontguard update-baselines');
    logger.info('  4. Run comparisons: npx -p @frontguard/cli frontguard run');
  }
  logger.info('');
  logger.info('Baseline updates commit locally to the frontguard-baselines branch.');
  logger.info('Before CI comparisons, push it: git push origin frontguard-baselines');

  return {
    exitCode: 0,
    configPath: filePath,
    framework,
    storybookConfig,
    storybookScaffolded: useStorybook,
  };
}

// Re-export for callers that need the framework helper at the init layer
// (avoids a circular import via cli/index.ts).
export { detectFramework };
