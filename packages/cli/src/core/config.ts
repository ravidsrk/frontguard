/**
 * Configuration loader and validator for Frontguard.
 *
 * Searches for config files in priority order, validates the raw object
 * against a Zod schema, applies sensible defaults, and exposes helpers
 * for `frontguard init` scaffolding and framework detection.
 *
 * @module core/config
 */

import { z } from 'zod';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { FrontguardConfig } from './types.js';
import { getFrameworkInfo } from '../templates/index.js';

// ---------------------------------------------------------------------------
// Zod Sub-Schemas
// ---------------------------------------------------------------------------

/** Zod schema for route-discovery options. */
const discoverSchema = z.object({
  startUrl: z.string().min(1, 'discover.startUrl must not be empty'),
  maxDepth: z.number().int().positive().default(3),
  maxRoutes: z.number().int().positive().default(50),
  exclude: z.array(z.string()).default([]),
});

/** Zod schema for AI configuration. */
const aiConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic']),
  model: z.string().min(1, 'ai.model must not be empty'),
});

/** Zod schema for an ignore rule. */
const ignoreRuleSchema = z.object({
  selector: z.string().min(1, 'ignore rule selector must not be empty').optional(),
  rect: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }).optional(),
  description: z.string().optional(),
}).refine(r => r.selector || r.rect, { message: 'IgnoreRule must have selector or rect' });

/** Zod schema for auth configuration. */
const authConfigSchema = z.object({
  storageState: z.string().optional(),
});

/** Browser engine enum. */
const browserEngineSchema = z.enum(['chromium', 'firefox', 'webkit']);

/**
 * Zod schema for a per-route configuration object.
 * Allows overriding threshold / ignore / viewport per route.
 */
const routeConfigSchema = z.object({
  path: z.string().min(1, 'route.path must not be empty'),
  threshold: z
    .number()
    .min(0, 'route.threshold must be >= 0')
    .max(1, 'route.threshold must be <= 1')
    .optional(),
  ignore: z.array(ignoreRuleSchema).optional(),
  viewport: z.array(z.number().int().positive()).optional(),
  label: z.string().optional(),
});

/** A route entry — either a plain string path or a {@link routeConfigSchema}. */
const routeEntrySchema = z.union([z.string().min(1), routeConfigSchema]);

// ---------------------------------------------------------------------------
// Main Config Schema
// ---------------------------------------------------------------------------

/**
 * Zod schema for the complete Frontguard configuration.
 *
 * Every field that has a default is optional in user-supplied config —
 * Zod will fill in the value.  `baseUrl` is the only truly required
 * field.
 */
