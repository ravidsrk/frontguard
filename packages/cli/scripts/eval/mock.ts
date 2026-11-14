/**
 * Canned-response transport for the eval harness (`--mock`).
 *
 * Reads the case id from the request (the route path `/eval/<id>` is in the
 * prompt), answers with that case's first expected label in the provider's own
 * response format, and records each request. No network, no key needed: it
 * checks request building, structured outputs, parsing and scoring end to end.
 */

import type { EvalCase } from './types.js';

export interface MockTransport {
  fetchImpl: typeof fetch;
  requests: Array<{ url: string; body: Record<string, unknown> }>;
}

export function createMockTransport(cases: EvalCase[]): MockTransport {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const requests: MockTransport['requests'] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const raw = String(init?.body ?? '');
    const body = JSON.parse(raw) as Record<string, unknown>;
    requests.push({ url, body });
    const id = /\/eval\/([a-z0-9-]+)/.exec(raw)?.[1];
    const evalCase = id ? byId.get(id) : undefined;
    if (!evalCase) return new Response('{"error":{"message":"unknown eval case"}}', { status: 400 });

    const label = evalCase.expected[0] === 'pass' ? 'intentional' : evalCase.expected[0];
    const answer = JSON.stringify({
      classification: label,
      explanation: `Mock answer for ${evalCase.id}`,
      severity: label === 'regression' ? 'warning' : 'info',
      confidence: 0.9,
      suggestedFix: null,
    });
    const usage = { in: 1500, out: 80 };
    let payload: unknown;
    if (url.includes('anthropic')) {
      payload = {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: answer }],
        usage: { input_tokens: usage.in, output_tokens: usage.out },
      };
    } else if (url.includes('generativelanguage') || url.includes(':generateContent')) {
      payload = {
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: answer }] } }],
        usageMetadata: { promptTokenCount: usage.in, candidatesTokenCount: usage.out },
      };
    } else {
      payload = {
        choices: [{ finish_reason: 'stop', message: { content: answer } }],
        usage: { prompt_tokens: usage.in, completion_tokens: usage.out },
      };
    }
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, requests };
}
