import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../packages/cli/src/core/config.js';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const verifiedCliVersion = '0.2.2';
const markdownPaths = [
  'apps/demo/README.md',
  'demo/README.md',
  'docs/launch/devto-article.md',
  'docs/launch/reddit-posts.md',
  'packages/playwright/README.md',
] as const;

interface CodeBlock {
  code: string;
  file: string;
  line: number;
}

function read(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

function codeBlocks(languages: readonly string[]): CodeBlock[] {
  const languagePattern = languages.join('|');
  const fence = '```';
  const pattern = new RegExp(
    `${fence}(?:${languagePattern})\\r?\\n([\\s\\S]*?)${fence}`,
    'g',
  );
  const blocks: CodeBlock[] = [];

  for (const file of markdownPaths) {
    const contents = read(file);
    for (const match of contents.matchAll(pattern)) {
      blocks.push({
        code: match[1],
        file,
        line: contents.slice(0, match.index).split('\n').length,
      });
    }
  }

  return blocks;
}

function compileTypeScript(block: CodeBlock, index: number): readonly ts.Diagnostic[] {
  const virtualPath = resolve(repoRoot, `__launch_example_${index}.ts`);
  const options: ts.CompilerOptions = {
    baseUrl: repoRoot,
    esModuleInterop: true,
    ignoreDeprecations: '6.0',
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    paths: {
      '@frontguard/playwright': ['packages/playwright/src/index.ts'],
    },
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    types: ['node'],
  };
  const host = ts.createCompilerHost(options);
  const defaultFileExists = host.fileExists.bind(host);
  const defaultGetSourceFile = host.getSourceFile.bind(host);
  const defaultReadFile = host.readFile.bind(host);

  host.fileExists = (fileName) => resolve(fileName) === virtualPath || defaultFileExists(fileName);
  host.readFile = (fileName) =>
    resolve(fileName) === virtualPath ? block.code : defaultReadFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) =>
    resolve(fileName) === virtualPath
      ? ts.createSourceFile(fileName, block.code, languageVersion, true)
      : defaultGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);

  const program = ts.createProgram([virtualPath], options, host);
  return ts.getPreEmitDiagnostics(program);
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => repoRoot,
    getNewLine: () => '\n',
  });
}

function workflowRunScripts(workflow: string): string[] {
  const lines = workflow.split('\n');
  const scripts: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^ {8}run:\s*(.*)$/);
    if (!match) continue;

    if (match[1] !== '|') {
      scripts.push(match[1]);
      continue;
    }

    const block: string[] = [];
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (line === '') {
        block.push('');
        continue;
      }
      if (!line.startsWith('          ')) {
        index -= 1;
        break;
      }
      block.push(line.slice(10));
    }
    scripts.push(block.join('\n'));
  }

  return scripts;
}

describe('copy-ready launch examples', () => {
  it('uses only the exported visualTest API and asserts every result', () => {
    const allCopy = markdownPaths.map(read).join('\n');
    expect(allCopy).not.toContain('expectVisual');

    let visualTestCalls = 0;
    for (const block of codeBlocks(['ts', 'typescript'])) {
      const source = ts.createSourceFile(block.file, block.code, ts.ScriptTarget.ES2022, true);
      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'visualTest'
        ) {
          visualTestCalls += 1;
          let ancestor: ts.Node | undefined = node.parent;
          while (ancestor && !ts.isVariableDeclaration(ancestor)) ancestor = ancestor.parent;
          expect(ancestor, `${block.file}:${block.line} must assign visualTest's result`).toBeDefined();
          expect(ts.isVariableDeclaration(ancestor!) && ts.isIdentifier(ancestor!.name)).toBe(true);
          const resultName = (ancestor as ts.VariableDeclaration).name.getText(source);
          const assertion = new RegExp(
            `expect\\(\\s*${resultName}\\.passed\\s*\\)\\.toBe\\(\\s*true\\s*\\)`,
          );
          expect(block.code, `${block.file}:${block.line} must assert ${resultName}.passed`).toMatch(
            assertion,
          );
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }

    expect(visualTestCalls).toBeGreaterThanOrEqual(9);
  });

  it('type-checks every TypeScript example against the workspace API', () => {
    const blocks = codeBlocks(['ts', 'typescript']);
    expect(blocks.length).toBeGreaterThan(0);

    blocks.forEach((block, index) => {
      const diagnostics = compileTypeScript(block, index);
      expect(
        formatDiagnostics(diagnostics),
        `${block.file}:${block.line} must compile`,
      ).toBe('');
    });
    // Invokes the TypeScript compiler once per example block, so runtime scales
    // with the number of examples and the host's speed. It lands around 10s on
    // a CI runner, well past vitest's 5s default -- the timeout was the reason
    // this failed in CI while passing locally.
  }, 60_000);

  it('syntax-checks every copy-ready shell example', () => {
    const blocks = codeBlocks(['bash', 'sh', 'shell']);
    expect(blocks.length).toBeGreaterThan(0);

    for (const block of blocks) {
      const result = spawnSync('bash', ['-n'], { encoding: 'utf8', input: block.code });
      expect(result.status, `${block.file}:${block.line}\n${result.stderr}`).toBe(0);
    }
  });

  it('pins every copy-ready Frontguard CLI command to the published release', () => {
    const workflow = read('.github/workflows/frontguard-example.yml');
    const commandLines = [...markdownPaths.map(read), workflow]
      .flatMap((contents) => contents.split('\n'))
      .filter((line) => /\bfrontguard run\b/.test(line));

    expect(commandLines.length).toBeGreaterThan(0);
    for (const line of commandLines) {
      expect(line).toContain(`@frontguard/cli@${verifiedCliVersion}`);
    }
    expect(commandLines.join('\n')).not.toMatch(/\bnpx\s+(?:-p\s+\S+\s+)?frontguard\b/);
  });
});

