/**
 * Hosted Ladle and Histoire previews keep the base directory, and a
 * browser can see the selected story before a capture would run.
 */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { joinStoryUrl } from '../../src/discovery/story-url.js';
import { histoireSandboxPath } from '../../src/discovery/histoire.js';
import { ladlePreviewPath } from '../../src/discovery/ladle.js';

const LADLE_STORY = 'control--first';
const HISTOIRE_STORY = 'src-components-button-story-vue';
const HISTOIRE_VARIANT = 'primary';

function pageFor(url: URL): string | null {
  if (url.pathname === '/components/' && url.searchParams.get('story') === LADLE_STORY) {
    return '<!doctype html><html><body><h1 data-storyloaded>First</h1></body></html>';
  }
  if (
    url.pathname === '/components/__sandbox.html' &&
    url.searchParams.get('storyId') === HISTOIRE_STORY &&
    url.searchParams.get('variantId') === HISTOIRE_VARIANT
  ) {
    return '<!doctype html><html><body><h1 data-storyloaded>Primary</h1></body></html>';
  }
  return null;
}

describe('hosted story preview URLs', () => {
  let server: Server;
  let base: string;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const html = pageFor(url);
      response.statusCode = html ? 200 : 404;
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(html ?? 'missing');
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('preview server did not bind');
    base = `http://127.0.0.1:${address.port}/components`;
    browser = await chromium.launch();
    page = await browser.newPage();
  }, 30_000);

  afterAll(async () => {
    await page?.close();
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('keeps a Ladle base directory and shows that story', async () => {
    const preview = ladlePreviewPath(LADLE_STORY);
    const captured = joinStoryUrl(base, preview);
    expect(captured).toBe(`${base}/?story=${LADLE_STORY}&mode=preview`);
    expect(new URL(preview, base).href).toBe(`http://127.0.0.1:${new URL(base).port}/?story=${LADLE_STORY}&mode=preview`);

    const response = await page.goto(captured, { waitUntil: 'load' });
    expect(response?.status()).toBe(200);
    await page.waitForSelector('[data-storyloaded]', { state: 'visible' });
    expect(await page.locator('[data-storyloaded]').innerText()).toBe('First');
  });

  it('keeps a Histoire base directory and shows that variant', async () => {
    const preview = histoireSandboxPath(HISTOIRE_STORY, HISTOIRE_VARIANT);
    const captured = joinStoryUrl(base, preview);
    expect(captured).toBe(
      `${base}/__sandbox.html?storyId=${HISTOIRE_STORY}&variantId=${HISTOIRE_VARIANT}`,
    );
    expect(new URL(preview, base).href).not.toContain('/components/');

    const response = await page.goto(captured, { waitUntil: 'load' });
    expect(response?.status()).toBe(200);
    await page.waitForSelector('[data-storyloaded]', { state: 'visible' });
    expect(await page.locator('[data-storyloaded]').innerText()).toBe('Primary');
  });
});