export const configSchema = z.object({
  version: z
    .number({ invalid_type_error: 'Config error at `version`: expected number' })
    .int()
    .positive()
    .default(1),

  baseUrl: z
    .string({ required_error: 'Config error at `baseUrl`: this field is required' })
    .url('Config error at `baseUrl`: expected a valid URL'),

  routes: z.array(routeEntrySchema).optional(),

  discover: discoverSchema.optional(),

  viewports: z
    .array(
      z.number({
        invalid_type_error: 'Config error at `viewports`: expected array of numbers',
      }).int().positive(),
    )
    .default([375, 768, 1440]),

  browsers: z
    .array(browserEngineSchema)
    .default(['chromium']),

  /**
   * Pixel-diff threshold as a fraction `0–1` (e.g. `0.1` = 10%).
   * Represents the fraction of changed pixels needed to flag a diff.
   * The pipeline converts to percentage (`threshold * 100`) when comparing
   * against `DiffResult.diffPercentage` which is `0–100`.
   */
  threshold: z
    .number({ invalid_type_error: 'Config error at `threshold`: expected number, got string' })
    .min(0, 'Config error at `threshold`: must be >= 0')
    .max(1, 'Config error at `threshold`: must be <= 1')
    .default(0.1),

  ai: aiConfigSchema.optional(),

  ignore: z.array(ignoreRuleSchema).default([]),

  auth: authConfigSchema.optional(),

  smartRender: z
    .boolean({ invalid_type_error: 'Config error at `smartRender`: expected boolean' })
    .default(true),

  workers: z
    .number({ invalid_type_error: 'Config error at `workers`: expected number' })
    .int()
    .positive()
    .max(16)
    .default(4),

  pageTimeout: z
    .number({ invalid_type_error: 'Config error at `pageTimeout`: expected number' })
    .int()
    .positive()
    .default(30_000),

  maxHeight: z
    .number({ invalid_type_error: 'Config error at `maxHeight`: expected number' })
    .int()
    .positive()
    .max(50_000)
    .default(5_000),

  outputDir: z
    .string()
    .default('./frontguard-report'),

  viewportHeight: z
    .number({ invalid_type_error: 'Config error at `viewportHeight`: expected number' })
    .int()
    .positive()
    .max(10_000)
    .optional(),

  /** Plugins are runtime objects — validated structurally, not by Zod. */
  plugins: z.array(z.any()).optional(),

  /** Enable SSIM perceptual diff fallback for borderline results. */
  ssimFallback: z.boolean().optional().default(true),

  /** SSIM threshold — images above this are considered perceptually identical. */
  ssimThreshold: z.number().min(0).max(1).optional().default(0.98),

  /** Number of renders per page for anti-flake (default: 1, recommended: 2-3). */
  antiFlakeRenders: z.number().int().min(1).max(5).optional(),

  /** Freeze Date.now() and new Date() to a fixed timestamp during render. */
  freezeTime: z.union([z.boolean(), z.number()]).optional(),

  /** Per-page render retry count on failure (default: 0). */
  renderRetries: z.number().int().min(0).max(3).optional(),
});

/** Inferred Zod output type — should match `FrontguardConfig`. */
export type ConfigSchemaOutput = z.output<typeof configSchema>;

// ---------------------------------------------------------------------------
// Config File Search
// ---------------------------------------------------------------------------

/** Config file names to search for, in priority order. */
const CONFIG_FILES = [
  'frontguard.config.ts',
  'frontguard.config.js',
  'frontguard.config.mjs',
  'frontguard.config.json',
] as const;

// ---------------------------------------------------------------------------
// Secret Detection
// ---------------------------------------------------------------------------

/** Patterns that look like hardcoded API keys / tokens. */
const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9]{20,}/,          // OpenAI
  /sk-proj-[A-Za-z0-9_-]{20,}/,   // OpenAI project keys
  /anthropic-[A-Za-z0-9_-]{20,}/, // Anthropic
  /ghp_[A-Za-z0-9]{36,}/,         // GitHub PAT
  /ghs_[A-Za-z0-9]{36,}/,         // GitHub server token
  /gho_[A-Za-z0-9]{36,}/,         // GitHub OAuth
  /github_pat_[A-Za-z0-9_]{20,}/, // GitHub fine-grained PAT
  /xai-[A-Za-z0-9]{20,}/,         // xAI / Grok
  /glpat-[A-Za-z0-9_-]{20,}/,     // GitLab PAT
];

/**
 * Recursively scans all string values in a configuration object for
 * patterns that look like hardcoded API keys or tokens.
 *
 * Issues `console.warn` for every match found so the user can migrate
 * to environment variables.
 *
 * @param obj  - The configuration object (or sub-value) to scan.
 * @param path - Dot-separated path used in the warning message.
 */
export function detectSecrets(obj: unknown, path = 'config'): void {
  if (typeof obj === 'string') {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(obj)) {
        console.warn(
          `⚠  Possible API key detected at \`${path}\`. ` +
            'Use environment variables instead of hardcoding secrets in config files.',
        );
        break; // one warning per value is enough
      }
    }
    return;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => detectSecrets(item, `${path}[${i}]`));
    return;
  }

  if (obj !== null && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      detectSecrets(value, `${path}.${key}`);
    }
  }
}

