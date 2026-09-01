import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = readFileSync(
  path.join(repoRoot, '.github/workflows/deploy-web.yml'),
  'utf8',
);

describe('web deployment workflow contract', () => {
  it('binds the built and canonical deployment evidence to GITHUB_SHA', () => {
    expect(workflow).toContain('ref: ${{ github.sha }}');
    expect(workflow).toContain('printf \'%s\\n\' "$GITHUB_SHA" > apps/web/public/.deploy-version');
    expect(workflow).toContain('$CANONICAL_URL/.deploy-version?deploy_sha=$GITHUB_SHA');
    expect(workflow).toContain('[ "$deployed_sha" = "$GITHUB_SHA" ]');
    expect(workflow).toContain('deployedSha: process.env.DEPLOY_SHA');
    expect(workflow).toContain('deploy-web-evidence-${{ github.sha }}');
  });

  it('probes every required canonical route and key static/runtime assets after deploy', () => {
    const deployIndex = workflow.indexOf('uses: cloudflare/wrangler-action@v3');
    const probeIndex = workflow.indexOf('name: Probe canonical deployment');
    expect(deployIndex).toBeGreaterThan(-1);
    expect(probeIndex).toBeGreaterThan(deployIndex);
    expect(workflow).toContain('CANONICAL_URL: https://frontguard.dev');

    for (const requiredPath of [
      '/',
      '/docs',
      '/privacy',
      '/terms',
      '/status',
      '/sitemap.xml',
      '/agents.md',
      '/openapi.json',
      '/.well-known/mcp.json',
      '/favicon.svg',
      '/logo-32.png',
      '/og-image.png',
    ]) {
      expect(workflow, `missing canonical probe for ${requiredPath}`).toContain(`'${requiredPath}'`);
    }
    expect(workflow).toContain('\\/assets\\/');
    expect(workflow).toContain('runtime-assets.txt');
  });

  it('verifies release-status copy and logs the deployed SHA', () => {
    expect(workflow).toContain('The CLI is public. Integrations remain pre-release.');
    expect(workflow).toContain(
      'Source version 0.2.3 is a release candidate and has not been published yet.',
    );
    expect(workflow).toContain('Canonical deployed SHA: $deployed_sha');
    expect(workflow).toContain('Deployed SHA: \\`$GITHUB_SHA\\`');
    expect(workflow).toContain('steps.deploy.outputs.deployment-url');
  });
});
