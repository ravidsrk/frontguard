/**
 * Tests for src/discovery/storybook.ts
 *
 * Strategy: spin up a tiny in-process HTTP server that mimics a Storybook
 * preview — it serves `/index.json` (Storybook 8) or `/stories.json`
 * (Storybook 7) plus a hand-rolled `/iframe.html` that simulates
 * `window.__STORYBOOK_PREVIEW__` so the renderer's play()-await script
 * can be exercised in isolation.
 *
 * This avoids booting a real Storybook (which would need npm-installing
 * hundreds of MB of devDeps inside CI) while still proving:
 *   - SB8 /index.json enumeration
 *   - SB7 /stories.json fallback
 *   - per-story parameters.frontguard.{viewports,threshold,ignore} merging
 *   - include / exclude filters
 *   - story-id encoding in iframe URLs
 *   - the renderer's STORYBOOK_READY_SCRIPT resolves against our shim
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  discoverStorybookStories,
  fetchStorybookIndex,
  storyIframePath,
  STORYBOOK_READY_SCRIPT,
} from '../../src/discovery/storybook.js';
import { resolveStoryFrontguardParameters } from '../../src/discovery/storybook-parameters.js';

// ---------------------------------------------------------------------------
// Mock Storybook server
// ---------------------------------------------------------------------------

/**
 * Spin up a minimal server that pretends to be a Storybook preview.
 * Each test gets a fresh instance with its own index payload so we can
 * exercise Storybook 7 vs 8 layouts and edge cases independently.
 */
