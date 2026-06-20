/** Stub DNS-over-HTTPS lookups used by the SSRF guard during handler tests. */
export function stubPublicDnsFetch(
  inner: (input: string, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return (async (input: string, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('cloudflare-dns.com/dns-query')) {
      return new Response(JSON.stringify({ Answer: [{ data: '93.184.216.34.' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/dns-json' },
      });
    }
    return inner(input, init);
  }) as typeof fetch;
}

/** Produces a valid `v0=` Slack signature for a body+timestamp+secret. */
export async function signSlack(rawBody: string, timestamp: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${timestamp}:${rawBody}`));
  return 'v0=' + Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
}
