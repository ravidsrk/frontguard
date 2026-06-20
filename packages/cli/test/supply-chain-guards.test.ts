import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('supply-chain guards (C11)', () => {
  it('keeps @daytona/sdk optional in the CLI manifest', () => {
    const pkg = JSON.parse(
      readFileSync(path.join(repoRoot, 'packages/cli/package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };

    expect(pkg.dependencies?.['@daytona/sdk']).toBeUndefined();
    expect(pkg.optionalDependencies?.['@daytona/sdk']).toMatch(/^\^0\./);
  });

  it('retains dynamic import fallback in daytona sandbox', () => {
    const source = readFileSync(
      path.join(repoRoot, 'packages/cli/src/sandbox/daytona.ts'),
      'utf8',
    );

    expect(source).toMatch(/await import\('@daytona\/sdk'\)/);
    expect(source).toMatch(/catch\s*\{[\s\S]*throw new Error/);
  });

  it('configures dependabot for npm and github-actions', () => {
    const yaml = readFileSync(path.join(repoRoot, '.github/dependabot.yml'), 'utf8');

    expect(yaml).toMatch(/^version:\s*2/m);
    expect(yaml).toMatch(/package-ecosystem:\s*"npm"/);
    expect(yaml).toMatch(/package-ecosystem:\s*"github-actions"/);
    expect(yaml).toMatch(/otel:/);
  });

  it('enforces the npm audit CI gate without continue-on-error', () => {
    const workflow = readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');

    expect(workflow).toMatch(/^\s+audit:/m);
    expect(workflow).toMatch(/npm audit --omit=dev --audit-level=high/);
    expect(workflow).not.toMatch(/continue-on-error:\s*true/);
  });
});