// ---------------------------------------------------------------------------
// File Loaders
// ---------------------------------------------------------------------------

/**
 * Dynamically imports a JS/TS/MJS config file and returns its default
 * export (or the module itself if there is no default).
 */
async function loadConfigFile(filePath: string): Promise<unknown> {
  const fileUrl = pathToFileURL(resolve(filePath)).href;
  const mod = await import(fileUrl);
  return mod.default ?? mod;
}

/**
 * Attempts to read config from the `"frontguard"` key in a
 * `package.json` file.
 *
 * @returns The parsed config object, or `null` if no key exists.
 */
async function loadFromPackageJson(dir: string): Promise<unknown | null> {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return null;

  try {
    const raw = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    return pkg.frontguard ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// loadConfig
// ---------------------------------------------------------------------------

/**
 * Loads and validates the Frontguard configuration.
 *
 * **Search order** (first match wins):
 * 1. Explicit `configPath` argument (e.g. from `--config` CLI flag).
 * 2. `frontguard.config.ts`
 * 3. `frontguard.config.js`
 * 4. `frontguard.config.mjs`
 * 5. `frontguard.config.json`
 * 6. `package.json` → `"frontguard"` key.
 *
 * @param configPath - Optional explicit path to a config file.
 * @returns Validated `FrontguardConfig` with all defaults applied.
 * @throws {Error} If no config is found or validation fails.
 */
export async function loadConfig(configPath?: string): Promise<FrontguardConfig> {
  let rawConfig: unknown = null;
  const cwd = process.cwd();

  // 1. Explicit path ---------------------------------------------------
  if (configPath) {
    const fullPath = resolve(cwd, configPath);
    if (!existsSync(fullPath)) {
      throw new Error(`Config file not found: ${configPath}`);
    }

    if (fullPath.endsWith('.json')) {
      const raw = await readFile(fullPath, 'utf-8');
      rawConfig = JSON.parse(raw);
    } else {
      rawConfig = await loadConfigFile(fullPath);
    }
  }

  // 2. Auto-discover config files -------------------------------------
  if (rawConfig === null) {
    for (const filename of CONFIG_FILES) {
      const fullPath = join(cwd, filename);
      if (existsSync(fullPath)) {
        if (filename.endsWith('.json')) {
          const raw = await readFile(fullPath, 'utf-8');
          rawConfig = JSON.parse(raw);
        } else {
          rawConfig = await loadConfigFile(fullPath);
        }
        break;
      }
    }
  }

  // 3. package.json "frontguard" key ----------------------------------
  if (rawConfig === null) {
    rawConfig = await loadFromPackageJson(cwd);
  }

  // 4. No config found ------------------------------------------------
  if (rawConfig === null) {
    throw new Error(
      'No Frontguard config found. Run `frontguard init` to create one, ' +
        'or create frontguard.config.ts in your project root.',
    );
  }

  // Warn about hardcoded secrets before validation
  detectSecrets(rawConfig);

  // Validate with Zod
  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        return `  Config error at \`${path}\`: ${issue.message}`;
      })
      .join('\n');
    throw new Error(`Invalid Frontguard config:\n${issues}`);
  }

  return result.data as FrontguardConfig;
}

// ---------------------------------------------------------------------------
// Framework Detection
// ---------------------------------------------------------------------------

/** Known framework indicators: package-name → human-readable label. */
const FRAMEWORK_INDICATORS: Record<string, string> = {
  next: 'Next.js',
  '@remix-run/react': 'Remix',
  nuxt: 'Nuxt',
  '@sveltejs/kit': 'SvelteKit',
  gatsby: 'Gatsby',
  astro: 'Astro',
  '@angular/core': 'Angular',
  'react-scripts': 'Create React App',
  vite: 'Vite',
};