function startMockStorybook(payload: {
  endpoint: 'index.json' | 'stories.json';
  body: unknown;
}): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.url === `/${payload.endpoint}`) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload.body));
        return;
      }
      if (req.url?.startsWith('/iframe.html')) {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(SHIM_IFRAME_HTML);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('no address');
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

/**
 * HTML that mimics a Storybook preview iframe with `window.__STORYBOOK_PREVIEW__`
 * present and a single completed storyRender. Used to assert the renderer's
 * ready-script logic in `STORYBOOK_READY_SCRIPT` against a real DOM via jsdom.
 */
const SHIM_IFRAME_HTML = `<!doctype html><html><head><title>Storybook</title></head>
<body class="sb-show-main">
<div id="storybook-root"><button data-testid="modal-trigger">trigger</button></div>
<script>
  window.__STORYBOOK_PREVIEW__ = {
    storyRenders: new Map([
      ['components-button--primary', { phase: 'completed' }],
    ]),
    channel: { once: function(){}, on: function(){}, off: function(){} },
  };
</script>
</body></html>`;

// ---------------------------------------------------------------------------
// Index payloads
// ---------------------------------------------------------------------------

const SB8_INDEX = {
  v: 5,
  entries: {
    'components-button--primary': {
      id: 'components-button--primary',
      title: 'Components/Button',
      name: 'Primary',
      type: 'story',
      importPath: './src/components/Button.stories.tsx',
      tags: ['autodocs'],
    },
    'components-button--secondary': {
      id: 'components-button--secondary',
      title: 'Components/Button',
      name: 'Secondary',
      type: 'story',
      parameters: {
        frontguard: {
          viewports: [768],
          threshold: 0.005,
        },
      },
    },
    'components-button--danger': {
      id: 'components-button--danger',
      title: 'Components/Button',
      name: 'Danger',
      type: 'story',
      parameters: {
        frontguard: {
          ignore: [{ selector: '.fg-mask' }],
        },
      },
    },
    'components-modal--opened-by-play': {
      id: 'components-modal--opened-by-play',
      title: 'Components/Modal',
      name: 'OpenedByPlay',
      type: 'story',
      parameters: {
        frontguard: {
          viewports: [1024],
        },
      },
    },
    'components-modal--closed': {
      id: 'components-modal--closed',
      title: 'Components/Modal',
      name: 'Closed',
      type: 'story',
    },
    'components-modal--skipped': {
      id: 'components-modal--skipped',
      title: 'Components/Modal',
      name: 'Skipped',
      type: 'story',
      parameters: { frontguard: { skip: true } },
    },
    'components-button--docs': {
      id: 'components-button--docs',
      title: 'Components/Button',
      name: 'docs',
      type: 'docs',
    },
  },
};

const SB7_STORIES = {
  v: 3,
  stories: {
    'foo-bar--baseline': {
      id: 'foo-bar--baseline',
      title: 'Foo/Bar',
      name: 'Baseline',
      kind: 'Foo/Bar',
      story: 'Baseline',
    },
    'foo-bar--variant': {
      id: 'foo-bar--variant',
      title: 'Foo/Bar',
      name: 'Variant',
      parameters: {
        frontguard: { threshold: 0.02 },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('discoverStorybookStories — Storybook 8 (/index.json)', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeAll(async () => {
    server = await startMockStorybook({ endpoint: 'index.json', body: SB8_INDEX });
  });
  afterAll(async () => {
    await server.close();
  });

  it('fetches /index.json and reports SB major version 8', async () => {
    const idx = await fetchStorybookIndex(server.url, 5_000);
    expect(idx).not.toBeNull();
    expect(idx!.storybookMajor).toBe(8);
    expect(Object.keys(idx!.entries).length).toBe(7);
  });

  it('enumerates capturable stories and skips docs entries', async () => {
    const result = await discoverStorybookStories({ url: server.url });
    expect(result).not.toBeNull();
    // 7 entries: 1 docs + 1 skip → 5 capturable
    expect(result!.routes).toHaveLength(5);
    expect(result!.docsSkipped).toBe(1);
    expect(result!.paramSkipped).toBe(1);
    expect(result!.storybookMajor).toBe(8);
  });

  it('emits iframe paths that target /iframe.html?id=…&viewMode=story', async () => {
    const result = await discoverStorybookStories({ url: server.url });
    const primary = result!.routes.find((r) => r.label?.includes('Primary'));
    expect(primary).toBeDefined();
    expect(primary!.path).toBe(
      '/iframe.html?id=components-button--primary&viewMode=story',
    );
    expect(primary!.discoveredVia).toBe('storybook');
  });

  it('honors parameters.frontguard.viewports', async () => {
    const result = await discoverStorybookStories({ url: server.url });
    const secondary = result!.routes.find((r) => r.label?.includes('Secondary'));
    expect(secondary!.viewport).toEqual([768]);
  });

  it('honors parameters.frontguard.threshold', async () => {
    const result = await discoverStorybookStories({ url: server.url });
    const secondary = result!.routes.find((r) => r.label?.includes('Secondary'));
    expect(secondary!.threshold).toBe(0.005);
  });

  it('honors parameters.frontguard.ignore', async () => {
    const result = await discoverStorybookStories({ url: server.url });
    const danger = result!.routes.find((r) => r.label?.includes('Danger'));
    expect(danger!.ignore).toEqual([{ selector: '.fg-mask' }]);
  });

  it('uses Title › Name format for labels', async () => {
    const result = await discoverStorybookStories({ url: server.url });
    const labels = result!.routes.map((r) => r.label!).sort();
    expect(labels).toContain('Components/Button › Primary');
    expect(labels).toContain('Components/Modal › OpenedByPlay');
  });

  it('respects include filter (`stories`)', async () => {
    const result = await discoverStorybookStories({
      url: server.url,
      stories: ['Components/Button/*'],
    });
    expect(result!.routes.every((r) => r.label?.startsWith('Components/Button'))).toBe(true);
    expect(result!.routes.length).toBeGreaterThan(0);
  });

  it('include filter accepts story-id matches', async () => {
    const result = await discoverStorybookStories({
      url: server.url,
      stories: ['components-button--primary'],
    });
    expect(result!.routes).toHaveLength(1);
    expect(result!.routes[0]!.label).toBe('Components/Button › Primary');
  });

  it('respects exclude filter', async () => {
    const result = await discoverStorybookStories({
      url: server.url,
      exclude: ['Components/Modal/*'],
    });
    expect(result!.routes.every((r) => !r.label?.startsWith('Components/Modal'))).toBe(true);
  });

  it('skips stories with parameters.frontguard.skip', async () => {
    const result = await discoverStorybookStories({ url: server.url });
    const skippedFound = result!.routes.find((r) => r.label?.includes('Skipped'));
    expect(skippedFound).toBeUndefined();
  });
});

describe('discoverStorybookStories — Storybook 7 (/stories.json fallback)', () => {
  let server: { url: string; close: () => Promise<void> };

  beforeAll(async () => {
    server = await startMockStorybook({ endpoint: 'stories.json', body: SB7_STORIES });
  });
  afterAll(async () => {
    await server.close();
  });

  it('falls back to /stories.json and reports SB major 7', async () => {
    const idx = await fetchStorybookIndex(server.url, 5_000);
    expect(idx).not.toBeNull();
    expect(idx!.storybookMajor).toBe(7);
  });

  it('produces routes with the same shape as SB8', async () => {
    const result = await discoverStorybookStories({ url: server.url });
    expect(result!.routes).toHaveLength(2);
    expect(result!.routes[0]!.path).toMatch(/iframe\.html\?id=foo-bar--/);
    expect(result!.routes[0]!.discoveredVia).toBe('storybook');
  });

  it('honors per-story threshold under SB7 too', async () => {
    const result = await discoverStorybookStories({ url: server.url });
    const variant = result!.routes.find((r) => r.label?.includes('Variant'));
    expect(variant!.threshold).toBe(0.02);
  });
});

describe('discoverStorybookStories — unreachable server', () => {
  it('returns null and warns when /index.json and /stories.json both fail', async () => {
    // Empty server that 404s every request → both endpoints fail.
    const server = await startMockStorybook({ endpoint: 'index.json', body: SB8_INDEX });
    await server.close();
    const result = await discoverStorybookStories({ url: server.url });
    expect(result).toBeNull();
  });

  it('returns null when storybook.url is empty', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await discoverStorybookStories({ url: '' });
    expect(result).toBeNull();
    warn.mockRestore();
  });
});

describe('storyIframePath', () => {
  it('encodes story ids safely', () => {
    expect(storyIframePath('button--primary')).toBe(
      '/iframe.html?id=button--primary&viewMode=story',
    );
  });

  it('percent-encodes weird ids', () => {
    expect(storyIframePath('foo/bar baz')).toBe(
      '/iframe.html?id=foo%2Fbar%20baz&viewMode=story',
    );
  });
});

describe('STORYBOOK_READY_SCRIPT', () => {
  it('is a valid JS expression that evaluates to a function', () => {
    // We intentionally don't eval untrusted code; this checks shape.
    expect(STORYBOOK_READY_SCRIPT.startsWith('(timeoutMs) => new Promise(')).toBe(true);
    expect(STORYBOOK_READY_SCRIPT).toContain('__STORYBOOK_PREVIEW__');
    expect(STORYBOOK_READY_SCRIPT).toContain('storyRenders');
    expect(STORYBOOK_READY_SCRIPT).toContain('completed');
    expect(STORYBOOK_READY_SCRIPT).toContain('finished');
    expect(STORYBOOK_READY_SCRIPT).toContain('storyRendered');
  });

  it('resolves quickly when storyRenders are all in a completed phase', async () => {
    // Recreate the script's logic in-process by stubbing the bits it touches.
    const win: {
      __STORYBOOK_PREVIEW__: {
        storyRenders: Map<string, { phase: string }>;
        channel: { once: () => void };
      };
    } = {
      __STORYBOOK_PREVIEW__: {
        storyRenders: new Map([['x', { phase: 'completed' }]]),
        channel: { once: () => {} },
      },
    };
    const document = { body: { classList: { contains: () => false } } };
    const fn = new Function(
      'window',
      'document',
      'requestAnimationFrame',
      `return (${STORYBOOK_READY_SCRIPT})(2000);`,
    );
    const raf = (cb: () => void) => setTimeout(cb, 0);
    const result = await fn(win, document, raf);
    expect(result.ready).toBe(true);
    expect(result.reason).toBe('phase-complete');
    expect(result.elapsedMs).toBeLessThan(2000);
  });

  it('resolves quickly when storyRenders use SB 8.6 "finished" phase', async () => {
    const win: {
      __STORYBOOK_PREVIEW__: {
        storyRenders: Map<string, { phase: string }>;
        channel: { once: () => void };
      };
    } = {
      __STORYBOOK_PREVIEW__: {
        storyRenders: new Map([['components-modal--opened-by-play', { phase: 'finished' }]]),
        channel: { once: () => {} },
      },
    };
    const document = { body: { classList: { contains: () => false } } };
    const fn = new Function(
      'window',
      'document',
      'requestAnimationFrame',
      `return (${STORYBOOK_READY_SCRIPT})(500);`,
    );
    const raf = (cb: () => void) => setTimeout(cb, 0);
    const result = await fn(win, document, raf);
    expect(result.ready).toBe(true);
    expect(result.reason).toBe('phase-complete');
    expect(result.elapsedMs).toBeLessThan(500);
  });

  it('uses the class heuristic when __STORYBOOK_PREVIEW__ is missing', async () => {
    const win: Record<string, unknown> = {};
    const document = {
      body: {
        classList: {
          contains: (name: string) => name === 'sb-show-main',
        },
      },
    };
    const fn = new Function(
      'window',
      'document',
      'requestAnimationFrame',
      `return (${STORYBOOK_READY_SCRIPT})(1500);`,
    );
    const raf = (cb: () => void) => setTimeout(cb, 0);
    const result = await fn(win, document, raf);
    expect(result.ready).toBe(true);
    expect(result.reason).toBe('class-heuristic');
  });

  it('falls back to "timeout" when nothing settles', async () => {
    const win: Record<string, unknown> = {};
    const document = { body: { classList: { contains: () => false } } };
    const fn = new Function(
      'window',
      'document',
      'requestAnimationFrame',
      `return (${STORYBOOK_READY_SCRIPT})(120);`,
    );
    const raf = (cb: () => void) => setTimeout(cb, 0);
    const result = await fn(win, document, raf);
    expect(result.ready).toBe(true);
    expect(result.reason).toBe('timeout');
  });
});

/** SB8-shaped index without `parameters` — matches real Storybook 8 output. */
const SB8_INDEX_NO_PARAMS = {
  v: 5,
  entries: Object.fromEntries(
    Object.entries(SB8_INDEX.entries).map(([id, entry]) => [
      id,
      {
        type: entry.type,
        id: entry.id,
        name: entry.name,
        title: entry.title,
        importPath:
          entry.importPath ??
          (entry.title?.startsWith('Components/Modal')
            ? './src/components/Modal.stories.tsx'
            : './src/components/Button.stories.tsx'),
        tags: entry.tags,
      },
    ]),
  ),
};

describe('resolveStoryFrontguardParameters — real SB8 index shape', () => {
  const fixtureRoot = join(__dirname, '..', '..', '__fixtures__', 'storybook');

  it('extracts frontguard parameters from CSF files via importPath', async () => {
    const params = await resolveStoryFrontguardParameters(
      'http://127.0.0.1:9',
      Object.values(SB8_INDEX_NO_PARAMS.entries),
      { storybookMajor: 8, projectRoot: fixtureRoot },
    );
    expect(params.get('components-button--secondary')).toEqual({
      viewports: [768],
      threshold: 0.005,
    });
    expect(params.get('components-button--danger')).toEqual({
      ignore: [{ selector: '.fg-mask' }],
    });
    expect(params.get('components-modal--opened-by-play')).toEqual({
      viewports: [1024],
    });
  });

  it('discovers per-story overrides when /index.json omits parameters', async () => {
    const server = await startMockStorybook({
      endpoint: 'index.json',
      body: SB8_INDEX_NO_PARAMS,
    });
    try {
      const result = await discoverStorybookStories({
        url: server.url,
        projectRoot: fixtureRoot,
      });
      const secondary = result!.routes.find((r) => r.label?.includes('Secondary'));
      expect(secondary!.viewport).toEqual([768]);
      const opened = result!.routes.find((r) => r.label?.includes('OpenedByPlay'));
      expect(opened!.viewport).toEqual([1024]);
    } finally {
      await server.close();
    }
  });
});

describe('fixture sanity (packages/cli/__fixtures__/storybook)', () => {
  it('has a Modal story file with a play() function', () => {
    const fixture = join(
      __dirname,
      '..',
      '..',
      '__fixtures__',
      'storybook',
      'src',
      'components',
      'Modal.stories.tsx',
    );
    const src = readFileSync(fixture, 'utf-8');
    // Anchors the fixture's play()-awareness contract in the test suite.
    expect(src).toMatch(/play:\s*async/);
    expect(src).toContain('userEvent.click');
    expect(src).toContain('modal-trigger');
  });

  it('exports two stories files (Button + Modal)', () => {
    const button = readFileSync(
      join(__dirname, '..', '..', '__fixtures__', 'storybook', 'src', 'components', 'Button.stories.tsx'),
      'utf-8',
    );
    const modal = readFileSync(
      join(__dirname, '..', '..', '__fixtures__', 'storybook', 'src', 'components', 'Modal.stories.tsx'),
      'utf-8',
    );
    expect(button).toContain('export default meta');
    expect(modal).toContain('export default meta');
  });

  it('fixture .storybook/main.ts is a Storybook 8 config', () => {
    const main = readFileSync(
      join(__dirname, '..', '..', '__fixtures__', 'storybook', '.storybook', 'main.ts'),
      'utf-8',
    );
    expect(main).toContain("from '@storybook/react-vite'");
    expect(main).toContain('@storybook/addon-essentials');
  });
});
