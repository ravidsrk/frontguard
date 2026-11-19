import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import ts from 'typescript';
import { articles } from '../lib/docs-content';

// core/config.ts statically imports tsx/esm/api (which loads esbuild, incompatible
// with jsdom's cross-realm Uint8Array). configSchema itself never invokes tsImport.
vi.mock('tsx/esm/api', () => ({
  tsImport: () => {
    throw new Error('tsImport is unused during configSchema validation');
  },
}));

import { configSchema } from '../../../../packages/cli/src/core/config';
import {
  acceptBaselineInputSchema,
  getSuggestedFixInputSchema,
  inspectDiffClusterDomInputSchema,
  listHorizontalOverflowInputSchema,
  listRegressionsInputSchema,
  promoteBaselineInputSchema,
  recentRunsInputSchema,
  verifyCssPatchInputSchema,
} from '../../../../packages/mcp/src/tools/index';

const repoRoot = resolve(process.cwd(), '../..');

function articleElement(id: string) {
  const article = articles.find((value) => value.id === id);
  if (!article) throw new Error(`Missing article: ${id}`);
  const element = document.createElement('article');
  element.innerHTML = article.html;
  return element;
}

function snippets(id: string) {
  return [...articleElement(id).querySelectorAll('pre')].map((pre) => pre.textContent ?? '');
}

