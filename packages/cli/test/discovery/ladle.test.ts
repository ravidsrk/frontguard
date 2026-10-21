/**
 * Ladle discovery from a local `meta.json` fixture. No network.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { discoverLadleStories, ladlePreviewPath } from '../../src/discovery/ladle.js';

const ladleDir = join(__dirname, 'fixtures', 'ladle');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('discoverLadleStories — local meta.json', () => {
  it('maps Ladle stories onto the shared route shape and does not fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await discoverLadleStories({ dir: ladleDir });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.paramSkipped).toBe(1);
    expect(result!.routes).toHaveLength(2);

    const first = result!.routes.find((route) => route.path === ladlePreviewPath('control--first'));
    expect(first).toMatchObject({
      path: '/?story=control--first&mode=preview',
      label: 'Control › First',
      discoveredVia: 'ladle',
      waitForSelector: '[data-storyloaded]',
    });

    const threshold = result!.routes.find((route) => route.label === 'Control threshold');
    expect(threshold).toMatchObject({
      path: '/?story=control--threshold&mode=preview',
      threshold: 0.02,
      viewport: [768],
      ignore: [{ selector: '.clock' }],
      discoveredVia: 'ladle',
      waitForSelector: '[data-storyloaded]',
    });
  });

  it('prefers the local build when url is also set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await discoverLadleStories({
      dir: ladleDir,
      url: 'http://127.0.0.1:61000',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result!.routes).toHaveLength(2);
  });

  it('reads meta.json from a URL when no directory is set', async () => {
    const body = readFileSync(join(ladleDir, 'meta.json'), 'utf8');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const result = await discoverLadleStories({ url: 'http://127.0.0.1:61000/' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('http://127.0.0.1:61000/meta.json');
    expect(result!.routes.map((route) => route.discoveredVia)).toEqual(['ladle', 'ladle']);
  });

  it('honors include and exclude filters', async () => {
    const included = await discoverLadleStories({
      dir: ladleDir,
      stories: ['control--first'],
    });
    expect(included!.routes.map((route) => route.path)).toEqual([
      '/?story=control--first&mode=preview',
    ]);

    const excluded = await discoverLadleStories({
      dir: ladleDir,
      exclude: ['Control/Threshold'],
    });
    expect(excluded!.routes.map((route) => route.label)).toEqual(['Control › First']);
  });
});
