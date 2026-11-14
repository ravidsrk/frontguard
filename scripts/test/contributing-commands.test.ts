/**
 * Commands in CONTRIBUTING.md and AGENTS.md must work as written (#381).
 *
 * Reads fenced shell blocks and inline code spans, then checks that:
 * - `npm run <script>` and `npm test`, with an optional `--workspace=<dir>`,
 *   `--workspace <dir>` or `-w <dir>`, name a script in the root package.json
 *   or in that workspace's package.json;
 * - `node <path>`, `bash <path>`, `sh <path>`, `npx tsx <path>` and the test
 *   file in `npx vitest run <path>` exist. Build output under dist/ is not in
 *   the tree, so for those only the owning package directory must exist;
 * - `cd <dir>` names a directory that exists.
 *
 * Each command line starts from the repository root, as the docs present them,
 * and a `cd` applies until the end of its line. In a block that runs
 * `git clone <url>`, `cd <clone directory>` is the repository root.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DOCS = ['CONTRIBUTING.md', 'AGENTS.md'] as const;
const SHELL_FENCES = new Set(['bash', 'sh', 'shell', 'zsh', 'console']);
const COMMAND_WORDS = new Set(['npm', 'npx', 'node', 'bash', 'sh', 'cd']);
const OPERATORS = new Set(['&&', '||', ';', '|']);
const NPM_RUN = new Set(['run', 'run-script', 'rum', 'urn']);
const NPM_TEST = new Set(['test', 't', 'tst']);
const NODE_FLAGS_WITH_VALUE = new Set(['--import', '-r', '--require', '--loader', '--experimental-loader']);
const VITEST_COMMANDS = new Set(['run', 'watch', 'dev', 'related', 'list', 'bench']);

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  workspaces?: string[];
}

interface CommandLine {
  where: string;
  text: string;
  cloneDir?: string;
}

function readJson(file: string): PackageJson {
  return JSON.parse(readFileSync(file, 'utf8')) as PackageJson;
}

function isDirectory(absolute: string): boolean {
  return existsSync(absolute) && statSync(absolute).isDirectory();
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

/** Shell-like tokens with quotes removed, operators kept, and comments dropped. */
function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let started = false;
  let quote: string | null = null;
  const flush = () => {
    if (started) tokens.push(current);
    current = '';
    started = false;
  };
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      flush();
    } else if (ch === '#' && !started) {
      break;
    } else if ((ch === '&' || ch === '|') && line[i + 1] === ch) {
      flush();
      tokens.push(ch + ch);
      i++;
    } else if (ch === ';' || ch === '|') {
      flush();
      tokens.push(ch);
    } else {
      current += ch;
      started = true;
    }
  }
  flush();
  return tokens;
}

function segments(tokens: string[]): string[][] {
  const result: string[][] = [[]];
  for (const token of tokens) {
    if (OPERATORS.has(token)) result.push([]);
    else result[result.length - 1].push(token);
  }
  return result
    .map((segment) => {
      let start = 0;
      while (start < segment.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(segment[start])) start++;
      return segment.slice(start);
    })
    .filter((segment) => segment.length > 0);
}

