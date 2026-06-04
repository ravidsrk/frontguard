import { describe, it, expect } from 'vitest';
import { parseSlackEnvelope, parseSlashCommand, buildCommandResponse } from '../src/events.js';

describe('parseSlackEnvelope', () => {
  it('handles the url_verification handshake', () => {
    expect(parseSlackEnvelope({ type: 'url_verification', challenge: 'abc123' })).toEqual({
      kind: 'url_verification',
      challenge: 'abc123',
    });
  });

  it('classifies an event_callback', () => {
    const d = parseSlackEnvelope({
      type: 'event_callback',
      team_id: 'T1',
      event: { type: 'app_mention', channel: 'C1' },
    });
    expect(d).toEqual({ kind: 'event', eventType: 'app_mention', teamId: 'T1', channel: 'C1' });
  });

  it('ignores unknown or malformed envelopes', () => {
    expect(parseSlackEnvelope({ type: 'something_else' }).kind).toBe('ignore');
    expect(parseSlackEnvelope({ type: 'url_verification' }).kind).toBe('ignore');
    expect(parseSlackEnvelope(null).kind).toBe('ignore');
  });
});

describe('parseSlashCommand', () => {
  it('extracts command fields from a form body', () => {
    const form = new URLSearchParams({
      command: '/frontguard',
      text: '  status https://example.com  ',
      user_id: 'U1',
      channel_id: 'C1',
      response_url: 'https://hooks.slack.com/x',
      team_id: 'T1',
    });
    expect(parseSlashCommand(form)).toEqual({
      command: '/frontguard',
      text: 'status https://example.com',
      userId: 'U1',
      channelId: 'C1',
      responseUrl: 'https://hooks.slack.com/x',
      teamId: 'T1',
    });
  });
});

describe('buildCommandResponse', () => {
  const base = { command: '/frontguard', userId: 'U1', channelId: 'C1', responseUrl: '', teamId: 'T1' };

  it('acknowledges a status subcommand with the url', () => {
    const res = buildCommandResponse({ ...base, text: 'status https://example.com' }) as { text: string };
    expect(res.text).toContain('https://example.com');
    expect(res.text).toContain('Queued');
  });

  it('shows help by default', () => {
    const res = buildCommandResponse({ ...base, text: '' }) as { text: string; response_type: string };
    expect(res.response_type).toBe('ephemeral');
    expect(res.text).toContain('/frontguard status');
  });
});
