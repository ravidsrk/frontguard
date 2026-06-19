import { isIP } from 'node:net';

/**
 * Returns true if `host` resolves to a private, loopback, or link-local
 * address — i.e. one we never want to hit from a server-side fetcher.
 *
 * Hostnames are checked literally (no DNS lookup) — we only need to block
 * obvious SSRF targets passed inline. Callers that perform outbound fetches
 * should also resolve the hostname and re-check resolved addresses.
 */
export function isPrivateOrLoopbackHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === 'localhost.localdomain') return true;
  if (h === 'metadata.google.internal' || h === 'metadata') return true;
  // IPv6 loopback / link-local / unique-local.
  if (h === '::1' || h === '[::1]') return true;
  if (h.startsWith('fe80:') || h.startsWith('[fe80:')) return true;
  if (h.startsWith('fc') || h.startsWith('fd')) {
    // fc00::/7 (unique local). Strip brackets for the check.
    const stripped = h.startsWith('[') ? h.slice(1, -1) : h;
    if (stripped.startsWith('fc') || stripped.startsWith('fd')) return true;
  }
  // IPv4 dotted-quad checks.
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
  }
  return false;
}

export type SafeRenderTargetErrorCode =
  | 'invalid_url'
  | 'scheme_not_allowed'
  | 'private_host'
  | 'dns_resolution_failed'
  | 'dns_private';

export class SafeRenderTargetError extends Error {
  readonly code: SafeRenderTargetErrorCode;

  constructor(code: SafeRenderTargetErrorCode, message: string) {
    super(message);
    this.name = 'SafeRenderTargetError';
    this.code = code;
  }
}

/** Injectable DNS resolver for tests and non-Node runtimes. */
export type HostResolver = (hostname: string) => Promise<string[]>;

export async function resolveHostAddresses(hostname: string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];

  const { promises: dns } = await import('node:dns');
  const addresses: string[] = [];
  try {
    addresses.push(...(await dns.resolve4(hostname)));
  } catch {
    // no A records
  }
  try {
    addresses.push(...(await dns.resolve6(hostname)));
  } catch {
    // no AAAA records
  }
  return addresses;
}

/**
 * Validates that a URL is safe to pass to the render pipeline.
 *
 * - https scheme only
 * - rejects private/loopback/link-local host literals
 * - resolves hostnames and re-checks resolved addresses (DNS rebinding guard)
 */
export async function assertSafeRenderTarget(
  url: string,
  opts: { resolveHost?: HostResolver } = {},
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SafeRenderTargetError('invalid_url', 'url must be a valid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new SafeRenderTargetError(
      'scheme_not_allowed',
      'url must use the https scheme',
    );
  }

  const host = parsed.hostname.toLowerCase();
  if (isPrivateOrLoopbackHost(host)) {
    throw new SafeRenderTargetError(
      'private_host',
      'url must not target a private, loopback, or link-local host',
    );
  }

  if (isIP(host)) return;

  const resolveHost = opts.resolveHost ?? resolveHostAddresses;
  let addresses: string[];
  try {
    addresses = await resolveHost(host);
  } catch {
    throw new SafeRenderTargetError(
      'dns_resolution_failed',
      `could not resolve host: ${host}`,
    );
  }

  if (addresses.length === 0) {
    throw new SafeRenderTargetError(
      'dns_resolution_failed',
      `could not resolve host: ${host}`,
    );
  }

  for (const addr of addresses) {
    const normalized = addr.replace(/^\[|\]$/g, '').toLowerCase();
    if (isPrivateOrLoopbackHost(normalized)) {
      throw new SafeRenderTargetError(
        'dns_private',
        'url resolves to a private, loopback, or link-local address',
      );
    }
  }
}