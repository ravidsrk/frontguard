#!/usr/bin/env node
/**
 * `create-frontguard-plugin` — scaffolds a new Frontguard plugin project
 * (Task 8.5).
 *
 * Usage:
 *   npm create frontguard-plugin@latest my-plugin
 *   npx create-frontguard-plugin my-plugin --description "Slack alerts"
 *
 * Generates a working, tested plugin following the `frontguard-plugin-*`
 * naming convention.
 *
 * @module index
 */

import { mkdirSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSpec, generateFiles, type GeneratedFile } from './templates.js';

/** Parsed CLI arguments. */
export interface ScaffoldArgs {
  name: string;
  description?: string;
  author?: string;
  directory?: string;
  force?: boolean;
}

/** Parses argv (excluding node + script) into {@link ScaffoldArgs}. */
export function parseArgs(argv: string[]): ScaffoldArgs {
  const args: ScaffoldArgs = { name: '' };
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--description' || a === '-d') args.description = argv[++i];
    else if (a === '--author' || a === '-a') args.author = argv[++i];
    else if (a === '--directory' || a === '-C') args.directory = argv[++i];
    else if (a === '--force' || a === '-f') args.force = true;
    else if (!a.startsWith('-')) positionals.push(a);
  }
  args.name = positionals[0] ?? '';
  return args;
}

/**
 * Writes the generated files into a target directory.
 *
 * @returns The list of absolute paths written.
 * @throws if the target exists and `force` is not set.
 */
export function writeProject(
  targetDir: string,
  files: GeneratedFile[],
  opts: { force?: boolean; writeFileImpl?: typeof writeFileSync; mkdirImpl?: typeof mkdirSync; existsImpl?: typeof existsSync } = {},
): string[] {
  const writeFn = opts.writeFileImpl ?? writeFileSync;
  const mkdirFn = opts.mkdirImpl ?? mkdirSync;
  const existsFn = opts.existsImpl ?? existsSync;

  const written: string[] = [];
  for (const file of files) {
    const abs = join(targetDir, file.path);
    if (existsFn(abs) && !opts.force) {
      throw new Error(`Refusing to overwrite existing file: ${abs} (use --force)`);
    }
    mkdirFn(dirname(abs), { recursive: true });
    writeFn(abs, file.content, 'utf8');
    written.push(abs);
  }
  return written;
}

/** Runs the scaffolder. Returns the process exit code. */
export function run(argv: string[]): number {
  const args = parseArgs(argv);
  if (!args.name) {
    process.stderr.write(
      'Usage: create-frontguard-plugin <name> [--description <text>] [--author <name>] [--directory <dir>] [--force]\n',
    );
    return 1;
  }

  const spec = buildSpec(args.name, { description: args.description, author: args.author });
  const targetDir = resolve(args.directory ?? spec.packageName);
  const files = generateFiles(spec);

  try {
    writeProject(targetDir, files, { force: args.force });
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  process.stdout.write(
    [
      `✅ Created ${spec.packageName} in ${targetDir}`,
      '',
      'Next steps:',
      `  cd ${targetDir}`,
      '  npm install',
      '  npm test',
      '  npm run build',
      '',
      'Publish when ready:',
      '  npm publish --access public',
      '',
    ].join('\n'),
  );
  return 0;
}

/**
 * Returns true when this module is the process entrypoint.
 *
 * Resolves both paths via the real filesystem path so it works for a direct
 * `node dist/index.js` invocation AND for the `create-frontguard-plugin` bin
 * symlink created by npm/npx (where `process.argv[1]` does not end in
 * `index.js`).
 */
export function isEntrypoint(argv1: string | undefined, moduleUrl: string): boolean {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

// Auto-run when executed directly.
if (isEntrypoint(process.argv[1], import.meta.url)) {
  process.exit(run(process.argv.slice(2)));
}