/**
 * Detects the frontend framework used in a project directory by
 * inspecting its `package.json` dependencies.
 *
 * @param projectDir - Absolute or relative path to the project root.
 * @returns The human-readable framework name, or `null` if none detected.
 */
export async function detectFramework(projectDir: string): Promise<string | null> {
  const pkgPath = join(resolve(projectDir), 'package.json');
  if (!existsSync(pkgPath)) return null;

  try {
    const raw = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as Record<string, unknown>;

    const deps = {
      ...(typeof pkg.dependencies === 'object' && pkg.dependencies !== null
        ? (pkg.dependencies as Record<string, string>)
        : {}),
      ...(typeof pkg.devDependencies === 'object' && pkg.devDependencies !== null
        ? (pkg.devDependencies as Record<string, string>)
        : {}),
    };

    for (const [pkgName, label] of Object.entries(FRAMEWORK_INDICATORS)) {
      if (pkgName in deps) return label;
    }
  } catch {
    // Malformed package.json — fall through
  }

  return null;
}

// ---------------------------------------------------------------------------
// Default Config Generator
// ---------------------------------------------------------------------------

/**
 * Options accepted by {@link generateDefaultConfig}.
 */
export interface GenerateConfigOptions {
  /** Base URL to pre-fill (e.g. `'http://localhost:3000'`). */
  baseUrl?: string;
  /** Detected or user-supplied framework name. */
  framework?: string | null;
  /** File format to generate. */
  format?: 'ts' | 'js' | 'json';
}

/**
 * Generates a starter configuration file string for `frontguard init`.
 *
 * The output is a ready-to-write string in the requested format
 * (TypeScript by default).  Framework-specific comments and route
 * suggestions are included when a framework is detected.
 *
 * @param options - Generation options.
 * @returns The config file contents as a string.
 */
export function generateDefaultConfig(options: GenerateConfigOptions = {}): string {
  const { framework = null, format = 'ts' } = options;

  // Resolve framework metadata (port, typical routes, note).
  const info = getFrameworkInfo(framework);

  // baseUrl: prefer explicit option, else framework default port.
  const baseUrl = options.baseUrl ?? `http://localhost:${info.defaultPort}`;

  // Build framework-specific hints.
  const frameworkComment = framework ? `// Detected: ${info.note}\n` : '';
  const routesArrayLiteral = `[${info.typicalRoutes.map((r) => `'${r}'`).join(', ')}]`;
  // For file-system-routed frameworks, suggest discover instead of explicit routes.
  const routeHint = info.fileSystemRouting
    ? `// routes: ${routesArrayLiteral},  // or use discover for auto-crawl`
    : `routes: ${routesArrayLiteral},`;

  // JSON format
  if (format === 'json') {
    const config = {
      version: 1,
      baseUrl,
      routes: info.typicalRoutes,
      viewports: [375, 768, 1440],
      browsers: ['chromium'],
      threshold: 0.1,
      ignore: [],
      smartRender: true,
      workers: 4,
      pageTimeout: 30000,
      maxHeight: 5000,
      outputDir: './frontguard-report',
    };
    return JSON.stringify(config, null, 2) + '\n';
  }

  // JS / TS format
  const exportKeyword = format === 'ts' ? 'export default' : 'module.exports =';
  const typeAnnotation = format === 'ts'
    ? "import type { FrontguardConfig } from 'frontguard';\n\n"
    : '';
  const satisfies = format === 'ts' ? ' satisfies FrontguardConfig' : '';

  return `${typeAnnotation}${frameworkComment}${exportKeyword} {
  version: 1,
  baseUrl: '${baseUrl}',
  ${routeHint}
  viewports: [375, 768, 1440],
  browsers: ['chromium'],
  threshold: 0.1,
  ignore: [],
  smartRender: true,
  workers: 4,
  pageTimeout: 30000,
  maxHeight: 5000,
  outputDir: './frontguard-report',
}${satisfies};
`;
}
