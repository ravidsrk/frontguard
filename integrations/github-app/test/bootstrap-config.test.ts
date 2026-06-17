/**
 * Compile-time verification of the bootstrap config the GitHub App plants
 * via {@link bootstrapConfigPr}.
 *
 * The bug we're guarding against (P0-9) is silent: a config that imports a
 * non-existent module compiles to JavaScript fine, but blows up at runtime
 * the first time it's loaded. The fix re-pointed the import at
 * `@frontguard/cli`; this test makes sure it stays pointed there by
 * actually running TypeScript over the generated string against a small
 * stub `@frontguard/cli` package.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { DEFAULT_CONFIG_TS, DEFAULT_WORKFLOW_YML, ACTION_REF } from '../src/github-api.js';

/** Repo-root `action.yml` (the shim that makes `uses: <owner>/<repo>@<ref>` resolve). */
const ROOT_ACTION_YML = fileURLToPath(new URL('../../../action.yml', import.meta.url));
/** Canonical sub-path manifest the root shim mirrors. */
const CLI_ACTION_YML = fileURLToPath(new URL('../../../packages/cli/action.yml', import.meta.url));

/**
 * Extracts the top-level keys under an action.yml's `inputs:` block without a
 * YAML parser — the github-app package declares none, and we don't want a
 * phantom dependency in a regression guard. Relies only on the well-formed
 * two-space indentation both action.yml files use (input names at two spaces,
 * their properties at four).
 */
function actionInputKeys(yml: string): string[] {
  const keys: string[] = [];
  let inInputs = false;
  for (const line of yml.split('\n')) {
    if (/^inputs:\s*$/.test(line)) {
      inInputs = true;
      continue;
    }
    if (!inInputs) continue;
    // A non-indented, non-blank line ends the block (e.g. `outputs:` / `runs:`).
    if (/^\S/.test(line)) break;
    const m = line.match(/^ {2}([A-Za-z][\w-]*):/);
    if (m) keys.push(m[1]);
  }
  return keys.sort();
}

/** Minimal `.d.ts` for `@frontguard/cli` matching the real public surface. */
const CLI_DTS = `
declare module '@frontguard/cli' {
  export interface UserFrontguardConfig {
    version?: number;
    baseUrl: string;
    routes?: Array<string | { path: string; threshold?: number; label?: string }>;
    viewports?: number[];
    browsers?: Array<'chromium' | 'firefox' | 'webkit'>;
    threshold?: number;
    smartRender?: boolean;
    workers?: number;
    pageTimeout?: number;
    maxHeight?: number;
    outputDir?: string;
  }
  export function defineConfig(config: UserFrontguardConfig): UserFrontguardConfig;
}
`;

/**
 * Compiles a single TypeScript source string in a throwaway directory with a
 * stub `@frontguard/cli` declaration. Returns the diagnostics array.
 */
function compile(source: string, fileName = 'frontguard.config.ts'): readonly ts.Diagnostic[] {
  const dir = mkdtempSync(join(tmpdir(), 'fg-bootstrap-'));
  try {
    const cliDir = join(dir, 'node_modules', '@frontguard', 'cli');
    mkdirSync(cliDir, { recursive: true });
    writeFileSync(
      join(cliDir, 'package.json'),
      JSON.stringify({ name: '@frontguard/cli', types: 'index.d.ts' }),
    );
    writeFileSync(join(cliDir, 'index.d.ts'), CLI_DTS);
    const filePath = join(dir, fileName);
    writeFileSync(filePath, source);

    const program = ts.createProgram({
      rootNames: [filePath],
      options: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        skipLibCheck: true,
      },
    });
    return ts.getPreEmitDiagnostics(program);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('DEFAULT_CONFIG_TS', () => {
  it('imports from @frontguard/cli (not the never-published @frontguard/core)', () => {
    expect(DEFAULT_CONFIG_TS).toContain("from '@frontguard/cli'");
    expect(DEFAULT_CONFIG_TS).not.toContain('@frontguard/core');
  });

  it('uses defineConfig as the wrapper', () => {
    expect(DEFAULT_CONFIG_TS).toContain('defineConfig');
  });

  it('TypeScript-compiles against @frontguard/cli with zero errors', () => {
    const diagnostics = compile(DEFAULT_CONFIG_TS);
    const formatted = diagnostics
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
      .join('\n');
    expect(formatted, formatted).toBe('');
    expect(diagnostics.length).toBe(0);
  });

  it('catches a regression to the old import', () => {
    // Sanity check: if we swap the import back to @frontguard/core (the bug),
    // the compile should fail. This proves the compile step is doing work.
    const broken = DEFAULT_CONFIG_TS.replace('@frontguard/cli', '@frontguard/core');
    const diagnostics = compile(broken);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('rejects an obviously-wrong config (negative-control)', () => {
    const broken = `
      import { defineConfig } from '@frontguard/cli';
      // baseUrl is required — this should fail to type-check.
      export default defineConfig({ routes: ['/'] });
    `;
    const diagnostics = compile(broken);
    expect(diagnostics.length).toBeGreaterThan(0);
  });
});

describe('DEFAULT_WORKFLOW_YML', () => {
  it('pins to the tagged action ref (not @main)', () => {
    expect(ACTION_REF).toBe('ravidsrk/frontguard@v0');
    expect(DEFAULT_WORKFLOW_YML).toContain(`uses: ${ACTION_REF}`);
    expect(DEFAULT_WORKFLOW_YML).not.toContain('@main');
  });

  it('pins the bootstrap workflow to a major tag that resolves to a repo-root action.yml', () => {
    // Regression guard for int-3: the bootstrap workflow used to pin `@v1`
    // (no such tag) against a repo with no repo-root action.yml, so every
    // fresh install got a Day-1 red CI run.

    // 1. The ref must be a bare major tag (`@v0`, `@v1`, …) — never `@main`,
    //    never a non-existent `@v1`, never a sub-path/SHA form.
    expect(ACTION_REF).toMatch(/^ravidsrk\/frontguard@v\d+$/);

    // 2. A repo-root action.yml must exist for the ref to resolve at all —
    //    GitHub does not honour the sub-path packages/cli/action.yml here.
    expect(existsSync(ROOT_ACTION_YML)).toBe(true);
    expect(existsSync(CLI_ACTION_YML)).toBe(true);

    // 3. The root shim must expose the same inputs as the canonical manifest,
    //    so a user pinning the major tag gets identical behaviour to the
    //    sub-path form.
    const rootInputs = actionInputKeys(readFileSync(ROOT_ACTION_YML, 'utf8'));
    const cliInputs = actionInputKeys(readFileSync(CLI_ACTION_YML, 'utf8'));
    expect(rootInputs.length).toBeGreaterThan(0);
    expect(rootInputs).toEqual(cliInputs);
  });

  it('triggers on the PR actions we care about', () => {
    for (const action of ['opened', 'synchronize', 'reopened', 'ready_for_review']) {
      expect(DEFAULT_WORKFLOW_YML).toContain(action);
    }
  });

  it('checks out the repo before running the action', () => {
    expect(DEFAULT_WORKFLOW_YML).toContain('actions/checkout@v4');
  });
});
