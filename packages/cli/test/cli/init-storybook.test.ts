/**
 * Tests for src/cli/init.ts — Storybook-aware scaffolding path.
 *
 * Drives `runInit()` directly inside temp directories instead of spawning
 * the CLI, so we can assert on the emitted config text + return value
 * without paying the `tsx` cold-start cost.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir } from '../fixtures/helpers.js';
import {
  DEFAULT_STORYBOOK_URL,
  detectStorybook,
  injectStorybookBlock,
  runInit,
} from '../../src/cli/init.js';

describe('detectStorybook', () => {
  let tempDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    ({ dir: tempDir, cleanup } = createTempDir());
  });
  afterEach(() => cleanup?.());

  it('returns null when no .storybook directory exists', () => {
    expect(detectStorybook(tempDir)).toBeNull();
  });

  it('detects .storybook/main.ts', () => {
    mkdirSync(join(tempDir, '.storybook'), { recursive: true });
    writeFileSync(join(tempDir, '.storybook', 'main.ts'), 'export default {};');
    expect(detectStorybook(tempDir)).toBe('.storybook/main.ts');
  });

  it('detects .storybook/main.js', () => {
    mkdirSync(join(tempDir, '.storybook'), { recursive: true });
    writeFileSync(join(tempDir, '.storybook', 'main.js'), 'module.exports = {};');
    expect(detectStorybook(tempDir)).toBe('.storybook/main.js');
  });

  it('prefers main.ts over main.js when both exist', () => {
    mkdirSync(join(tempDir, '.storybook'), { recursive: true });
    writeFileSync(join(tempDir, '.storybook', 'main.ts'), 'export default {};');
    writeFileSync(join(tempDir, '.storybook', 'main.js'), 'module.exports = {};');
    expect(detectStorybook(tempDir)).toBe('.storybook/main.ts');
  });

  it('detects .mjs / .cjs variants', () => {
    mkdirSync(join(tempDir, '.storybook'), { recursive: true });
    writeFileSync(join(tempDir, '.storybook', 'main.cjs'), 'module.exports = {};');
    expect(detectStorybook(tempDir)).toBe('.storybook/main.cjs');
  });
});

describe('injectStorybookBlock', () => {
  it('inserts a storybook block before the closing brace in a TS config', () => {
    const base = `import type { FrontguardConfig } from 'frontguard';\n\nexport default {\n  version: 1,\n  baseUrl: 'http://localhost:3000',\n  routes: ['/', '/about'],\n  viewports: [375, 768, 1440],\n  threshold: 0.1,\n  outputDir: './frontguard-report',\n} satisfies FrontguardConfig;\n`;
    const out = injectStorybookBlock(base, 'ts', DEFAULT_STORYBOOK_URL);
    expect(out).toContain("storybook: {");
    expect(out).toContain(`url: '${DEFAULT_STORYBOOK_URL}'`);
    expect(out).toContain("stories: ['**']");
    // baseUrl flipped to storybook URL
    expect(out).toContain(`baseUrl: '${DEFAULT_STORYBOOK_URL}'`);
    // routes dropped
    expect(out).not.toContain("routes: ['/'");
  });

  it('rewrites JSON configs by mutating the parsed object', () => {
    const base = JSON.stringify({
      version: 1,
      baseUrl: 'http://localhost:3000',
      routes: ['/'],
      viewports: [375],
    });
    const out = injectStorybookBlock(base, 'json', DEFAULT_STORYBOOK_URL);
    const parsed = JSON.parse(out);
    expect(parsed.storybook).toEqual({ url: DEFAULT_STORYBOOK_URL, stories: ['**'] });
    expect(parsed.baseUrl).toBe(DEFAULT_STORYBOOK_URL);
    expect(parsed.routes).toBeUndefined();
  });

  it('passes through malformed JSON unchanged', () => {
    const garbage = '{not valid json';
    expect(injectStorybookBlock(garbage, 'json', DEFAULT_STORYBOOK_URL)).toBe(garbage);
  });

  it('still inserts a block when the routes line is missing (TS path)', () => {
    const base = `export default {\n  version: 1,\n  baseUrl: 'http://localhost:3000',\n  viewports: [375, 768, 1440],\n  threshold: 0.1,\n  outputDir: './frontguard-report',\n};\n`;
    const out = injectStorybookBlock(base, 'js', DEFAULT_STORYBOOK_URL);
    expect(out).toContain('storybook: {');
  });
});

describe('runInit — Storybook auto-detection', () => {
  let tempDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    ({ dir: tempDir, cleanup } = createTempDir());
  });
  afterEach(() => cleanup?.());

  it('does NOT scaffold storybook when no .storybook dir exists', () => {
    const result = runInit({ cwd: tempDir, format: 'ts' });
    expect(result.exitCode).toBe(0);
    expect(result.storybookScaffolded).toBe(false);
    const text = readFileSync(join(tempDir, 'frontguard.config.ts'), 'utf-8');
    expect(text).not.toContain('storybook: {');
    expect(text).toContain("baseUrl: 'http://localhost:3000'");
    expect(text).toContain("routes:");
  });

  it('scaffolds a storybook block when .storybook/main.ts exists', () => {
    mkdirSync(join(tempDir, '.storybook'), { recursive: true });
    writeFileSync(join(tempDir, '.storybook', 'main.ts'), 'export default {};');

    const result = runInit({ cwd: tempDir, format: 'ts' });
    expect(result.exitCode).toBe(0);
    expect(result.storybookScaffolded).toBe(true);
    expect(result.storybookConfig).toBe('.storybook/main.ts');

    const text = readFileSync(join(tempDir, 'frontguard.config.ts'), 'utf-8');
    expect(text).toContain('storybook: {');
    expect(text).toContain(`url: '${DEFAULT_STORYBOOK_URL}'`);
    expect(text).toContain(`baseUrl: '${DEFAULT_STORYBOOK_URL}'`);
    // The non-storybook 'routes' suggestion is gone.
    expect(text).not.toMatch(/routes:\s*\[/);
  });

  it('does NOT scaffold storybook when --no-storybook overrides detection', () => {
    mkdirSync(join(tempDir, '.storybook'), { recursive: true });
    writeFileSync(join(tempDir, '.storybook', 'main.ts'), 'export default {};');

    const result = runInit({ cwd: tempDir, format: 'ts', noStorybook: true });
    expect(result.storybookScaffolded).toBe(false);

    const text = readFileSync(join(tempDir, 'frontguard.config.ts'), 'utf-8');
    expect(text).not.toContain('storybook: {');
  });

  it('scaffolds a storybook block when --storybook is forced (no .storybook present)', () => {
    const result = runInit({ cwd: tempDir, format: 'ts', storybook: true });
    expect(result.storybookScaffolded).toBe(true);
    const text = readFileSync(join(tempDir, 'frontguard.config.ts'), 'utf-8');
    expect(text).toContain('storybook: {');
  });

  it('respects a custom storybook URL', () => {
    const customUrl = 'http://localhost:7007';
    mkdirSync(join(tempDir, '.storybook'), { recursive: true });
    writeFileSync(join(tempDir, '.storybook', 'main.ts'), 'export default {};');

    const result = runInit({ cwd: tempDir, format: 'ts', storybookUrl: customUrl });
    expect(result.storybookScaffolded).toBe(true);
    const text = readFileSync(join(tempDir, 'frontguard.config.ts'), 'utf-8');
    expect(text).toContain(`url: '${customUrl}'`);
    expect(text).toContain(`baseUrl: '${customUrl}'`);
  });

  it('emits a JSON config with the storybook block when format=json', () => {
    mkdirSync(join(tempDir, '.storybook'), { recursive: true });
    writeFileSync(join(tempDir, '.storybook', 'main.ts'), 'export default {};');

    const result = runInit({ cwd: tempDir, format: 'json' });
    expect(result.exitCode).toBe(0);
    expect(result.storybookScaffolded).toBe(true);
    const parsed = JSON.parse(readFileSync(join(tempDir, 'frontguard.config.json'), 'utf-8'));
    expect(parsed.storybook).toEqual({
      url: DEFAULT_STORYBOOK_URL,
      stories: ['**'],
    });
    expect(parsed.baseUrl).toBe(DEFAULT_STORYBOOK_URL);
  });

  it('appends .frontguard entries to .gitignore even on the storybook path', () => {
    mkdirSync(join(tempDir, '.storybook'), { recursive: true });
    writeFileSync(join(tempDir, '.storybook', 'main.ts'), 'export default {};');

    runInit({ cwd: tempDir, format: 'ts' });
    const ig = readFileSync(join(tempDir, '.gitignore'), 'utf-8');
    expect(ig).toContain('.frontguard/');
    expect(ig).toContain('.frontguard-debug/');
    expect(ig).toContain('frontguard-report/');
  });

  it('returns exitCode 1 when frontguard.config.ts already exists', () => {
    writeFileSync(join(tempDir, 'frontguard.config.ts'), '// pre-existing\n');
    const result = runInit({ cwd: tempDir, format: 'ts' });
    expect(result.exitCode).toBe(1);
    expect(result.storybookScaffolded).toBe(false);
  });

  it('emits the GH Actions workflow with storybook port when --ci + storybook detected', () => {
    mkdirSync(join(tempDir, '.storybook'), { recursive: true });
    writeFileSync(join(tempDir, '.storybook', 'main.ts'), 'export default {};');

    runInit({ cwd: tempDir, format: 'ts', ci: true });
    const wfPath = join(tempDir, '.github', 'workflows', 'frontguard.yml');
    expect(existsSync(wfPath)).toBe(true);
    const wf = readFileSync(wfPath, 'utf-8');
    expect(wf).toContain('6006');
    expect(wf).toContain('storybook');
  });

  it('uses the fixture .storybook config when run against packages/cli/__fixtures__/storybook', () => {
    // This anchors the docs-recommended workflow against the real fixture path.
    const fixtureMain = join(
      __dirname,
      '..',
      '..',
      '__fixtures__',
      'storybook',
      '.storybook',
      'main.ts',
    );
    expect(existsSync(fixtureMain)).toBe(true);
    // detectStorybook is called against `cwd` so a synthetic temp project that
    // points at the fixture should still detect via its own copy. This test
    // proves the same `detectStorybook` rules cover the real fixture layout.
    const fixtureRoot = join(__dirname, '..', '..', '__fixtures__', 'storybook');
    expect(detectStorybook(fixtureRoot)).toBe('.storybook/main.ts');
  });
});
