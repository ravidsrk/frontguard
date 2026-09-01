import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { getFrameworkInfo, FRAMEWORK_TEMPLATES } from '../../src/templates/index.js';
import { generateGitHubActionsWorkflow } from '../../src/templates/github-actions.js';
import { generateDefaultConfig } from '../../src/core/config.js';

const cliVersion = readFileSync(new URL('../../../../VERSION', import.meta.url), 'utf8').trim();

describe('getFrameworkInfo', () => {
  it('returns Next.js metadata with port 3000', () => {
    const info = getFrameworkInfo('Next.js');
    expect(info.name).toBe('Next.js');
    expect(info.defaultPort).toBe(3000);
    expect(info.fileSystemRouting).toBe(true);
  });

  it('returns SvelteKit metadata with port 5173', () => {
    expect(getFrameworkInfo('SvelteKit').defaultPort).toBe(5173);
  });

  it('returns Astro metadata with port 4321', () => {
    expect(getFrameworkInfo('Astro').defaultPort).toBe(4321);
  });

  it('falls back to generic for unknown framework', () => {
    expect(getFrameworkInfo('Unknown').name).toBe('generic');
  });

  it('falls back to generic for null', () => {
    expect(getFrameworkInfo(null).name).toBe('generic');
  });

  it('every template has required fields', () => {
    for (const info of Object.values(FRAMEWORK_TEMPLATES)) {
      expect(info.name).toBeTruthy();
      expect(Array.isArray(info.dependencyNames)).toBe(true);
      expect(info.defaultPort).toBeGreaterThan(0);
      expect(info.devCommand).toBeTruthy();
      expect(info.ciScripts.length).toBeGreaterThan(0);
      expect(Array.isArray(info.typicalRoutes)).toBe(true);
    }
  });
});

describe('generateDefaultConfig with framework metadata', () => {
  it('Next.js config uses port 3000 baseUrl', () => {
    const config = generateDefaultConfig({ framework: 'Next.js', format: 'ts' });
    expect(config).toContain('http://localhost:3000');
    expect(config).toContain('Detected: Next.js');
    // file-system routed → routes commented out
    expect(config).toContain('// routes:');
  });

  it('SvelteKit config uses port 5173 baseUrl', () => {
    const config = generateDefaultConfig({ framework: 'SvelteKit', format: 'ts' });
    expect(config).toContain('http://localhost:5173');
  });

  it('Vite config uses explicit routes (not file-system routed)', () => {
    const config = generateDefaultConfig({ framework: 'Vite', format: 'ts' });
    expect(config).toMatch(/\n\s*routes: \['\/'\],/);
  });

  it('generic config has no framework comment', () => {
    const config = generateDefaultConfig({ format: 'ts' });
    expect(config).not.toContain('Detected:');
    expect(config).toContain('threshold: 0.1, // Changed-pixel ratio: 0.1 = 10%');
  });

  it('JSON format uses typical routes', () => {
    const config = generateDefaultConfig({ framework: 'Next.js', format: 'json' });
    const parsed = JSON.parse(config);
    expect(parsed.baseUrl).toBe('http://localhost:3000');
    expect(parsed.routes).toEqual(['/', '/about']);
  });

  it('explicit baseUrl overrides framework default', () => {
    const config = generateDefaultConfig({
      framework: 'Next.js',
      baseUrl: 'http://localhost:8080',
      format: 'ts',
    });
    expect(config).toContain('http://localhost:8080');
  });
});

describe('generateGitHubActionsWorkflow', () => {
  it('generates a valid workflow with defaults', () => {
    const yaml = generateGitHubActionsWorkflow();
    expect(yaml).toContain('name: Frontguard');
    expect(yaml).toContain('pull_request');
    expect(yaml).toContain(
      `npm exec --yes --package="@frontguard/cli@${cliVersion}" -- frontguard run`,
    );
    expect(yaml).toContain('actions/checkout@v4');
    expect(yaml).toContain('fetch-depth: 0');
    expect(yaml).toContain('contents: read');
    expect(yaml).not.toContain('contents: write');
    expect(yaml).toContain('pull-requests: write');
    expect(yaml).toContain('group: frontguard-${{ github.event.pull_request.number || github.ref }}');
    expect(yaml).toContain('cancel-in-progress: true');
    expect(yaml).toContain('actions/upload-artifact@v7');
    expect(yaml).toContain('actions/upload-artifact@v3.2.2-node20');
    expect(yaml).toContain("github.server_url == 'https://github.com'");
    expect(yaml).toContain("github.server_url != 'https://github.com'");
    expect(yaml).not.toContain('continue-on-error: true');
    expect(yaml).toContain('id: frontguard');
    expect(yaml).toContain('path: ${{ steps.frontguard.outputs.report-path }}');
    expect(yaml).toContain('if-no-files-found: error');
    expect(yaml).toContain("printf 'report-path<<%s\\n' \"$DELIM\"");
  });

  it('respects custom port', () => {
    const yaml = generateGitHubActionsWorkflow({ port: 5173 });
    expect(yaml).toContain('http://localhost:5173');
  });

  it('respects custom dev command', () => {
    const yaml = generateGitHubActionsWorkflow({ devCommand: 'pnpm dev' });
    expect(yaml).toContain('pnpm dev');
  });

  it('caches Playwright browsers', () => {
    const yaml = generateGitHubActionsWorkflow();
    expect(yaml).toContain('actions/setup-node@v7');
    expect(yaml).toContain('actions/cache@v6');
    expect(yaml).toContain(`playwright-frontguard-${cliVersion}-`);
    expect(yaml).toContain(
      `npm exec --yes --package="@frontguard/cli@${cliVersion}" -- playwright install`,
    );
    expect(yaml).toContain('playwright install --with-deps chromium firefox webkit');
    expect(yaml).not.toContain('npx playwright install');
  });
});
