import { describe, it, expect } from 'vitest';
import { buildVisualResultBlocks, postSlackMessage, type RunSummary } from '../src/slack-api.js';

describe('buildVisualResultBlocks', () => {
  it('renders a red header and a report button when regressions exist', () => {
    const summary: RunSummary = { url: 'https://x.com', total: 10, regressions: 2, warnings: 1, reportUrl: 'https://x.com/report' };
    const blocks = buildVisualResultBlocks(summary) as Array<{ type: string; text?: { text: string } }>;
    expect(JSON.stringify(blocks)).toContain('🔴');
    expect(JSON.stringify(blocks)).toContain('2 visual regression');
    expect(blocks.some((b) => b.type === 'actions')).toBe(true);
  });

  it('renders a green header and no button when clean', () => {
    const blocks = buildVisualResultBlocks({ url: 'https://x.com', total: 5, regressions: 0, warnings: 0 });
    expect(JSON.stringify(blocks)).toContain('🟢');
    expect((blocks as Array<{ type: string }>).some((b) => b.type === 'actions')).toBe(false);
  });
});

describe('postSlackMessage', () => {
  it('posts to chat.postMessage and reports ok', async () => {
    let captured: { url: string; auth: string } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      captured = { url, auth: (init.headers as Record<string, string>).Authorization };
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const res = await postSlackMessage('xoxb-1', 'C1', [], 'hi', fakeFetch);
    expect(res.ok).toBe(true);
    expect(captured!.url).toBe('https://slack.com/api/chat.postMessage');
    expect(captured!.auth).toBe('Bearer xoxb-1');
  });

  it('surfaces a Slack API error without throwing', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ ok: false, error: 'channel_not_found' }), { status: 200 })) as unknown as typeof fetch;
    const res = await postSlackMessage('xoxb-1', 'C1', [], 'hi', fakeFetch);
    expect(res.ok).toBe(false);
    expect(res.error).toBe('channel_not_found');
  });

  it('never throws on a network error', async () => {
    const fakeFetch = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const res = await postSlackMessage('xoxb-1', 'C1', [], 'hi', fakeFetch);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('offline');
  });
});