function commandLines(doc: string): CommandLine[] {
  const text = readFileSync(path.join(repoRoot, doc), 'utf8');
  const lines: CommandLine[] = [];
  const fence = /^```([\w-]*)[^\n]*\n([\s\S]*?)^```/gm;

  for (const match of text.matchAll(fence)) {
    if (!SHELL_FENCES.has(match[1].toLowerCase())) continue;
    const firstLine = lineOf(text, match.index) + 1;
    let cloneDir: string | undefined;
    match[2].split('\n').forEach((raw, offset) => {
      const tokens = tokenize(raw);
      if (tokens.length === 0) return;
      if (tokens[0] === 'git' && tokens[1] === 'clone' && tokens[2]) {
        cloneDir = tokens[3] ?? path.posix.basename(tokens[2]).replace(/\.git$/, '');
      }
      lines.push({ where: `${doc}:${firstLine + offset}`, text: raw.trim(), cloneDir });
    });
  }

  const prose = text.replace(fence, (block) => block.replace(/[^\n]/g, ' '));
  for (const match of prose.matchAll(/`([^`\n]+)`/g)) {
    const [first] = segments(tokenize(match[1]))[0] ?? [];
    if (first && COMMAND_WORDS.has(first)) {
      lines.push({ where: `${doc}:${lineOf(text, match.index)}`, text: match[1].trim() });
    }
  }
  return lines;
}

function isPlaceholder(value: string): boolean {
  return /[<>$*~{}]/.test(value);
}

function positionals(args: string[]): string[] {
  return args.filter((arg) => !arg.startsWith('-'));
}

/** Workspace directories from the root package.json globs (`packages/*` and the like). */
function listWorkspaces(): string[] {
  const dirs: string[] = [];
  for (const pattern of readJson(path.join(repoRoot, 'package.json')).workspaces ?? []) {
    if (!pattern.endsWith('/*')) {
      dirs.push(path.join(repoRoot, pattern));
      continue;
    }
    const base = path.join(repoRoot, pattern.slice(0, -2));
    if (!isDirectory(base)) continue;
    for (const entry of readdirSync(base)) {
      if (existsSync(path.join(base, entry, 'package.json'))) dirs.push(path.join(base, entry));
    }
  }
  return dirs;
}

const workspaceDirs = listWorkspaces();

function resolveWorkspace(value: string): string | null {
  const byName = workspaceDirs.find((dir) => readJson(path.join(dir, 'package.json')).name === value);
  if (byName) return byName;
  const byPath = path.resolve(repoRoot, value);
  return workspaceDirs.includes(byPath) ? byPath : null;
}

function nearestPackageDir(cwd: string): string {
  let dir = cwd;
  while (dir.startsWith(repoRoot) && dir !== repoRoot) {
    if (existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return repoRoot;
}

function checkPath(raw: string, cwd: string, command: string, problems: string[], where: string): void {
  if (isPlaceholder(raw)) return;
  const absolute = path.resolve(cwd, raw);
  const relative = path.relative(repoRoot, absolute);
  const dist = relative.split(path.sep).indexOf('dist');
  if (dist !== -1) {
    const owner = relative.split(path.sep).slice(0, dist).join(path.sep);
    if (!existsSync(path.join(repoRoot, owner, 'package.json'))) {
      problems.push(`${where}: \`${command}\` builds into a package that does not exist: ${owner || '.'}`);
    }
    return;
  }
  if (!existsSync(absolute)) problems.push(`${where}: \`${command}\` points at a missing file: ${relative}`);
}

function checkLine(line: CommandLine, problems: string[]): number {
  let cwd = repoRoot;
  let checked = 0;
  for (const segment of segments(tokenize(line.text))) {
    const [command, ...args] = segment;
    const shown = segment.join(' ');

    if (command === 'cd') {
      const target = args[0];
      if (!target || isPlaceholder(target) || target === '-') continue;
      checked++;
      cwd = line.cloneDir && target === line.cloneDir ? repoRoot : path.resolve(cwd, target);
      if (!isDirectory(cwd)) problems.push(`${line.where}: \`${shown}\` names a missing directory`);
    } else if (command === 'npm') {
      const workspaces: string[] = [];
      const words: string[] = [];
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--') break;
        if (arg.startsWith('--workspace=') || arg.startsWith('-w=')) workspaces.push(arg.slice(arg.indexOf('=') + 1));
        else if (arg === '--workspace' || arg === '-w') workspaces.push(args[++i] ?? '');
        else if (!arg.startsWith('-')) words.push(arg);
      }
      const [subcommand, name] = words;
      const script = NPM_RUN.has(subcommand) ? name : NPM_TEST.has(subcommand) ? 'test' : undefined;
      if (!script || isPlaceholder(script) || workspaces.some(isPlaceholder)) continue;
      checked++;
      const dirs = workspaces.length > 0 ? workspaces.map(resolveWorkspace) : [nearestPackageDir(cwd)];
      dirs.forEach((dir, index) => {
        if (!dir) {
          problems.push(`${line.where}: \`${shown}\` names an unknown workspace: ${workspaces[index]}`);
        } else if (!readJson(path.join(dir, 'package.json')).scripts?.[script]) {
          const owner = path.relative(repoRoot, dir) || 'the root package.json';
          problems.push(`${line.where}: \`${shown}\` has no "${script}" script in ${owner}`);
        }
      });
    } else if (command === 'node') {
      if (args.some((arg) => ['-e', '--eval', '-p', '--print'].includes(arg))) continue;
      const file = args.find((arg, i) => !arg.startsWith('-') && !NODE_FLAGS_WITH_VALUE.has(args[i - 1] ?? ''));
      if (!file) continue;
      checked++;
      checkPath(file, cwd, shown, problems, line.where);
    } else if (command === 'bash' || command === 'sh') {
      if (args.includes('-c')) continue;
      const [file] = positionals(args);
      if (!file) continue;
      checked++;
      checkPath(file, cwd, shown, problems, line.where);
    } else if (command === 'npx') {
      if (args.some((arg) => arg === '-p' || arg === '--package' || arg.startsWith('--package='))) continue;
      const [tool, ...rest] = positionals(args);
      if (tool === 'tsx' && rest[0]) {
        checked++;
        checkPath(rest[0], cwd, shown, problems, line.where);
      } else if (tool === 'vitest') {
        for (const file of rest.filter((arg) => !VITEST_COMMANDS.has(arg) && /\.[cm]?[jt]sx?$/.test(arg))) {
          checked++;
          checkPath(file, cwd, shown, problems, line.where);
        }
      }
    }
  }
  return checked;
}

describe('commands in CONTRIBUTING.md and AGENTS.md (#381)', () => {
  for (const doc of DOCS) {
    it(`${doc} names only scripts, files and directories that exist`, () => {
      const problems: string[] = [];
      let checked = 0;
      for (const line of commandLines(doc)) checked += checkLine(line, problems);

      expect(checked).toBeGreaterThan(5);
      expect(problems).toEqual([]);
    });

    it(`${doc} points at npm run verify`, () => {
      expect(readFileSync(path.join(repoRoot, doc), 'utf8')).toContain('`npm run verify`');
    });
  }
});
