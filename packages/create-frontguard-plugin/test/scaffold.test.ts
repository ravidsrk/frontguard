import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { toShortName, buildSpec, generateFiles, pascal } from '../src/templates.js';
import { parseArgs, writeProject, run } from '../src/index.js';

describe('toShortName', () => {
  it('slugifies arbitrary input', () => {
    expect(toShortName('My Cool Plugin')).toBe('my-cool-plugin');
  });
  it('strips the frontguard-plugin- prefix', () => {
    expect(toShortName('frontguard-plugin-slack')).toBe('slack');
  });
  it('handles scoped names', () => {
    expect(toShortName('@acme/frontguard-plugin-x')).toBe('x');
  });
  it('falls back to my-plugin for empty input', () => {
    expect(toShortName('!!!')).toBe('my-plugin');
  });
});

describe('pascal', () => {
  it('PascalCases kebab names', () => {
    expect(pascal('my-cool-plugin')).toBe('MyCoolPlugin');
  });
  it('prefixes digit-leading names so emitted TypeScript identifiers stay valid', () => {
    expect(pascal('123-alerts')).toBe('Plugin123Alerts');
    expect(pascal('0')).toBe('Plugin0');
  });
});

describe('buildSpec', () => {
  it('builds a full spec with the prefix', () => {
    const spec = buildSpec('slack', { description: 'Slack alerts', author: 'Jane' });
    expect(spec.packageName).toBe('frontguard-plugin-slack');
    expect(spec.shortName).toBe('slack');
    expect(spec.description).toBe('Slack alerts');
    expect(spec.author).toBe('Jane');
  });
  it('provides a default description', () => {
    expect(buildSpec('x').description).toContain('x');
  });
});

describe('generateFiles', () => {
  const files = generateFiles(buildSpec('slack', { description: 'Slack alerts' }));
  const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));

  it('generates the expected file set', () => {
    expect(Object.keys(byPath).sort()).toEqual(
      ['.gitignore', 'README.md', 'package.json', 'src/index.ts', 'test/index.test.ts', 'tsconfig.json', 'vitest.config.ts'].sort(),
    );
  });

  it('package.json has the right name and is valid JSON', () => {
    const pkg = JSON.parse(byPath['package.json']);
    expect(pkg.name).toBe('frontguard-plugin-slack');
    expect(pkg.keywords).toContain('frontguard-plugin');
  });

  it('source exports a factory with the plugin name', () => {
    expect(byPath['src/index.ts']).toContain("name: 'slack'");
    expect(byPath['src/index.ts']).toContain('createSlackPlugin');
  });

  it('test references the factory', () => {
    expect(byPath['test/index.test.ts']).toContain('createSlackPlugin');
  });

  it('neutralizes JSDoc comment breakouts in description and digit-leading names', () => {
    const evil = generateFiles(
      buildSpec('123-check', { description: 'Safe */ console.log("pwn"); /*' }),
    );
    const src = evil.find((f) => f.path === 'src/index.ts')!.content;
    expect(src).toContain('export interface Plugin123CheckOptions');
    expect(src).toContain('export function createPlugin123CheckPlugin');
    expect(src).not.toContain('Safe */ console.log');
    expect(src).toContain('Safe *\\/ console.log');
  });
});

describe('parseArgs', () => {
  it('parses name and flags', () => {
    const args = parseArgs(['my-plugin', '--description', 'Hi', '--author', 'Jane', '--force']);
    expect(args).toEqual({ name: 'my-plugin', description: 'Hi', author: 'Jane', force: true });
  });
  it('supports short flags and directory', () => {
    const args = parseArgs(['x', '-d', 'desc', '-C', 'out']);
    expect(args.directory).toBe('out');
    expect(args.description).toBe('desc');
  });
  it('defaults name to empty when absent', () => {
    expect(parseArgs(['--force']).name).toBe('');
  });
});

describe('writeProject', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fg-scaffold-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes all generated files to disk', () => {
    const spec = buildSpec('slack');
    const written = writeProject(dir, generateFiles(spec));
    expect(written.length).toBe(7);
    expect(existsSync(join(dir, 'package.json'))).toBe(true);
    expect(existsSync(join(dir, 'src/index.ts'))).toBe(true);
    expect(existsSync(join(dir, 'test/index.test.ts'))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('frontguard-plugin-slack');
  });

  it('refuses to overwrite without --force', () => {
    const files = generateFiles(buildSpec('slack'));
    writeProject(dir, files);
    expect(() => writeProject(dir, files)).toThrow(/Refusing to overwrite/);
  });

  it('overwrites with force', () => {
    const files = generateFiles(buildSpec('slack'));
    writeProject(dir, files);
    expect(() => writeProject(dir, files, { force: true })).not.toThrow();
  });

  it('rejects paths escaping targetDir', () => {
    expect(() =>
      writeProject(dir, [{ path: '../outside.txt', content: 'x' }]),
    ).toThrow(/outside target directory/);
    expect(() =>
      writeProject(dir, [{ path: '/tmp/abs.txt', content: 'x' }]),
    ).toThrow(/unsafe file path/);
  });
});

describe('run (CLI entrypoint)', () => {
  let dir: string;
  let stdout: string;
  let stderr: string;
  let outSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fg-run-'));
    stdout = '';
    stderr = '';
    outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((s: string) => {
      stdout += s;
      return true;
    }) as typeof process.stdout.write);
    errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((s: string) => {
      stderr += s;
      return true;
    }) as typeof process.stderr.write);
  });

  afterEach(() => {
    outSpy.mockRestore();
    errSpy.mockRestore();
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns 1 and prints usage when no name is given', () => {
    const code = run([]);
    expect(code).toBe(1);
    expect(stderr).toContain('Usage:');
  });

  it('scaffolds a project and returns 0', () => {
    const code = run(['slack', '--directory', join(dir, 'out'), '--description', 'Slack alerts']);
    expect(code).toBe(0);
    expect(stdout).toContain('Created frontguard-plugin-slack');
    expect(stdout).toContain('Next steps');
    expect(existsSync(join(dir, 'out', 'package.json'))).toBe(true);
  });

  it('returns 1 when refusing to overwrite an existing project', () => {
    const target = join(dir, 'dup');
    expect(run(['slack', '--directory', target])).toBe(0);
    const code = run(['slack', '--directory', target]);
    expect(code).toBe(1);
    expect(stderr).toMatch(/Error:.*overwrite/);
  });

  it('overwrites when --force is passed', () => {
    const target = join(dir, 'forced');
    expect(run(['slack', '--directory', target])).toBe(0);
    expect(run(['slack', '--directory', target, '--force'])).toBe(0);
  });
});
