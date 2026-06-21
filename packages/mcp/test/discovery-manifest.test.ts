import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

interface ManifestTool {
  name: string;
  description: string;
}

interface DiscoveryManifest {
  name: string;
  version: string;
  package: {
    name: string;
  };
  tools: ManifestTool[];
}

interface SourceMetadata {
  serverName: string;
  serverVersion: string;
  tools: ManifestTool[];
}

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, '..');
const repoRoot = resolve(packageRoot, '..', '..');
const manifestPath = resolve(repoRoot, 'apps/web/public/.well-known/mcp.json');
const sourcePath = resolve(packageRoot, 'src/index.ts');

function stringLiteralValue(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

function objectStringProperty(
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): string {
  const property = objectLiteral.properties.find((candidate) => {
    return (
      ts.isPropertyAssignment(candidate) &&
      ts.isIdentifier(candidate.name) &&
      candidate.name.text === propertyName
    );
  });

  if (!property || !ts.isPropertyAssignment(property)) {
    throw new Error(`Missing ${propertyName} property`);
  }

  const value = stringLiteralValue(property.initializer);
  if (value === null) {
    throw new Error(`${propertyName} property is not a string literal`);
  }
  return value;
}

function metadataFromSource(sourceText: string): SourceMetadata {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const constants = new Map<string, string>();
  const tools: ManifestTool[] = [];

  function visit(node: ts.Node): void {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
        const value = stringLiteralValue(declaration.initializer);
        if (value !== null) constants.set(declaration.name.text, value);
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'registerTool'
    ) {
      const [nameArgument, optionsArgument] = node.arguments;
      if (
        nameArgument &&
        optionsArgument &&
        (ts.isStringLiteral(nameArgument) || ts.isNoSubstitutionTemplateLiteral(nameArgument)) &&
        ts.isObjectLiteralExpression(optionsArgument)
      ) {
        tools.push({
          name: nameArgument.text,
          description: objectStringProperty(optionsArgument, 'description'),
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  const serverName = constants.get('SERVER_NAME');
  const serverVersion = constants.get('SERVER_VERSION');
  if (!serverName || !serverVersion) {
    throw new Error('Missing SERVER_NAME or SERVER_VERSION constants');
  }
  return { serverName, serverVersion, tools };
}

describe('web MCP discovery manifest', () => {
  it('is valid JSON and stays in sync with the MCP server metadata', async () => {
    const manifestText = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestText) as DiscoveryManifest;
    const source = metadataFromSource(await readFile(sourcePath, 'utf8'));

    expect(manifest.name).toBe(source.serverName);
    expect(manifest.version).toBe(source.serverVersion);
    expect(manifest.package.name).toBe(source.serverName);
    expect(JSON.stringify(manifest)).toContain('api.frontguard.dev');

    const manifestTools = new Map(
      manifest.tools.map((tool) => [tool.name, tool.description] as const),
    );
    expect(manifest.tools).toHaveLength(source.tools.length);
    expect(manifestTools.size).toBe(source.tools.length);
    expect([...manifestTools.keys()].sort()).toEqual(
      source.tools.map((tool) => tool.name).sort(),
    );
    for (const tool of source.tools) {
      expect(manifestTools.get(tool.name)).toBe(tool.description);
    }
  });
});
