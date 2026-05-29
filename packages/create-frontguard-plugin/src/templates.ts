/**
 * File templates for scaffolding a Frontguard plugin (Task 8.5).
 *
 * Pure functions that, given a plugin spec, return the text content of each
 * generated file. Kept separate from filesystem IO so they can be unit-tested.
 *
 * @module templates
 */

/** Specification for a new plugin project. */
export interface PluginSpec {
  /** Short name (e.g. `slack`). Used in the package name + plugin `name`. */
  shortName: string;
  /** Full npm package name (e.g. `frontguard-plugin-slack`). */
  packageName: string;
  /** One-line description. */
  description: string;
  /** Author string (optional). */
  author?: string;
}

/** A generated file: relative path + contents. */
export interface GeneratedFile {
  path: string;
  content: string;
}

const PLUGIN_PREFIX = 'frontguard-plugin-';

/** Slugifies arbitrary input into a valid short plugin name. */
export function toShortName(input: string): string {
  let s = input.trim().toLowerCase();
  if (s.startsWith('@')) s = s.slice(s.indexOf('/') + 1);
  if (s.startsWith(PLUGIN_PREFIX)) s = s.slice(PLUGIN_PREFIX.length);
  s = s
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'my-plugin';
}

/** Builds a {@link PluginSpec} from a raw name + options. */
export function buildSpec(rawName: string, opts: { description?: string; author?: string } = {}): PluginSpec {
  const shortName = toShortName(rawName);
  return {
    shortName,
    packageName: `${PLUGIN_PREFIX}${shortName}`,
    description: opts.description ?? `A Frontguard plugin: ${shortName}`,
    author: opts.author,
  };
}

function packageJson(spec: PluginSpec): string {
  return (
    JSON.stringify(
      {
        name: spec.packageName,
        version: '0.1.0',
        description: spec.description,
        keywords: ['frontguard', 'frontguard-plugin', spec.shortName],
        type: 'module',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        files: ['dist'],
        scripts: {
          build: 'tsc',
          test: 'vitest run',
          typecheck: 'tsc --noEmit',
        },
        peerDependencies: {
          '@frontguard/cli': '*',
        },
        devDependencies: {
          '@types/node': '^22.0.0',
          typescript: '^5.9.0',
          vitest: '^4.1.2',
        },
        ...(spec.author ? { author: spec.author } : {}),
        license: 'MIT',
      },
      null,
      2,
    ) + '\n'
  );
}

function indexTs(spec: PluginSpec): string {
  const fnName = `create${pascal(spec.shortName)}Plugin`;
  return `/**
 * ${spec.description}
 *
 * A Frontguard plugin. Implement one or more lifecycle hooks; only \`name\` is
 * required. See https://frontguard.dev/docs/guides/create-plugin for the full
 * hook reference.
 */

// NOTE: when @frontguard/cli is installed, import the real types instead:
//   import type { FrontguardPlugin, PluginContext } from '@frontguard/cli';
export interface FrontguardPlugin {
  name: string;
  setup?(ctx: unknown): void | Promise<void>;
  afterRun?(result: unknown, ctx: unknown): void | Promise<void>;
  teardown?(): void | Promise<void>;
}

/** Configuration for the ${spec.shortName} plugin. */
export interface ${pascal(spec.shortName)}Options {
  /** Example option — replace with your own. */
  enabled?: boolean;
}

/**
 * Creates the ${spec.shortName} plugin.
 *
 * @example
 * import ${fnName} from '${spec.packageName}';
 * export default { plugins: [${fnName}({ enabled: true })] };
 */
export function ${fnName}(options: ${pascal(spec.shortName)}Options = {}): FrontguardPlugin {
  const enabled = options.enabled ?? true;
  return {
    name: '${spec.shortName}',
    setup() {
      if (!enabled) return;
      // One-time setup: validate config, authenticate, etc.
    },
    async afterRun(result) {
      if (!enabled) return;
      // React to the completed run (post results, send alerts, etc.).
      const r = result as { summary?: { regressions?: number } };
      const regressions = r.summary?.regressions ?? 0;
      // eslint-disable-next-line no-console
      console.log('[${spec.shortName}] run complete — regressions:', regressions);
    },
  };
}

export default ${fnName};
`;
}

function indexTestTs(spec: PluginSpec): string {
  const fnName = `create${pascal(spec.shortName)}Plugin`;
  return `import { describe, it, expect, vi } from 'vitest';
import ${fnName} from '../src/index.js';

describe('${spec.shortName} plugin', () => {
  it('has the expected name', () => {
    expect(${fnName}().name).toBe('${spec.shortName}');
  });

  it('is disabled when enabled=false', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugin = ${fnName}({ enabled: false });
    await plugin.afterRun?.({ summary: { regressions: 1 } }, {});
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('reports regressions on afterRun when enabled', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugin = ${fnName}({ enabled: true });
    await plugin.afterRun?.({ summary: { regressions: 3 } }, {});
    expect(log).toHaveBeenCalledWith('[${spec.shortName}] run complete — regressions:', 3);
    log.mockRestore();
  });
});
`;
}

function tsconfig(): string {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          declaration: true,
          outDir: 'dist',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
        },
        include: ['src/**/*.ts'],
        exclude: ['node_modules', 'dist', 'test'],
      },
      null,
      2,
    ) + '\n'
  );
}

function vitestConfig(): string {
  return `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
`;
}

function readme(spec: PluginSpec): string {
  const fnName = `create${pascal(spec.shortName)}Plugin`;
  return `# ${spec.packageName}

${spec.description}

## Install

\`\`\`bash
frontguard plugin install ${spec.shortName}
# or
npm install -D ${spec.packageName}
\`\`\`

## Usage

\`\`\`ts
// frontguard.config.ts
import ${fnName} from '${spec.packageName}';

export default {
  baseUrl: 'http://localhost:3000',
  plugins: [${fnName}({ enabled: true })],
};
\`\`\`

## Development

\`\`\`bash
npm install
npm test
npm run build
\`\`\`

## Hooks

This plugin implements the \`setup\` and \`afterRun\` hooks. See the
[plugin authoring guide](https://frontguard.dev/docs/guides/create-plugin) for
the full lifecycle.
`;
}

function gitignore(): string {
  return 'node_modules\ndist\n*.log\n';
}

/** Converts a kebab/space name to PascalCase. */
export function pascal(input: string): string {
  return input
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

/**
 * Returns the full set of files for a scaffolded plugin project.
 */
export function generateFiles(spec: PluginSpec): GeneratedFile[] {
  return [
    { path: 'package.json', content: packageJson(spec) },
    { path: 'tsconfig.json', content: tsconfig() },
    { path: 'vitest.config.ts', content: vitestConfig() },
    { path: 'README.md', content: readme(spec) },
    { path: '.gitignore', content: gitignore() },
    { path: 'src/index.ts', content: indexTs(spec) },
    { path: 'test/index.test.ts', content: indexTestTs(spec) },
  ];
}
