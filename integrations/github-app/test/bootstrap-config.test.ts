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
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { DEFAULT_CONFIG_TS, DEFAULT_WORKFLOW_YML, ACTION_REF } from '../src/github-api.js';

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
    expect(ACTION_REF).toBe('ravidsrk/frontguard@v1');
    expect(DEFAULT_WORKFLOW_YML).toContain(`uses: ${ACTION_REF}`);
    expect(DEFAULT_WORKFLOW_YML).not.toContain('@main');
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
