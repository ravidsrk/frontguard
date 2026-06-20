import { describe, it, expect } from 'vitest';
import { getFrameworkInfo, FRAMEWORK_TEMPLATES } from '../../src/templates/index.js';
import { generateGitHubActionsWorkflow } from '../../src/templates/github-actions.js';
import { generateDefaultConfig } from '../../src/core/config.js';

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
      expect(info.defaultPort).toBeGreaterThan(0);
      expect(info.devCommand).toBeTruthy();
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
    expect(yaml).toContain('npx -p @frontguard/cli frontguard run');
    expect(yaml).toContain('actions/checkout@v4');
    expect(yaml).toContain('fetch-depth: 0');
    expect(yaml).toContain('pull-requests: write');
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
    expect(generateGitHubActionsWorkflow()).toContain('actions/cache@v4');
  });
});
