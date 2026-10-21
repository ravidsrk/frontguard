/**
 * Histoire discovery from a local `histoire.json` fixture. No network.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { discoverHistoireStories, histoireSandboxPath } from '../../src/discovery/histoire.js';

const histoireDir = join(__dirname, 'fixtures', 'histoire');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('discoverHistoireStories — local histoire.json', () => {
  it('maps variants onto the shared route shape and skips docsOnly stories', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await discoverHistoireStories({ dir: histoireDir });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.docsSkipped).toBe(1);
    expect(result!.routes.map((route) => route.path)).toEqual([
      histoireSandboxPath('src-components-button-story-vue', 'disabled'),
      histoireSandboxPath('src-components-button-story-vue', 'primary'),
    ]);
    expect(result!.routes.map((route) => route.label)).toEqual([
      'Components / Button › Disabled',
      'Components / Button › Primary',
    ]);
    expect(result!.routes.every((route) => route.discoveredVia === 'histoire')).toBe(true);
    expect(result!.routes.some((route) => route.path.includes('grid=true'))).toBe(false);
  });

  it('prefers the local build when url is also set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await discoverHistoireStories({
      dir: histoireDir,
      url: 'http://127.0.0.1:6006',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result!.routes).toHaveLength(2);
  });

  it('reads histoire.json from a URL when no directory is set', async () => {
    const body = readFileSync(join(histoireDir, 'histoire.json'), 'utf8');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const result = await discoverHistoireStories({ url: 'http://127.0.0.1:4173' });
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe('http://127.0.0.1:4173/histoire.json');
    expect(result!.routes).toHaveLength(2);
  });

  it('honors an exclude filter against the variant id', async () => {
    const result = await discoverHistoireStories({
      dir: histoireDir,
      exclude: ['disabled'],
    });
    expect(result!.routes.map((route) => route.label)).toEqual(['Components / Button › Primary']);
  });
});