describe('copyable documentation contracts', () => {
  it('typechecks the plugin and configuration recipes against the built public packages', () => {
    const examples = [
      ...['cli/configuration', 'guides/accessibility', 'guides/performance-budgets', 'guides/ai-fixes',
        'guides/custom-plugins', 'guides/create-plugin', 'integrations/storybook']
        .flatMap((id) => snippets(id).filter((text) => /export default|export function/.test(text))),
      ...['skills/frontguard/SKILL.md', 'skills/frontguard/references/setup.md'].flatMap((file) =>
        [...readFileSync(`${repoRoot}/${file}`, 'utf8').matchAll(/```(?:typescript|ts)\n([\s\S]*?)```/g)]
          .map((match) => match[1]).filter((text) => text.includes('defineConfig'))),
      ...['README.md', 'packages/cli/README.md'].flatMap((file) =>
        [...readFileSync(`${repoRoot}/${file}`, 'utf8').matchAll(/```(?:typescript|ts)\n([\s\S]*?)```/g)]
          .map((match) => match[1]).filter((text) => text.includes('createAccessibilityPlugin'))),
    ];
    const files = new Map<string, string>();
    for (const [index, example] of examples.entries()) {
      const source = ts.createSourceFile('example.ts', example, ts.ScriptTarget.Latest, true);
      const exported = source.statements.find(ts.isExportAssignment);
      // A bare exported config otherwise gets no excess-property checking.
      const code = exported && ts.isObjectLiteralExpression(exported.expression)
        ? `import type { UserFrontguardConfig as DocsConfig } from '@frontguard/cli';\n` +
          example.slice(0, exported.expression.end) + ' satisfies DocsConfig' +
          example.slice(exported.expression.end)
        : example;
      files.set(resolve(repoRoot, `__docs_contract_${index}.ts`), code);
    }
    expect(files.size).toBeGreaterThanOrEqual(9);
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      skipLibCheck: true,
      types: ['node'],
    };
    const host = ts.createCompilerHost(options);
    const originalRead = host.readFile.bind(host);
    const originalExists = host.fileExists.bind(host);
    const originalSource = host.getSourceFile.bind(host);
    host.readFile = (file) => files.get(resolve(file)) ?? originalRead(file);
    host.fileExists = (file) => files.has(resolve(file)) || originalExists(file);
    host.getSourceFile = (file, language, onError, fresh) => files.has(resolve(file))
      ? ts.createSourceFile(file, files.get(resolve(file))!, language, true)
      : originalSource(file, language, onError, fresh);
    const program = ts.createProgram([...files.keys()], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    const messages = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => repoRoot,
      getNewLine: () => '\n',
    });
    expect(diagnostics, messages).toHaveLength(0);
  }, 30000);

  it('lists the real required and optional MCP inputs', () => {
    const schemas = {
      list_regressions: listRegressionsInputSchema,
      list_horizontal_overflow: listHorizontalOverflowInputSchema,
      inspect_diff_cluster_dom: inspectDiffClusterDomInputSchema,
      get_suggested_fix: getSuggestedFixInputSchema,
      verify_css_patch: verifyCssPatchInputSchema,
      promote_baseline: promoteBaselineInputSchema,
      accept_baseline: acceptBaselineInputSchema,
      recent_runs: recentRunsInputSchema,
    };
    const rows = [...articleElement('integrations/mcp').querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(Object.keys(schemas).length);
    for (const row of rows) {
      const [name, inputs] = [...row.querySelectorAll('td')].map((cell) => cell.textContent ?? '');
      const schema = schemas[name as keyof typeof schemas];
      expect(schema, name).toBeDefined();
      const requiredText = inputs.startsWith('optional ') ? '' : inputs.split(';')[0];
      const required = requiredText.match(/\b[a-z_]+\b/g)?.filter((key) => key !== 'true') ?? [];
      expect(required.sort(), name).toEqual(
        Object.entries(schema).filter(([, value]) => !value.isOptional()).map(([key]) => key).sort(),
      );
      const documented = inputs.match(/\b[a-z_]+\b/g)?.filter((key) => !['true', 'optional'].includes(key)) ?? [];
      expect([...new Set(documented)].sort(), name).toEqual(Object.keys(schema).sort());
    }
  });

  it.each([200, 503])('the Slack adapter translates a monitor alert and handles upstream HTTP %s', async (status) => {
    const code = snippets('integrations/slack')[0];
    const request = Object.assign(Readable.from([JSON.stringify({
      tool: 'frontguard-monitor', timestamp: '2026-10-20T00:00:00Z', alerts: [],
      summary: { total: 3, passed: 2, alerted: 1 },
    })]), { method: 'POST', url: '/alerts' });
    const response = { writeHead: vi.fn().mockReturnThis(), end: vi.fn() };
    let handle!: (req: typeof request, res: typeof response) => Promise<void>;
    const upstream = vi.fn().mockResolvedValue(new Response(null, { status }));
    const module = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
    new Function('require', 'exports', 'process', 'fetch', module.outputText)(
      (name: string) => {
        if (name !== 'node:http') throw new Error(`Unexpected adapter import: ${name}`);
        return { createServer: (listener: typeof handle) => {
          handle = listener;
          return { listen: vi.fn() };
        } };
      },
      {}, { env: { SLACK_WEBHOOK_URL: 'https://slack.example.test/hook' } }, upstream,
    );
    await handle(request, response);
    expect(upstream).toHaveBeenCalledOnce();
    expect(upstream.mock.calls[0][0]).toBe('https://slack.example.test/hook');
    expect(JSON.parse(upstream.mock.calls[0][1].body)).toEqual({
      text: 'Frontguard: 1 of 3 checks alerted',
    });
    expect(response.writeHead).toHaveBeenCalledWith(status === 200 ? 200 : 502);
  });

  it('validates config snippets in docs and skills against the live Zod configSchema', () => {
    const configBlocks = [
      ...snippets('cli/configuration').filter((text) => text.includes('export default {')),
      ...['skills/frontguard/SKILL.md', 'skills/frontguard/references/setup.md'].flatMap((file) =>
        [...readFileSync(`${repoRoot}/${file}`, 'utf8').matchAll(/```(?:typescript|ts)\n([\s\S]*?)```/g)]
          .map((match) => match[1])
          .filter((text) => text.includes('defineConfig(')),
      ),
    ];
    expect(configBlocks.length).toBeGreaterThanOrEqual(4);

    for (const block of configBlocks) {
      const transpiled = ts.transpileModule(block, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      });
      const exportsObj: { default?: unknown } = {};
      new Function('require', 'exports', transpiled.outputText)(
        (mod: string) => {
          if (mod === '@frontguard/cli') return { defineConfig: (cfg: unknown) => cfg };
          throw new Error(`Unexpected import: ${mod}`);
        },
        exportsObj,
      );
      const parsed = configSchema.safeParse(exportsObj.default);
      expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
    }
  });

  it('aligns guides/cloud-api endpoint rows with public/openapi.json', () => {
    const openapi = JSON.parse(
      readFileSync(`${repoRoot}/apps/web/public/openapi.json`, 'utf8'),
    ) as { paths: Record<string, Record<string, unknown>> };
    const rows = [...articleElement('guides/cloud-api').querySelectorAll('tbody tr')];
    expect(rows.length).toBeGreaterThanOrEqual(7);

    for (const row of rows) {
      const methodAndPath = (row.querySelector('td')?.textContent ?? '').trim();
      const [method, path] = methodAndPath.split(/\s+/);
      expect(openapi.paths[path], `Unknown OpenAPI path: ${methodAndPath}`).toBeDefined();
      expect(
        openapi.paths[path]?.[method.toLowerCase()],
        `Unknown OpenAPI method: ${methodAndPath}`,
      ).toBeDefined();
    }
  });

  it('keeps skills/frontguard Playwright reference and apps/demo free of stale options and CDN scripts', () => {
    const pwRef = readFileSync(`${repoRoot}/skills/frontguard/references/playwright.md`, 'utf8');
    expect(pwRef).toContain('FRONTGUARD_UPDATE=1');
    expect(pwRef).toContain("'__visual_baselines__'");
    expect(pwRef).toContain('default `0.01`');
    expect(pwRef).not.toContain('UPDATE_SNAPSHOTS=1');
    expect(pwRef).not.toContain('.frontguard/playwright');
    expect(pwRef).not.toContain('timeoutMs');

    const demoLayout = readFileSync(`${repoRoot}/apps/demo/app/layout.tsx`, 'utf8');
    expect(demoLayout).not.toContain('cdn.tailwindcss.com');
  });
});