describe('repository-only example workflow', () => {
  const workflow = read('.github/workflows/frontguard-example.yml');

  it('uses syntactically valid shell for every run step', () => {
    const scripts = workflowRunScripts(workflow);
    expect(scripts.length).toBeGreaterThanOrEqual(7);

    for (const script of scripts) {
      const githubExpressionsRemoved = script.replace(/\$\{\{.*?\}\}/g, 'false');
      const result = spawnSync('bash', ['-n'], {
        encoding: 'utf8',
        input: githubExpressionsRemoved,
      });
      expect(result.status, `${script}\n${result.stderr}`).toBe(0);
    }
  });

  it('starts an actual workspace script rather than a missing root dev script', () => {
    const rootPackage = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
      workspaces: string[];
    };
    const demoPackage = JSON.parse(read('apps/demo/package.json')) as {
      scripts: Record<string, string>;
    };

    expect(rootPackage.scripts.dev).toBeUndefined();
    expect(rootPackage.workspaces).toContain('apps/*');
    expect(demoPackage.scripts.dev).toBe('next dev');
    expect(workflow).toContain('npm run dev --workspace=apps/demo');
    expect(workflow).not.toMatch(/npm run dev\s*&/);
    expect(workflow).not.toContain('npx wait-on');
  });

  it('persists reviewed baselines and proves an opt-in regression', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).not.toMatch(/^\s*pull_request:/m);
    expect(workflow).toContain('update_baselines:');
    expect(workflow).toContain('negative_control:');
    expect(workflow).toContain('git fetch origin refs/heads/frontguard-baselines');
    expect(workflow).toContain('--update-baselines');
    expect(workflow).toContain('git push origin frontguard-baselines:frontguard-baselines');
    expect(workflow).toContain('FRONTGUARD_DEMO_NEGATIVE_CONTROL=');
    expect(workflow).toContain('Negative control expected exit 1');
    expect(workflow).toContain('.summary.regressions > 0');
  });

  it('runs the pinned CLI directly without claiming Action acceptance', () => {
    const pins = [...workflow.matchAll(/@frontguard\/cli@(\d+\.\d+\.\d+)/g)].map(
      (match) => match[1],
    );
    expect(pins.length).toBeGreaterThanOrEqual(3);
    expect(new Set(pins)).toEqual(new Set([verifiedCliVersion]));
    expect(workflow).toContain(
      'npm exec --yes --package="playwright@1.61.0" -- playwright install --with-deps chromium',
    );
    expect(workflow).not.toMatch(/uses:\s*[^\n]*frontguard/i);
    expect(workflow).toContain('does not invoke, validate, or claim acceptance');
    expect(existsSync(resolve(repoRoot, 'apps/demo/frontguard.config.ts'))).toBe(true);
  });

  it('loads the workflow config through the real CLI schema', async () => {
    const config = await loadConfig(resolve(repoRoot, 'apps/demo/frontguard.config.ts'));
    expect(config).toMatchObject({
      baseUrl: 'http://127.0.0.1:3000',
      browsers: ['chromium'],
      routes: [{ path: '/' }, { path: '/pricing' }, { path: '/about' }],
      version: 1,
      viewports: [375, 1440],
    });
    expect(config.ai).toBeUndefined();
  });
});

describe('pre-release demo evidence gate', () => {
  it('contains no fake terminal runner or placeholder screenshot', () => {
    expect(existsSync(resolve(repoRoot, 'demo/frontguard-demo.tape'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'demo/scripts/fg-demo'))).toBe(false);
    expect(existsSync(resolve(repoRoot, 'apps/demo/public/screenshot.png'))).toBe(false);

    const fixtureSource = read('demo/frontguard-demo.svg');
    expect(fixtureSource).toContain('PRE-RELEASE FIXTURE');
    expect(fixtureSource).toContain('illustrative, not executable proof');

    const fixture = readFileSync(resolve(repoRoot, 'demo/frontguard-demo.gif'));
    expect(fixture.subarray(0, 6).toString('ascii')).toMatch(/^GIF8[79]a$/);
    expect(fixture.includes(Buffer.from('FRONTGUARD_PRE_RELEASE_FIXTURE'))).toBe(true);
  });

  it('keeps the negative control disabled unless the workflow opts in', () => {
    const layout = read('apps/demo/app/layout.tsx');
    expect(layout).toContain("process.env.FRONTGUARD_DEMO_NEGATIVE_CONTROL === '1'");
    expect(layout).toContain("transform: 'translateX(160px)'");
  });
});
