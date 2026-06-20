import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('optional @daytona/sdk in CLI (C11 / install-13)', () => {
  it('declares @daytona/sdk only under optionalDependencies', () => {
    const pkg = JSON.parse(
      readFileSync(path.join(repoRoot, 'packages/cli/package.json'), 'utf8'),
    ) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };

    expect(pkg.dependencies?.['@daytona/sdk']).toBeUndefined();
    expect(pkg.dependencies?.['@daytonaio/sdk']).toBeUndefined();
    expect(pkg.optionalDependencies?.['@daytona/sdk']).toMatch(/^\^0\./);
  });

  it('keeps dynamic import fallback in daytona sandbox source', () => {
    const source = readFileSync(
      path.join(repoRoot, 'packages/cli/src/sandbox/daytona.ts'),
      'utf8',
    );

    expect(source).toMatch(/await import\('@daytona\/sdk'\)/);
    expect(source).toMatch(/catch\s*\{[\s\S]*throw new Error/);
  });

  it('documents CLI-only install path: --omit=optional skips Daytona deprecation noise', () => {
    // install-13 customer impact is resolved when users install without optional
    // deps; cloud-api retains a hard @daytona/sdk dep as a private workspace pkg.
    const cloudApi = JSON.parse(
      readFileSync(path.join(repoRoot, 'packages/cloud-api/package.json'), 'utf8'),
    ) as { private?: boolean; dependencies?: Record<string, string> };

    expect(cloudApi.private).toBe(true);
    expect(cloudApi.dependencies?.['@daytona/sdk']).toMatch(/^\^0\./);
  });
});