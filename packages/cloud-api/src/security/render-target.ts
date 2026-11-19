/**
 * Edge/Worker-safe SSRF guard for render targets, webhook URLs, and route paths.
 * No Node built-ins — runs on Cloudflare Workers and Vercel edge unchanged.
 *
 * DNS-rebinding residual: submit-time resolve+check cannot stop the Daytona
 * renderer from re-resolving the hostname to a different address at render time.
 * Fully closing that gap requires pinning the sandbox fetcher to the validated
 * IP (Daytona/infra change) — out of scope for cloud-api; track as OPS follow-up.
 */

const DOH_TIMEOUT_MS = 10_000;

/** Hostnames allowed for Slack incoming webhook delivery. */
const ALLOWED_SLACK_WEBHOOK_HOSTS = new Set([
  'hooks.slack.com',
  'hooks.gov.slack.com',
]);

function normalizeHost(host: string): string {
  let h = host.trim().toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  return h.replace(/\.+$/, '');
}

function parseIpv4Octet(part: string): number | null {
  if (part.length === 0) return null;
  let value: number;
  if (/^0x[0-9a-f]+$/i.test(part)) {
    value = Number.parseInt(part.slice(2), 16);
  } else if (/^0[0-7]+$/.test(part)) {
    value = Number.parseInt(part, 8);
  } else if (/^\d+$/.test(part)) {
    value = Number.parseInt(part, 10);
  } else {
    return null;
  }
  if (!Number.isFinite(value) || value < 0 || value > 255) return null;
  return value;
}

function ipv4FromUint32(n: number): number[] {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

function parseIntegerIpv4(host: string): number[] | null {
  const h = host.toLowerCase();
  let value: number;
  if (/^0x[0-9a-f]+$/i.test(h)) {
    value = Number.parseInt(h.slice(2), 16);
  } else if (/^\d+$/.test(h)) {
    value = Number.parseInt(h, 10);
  } else {
    return null;
  }
  if (!Number.isFinite(value) || value < 0 || value > 0xffff_ffff) return null;
  return ipv4FromUint32(value >>> 0);
}

/** Parse dotted IPv4, including non-canonical (127.1) and mixed-radix octets. */
function parseDottedIpv4(host: string): number[] | null {
  if (!host.includes('.')) return null;
  const parts = host.split('.');
  if (parts.length < 1 || parts.length > 4) return null;

  if (parts.length === 1) return parseIntegerIpv4(parts[0]!);

  const octets: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    const remainingSlots = 4 - i;
    const part = parts[i]!;
    const isLast = i === parts.length - 1;

    if (isLast && remainingSlots > 1) {
      let value: number;
      if (/^0x[0-9a-f]+$/i.test(part)) {
        value = Number.parseInt(part.slice(2), 16);
      } else if (/^0[0-7]+$/.test(part)) {
        value = Number.parseInt(part, 8);
      } else if (/^\d+$/.test(part)) {
        value = Number.parseInt(part, 10);
      } else {
        return null;
      }
      const max = 256 ** remainingSlots - 1;
      if (!Number.isFinite(value) || value < 0 || value > max) return null;
      for (let j = 0; j < remainingSlots; j++) {
        const shift = 8 * (remainingSlots - 1 - j);
        octets.push((value >>> shift) & 255);
      }
      return octets.length === 4 ? octets : null;
    }

    const octet = parseIpv4Octet(part);
    if (octet === null) return null;
    octets.push(octet);
  }

  if (octets.length !== 4) return null;
  return octets;
}

function parseHextet(part: string): number | null {
  if (part.length === 0 || part.length > 4 || !/^[0-9a-f]+$/i.test(part)) return null;
  const value = Number.parseInt(part, 16);
  if (!Number.isFinite(value) || value < 0 || value > 0xffff) return null;
  return value;
}

/**
 * Expand an IPv6 literal (including IPv4-embedded forms like `::ffff:127.0.0.1`
 * or `64:ff9b::169.254.169.254`) into eight 16-bit hextets.
 */
function expandIpv6Hextets(host: string): number[] | null {
  let h = normalizeHost(host);
  if (!h.includes(':')) return null;
  // Zone identifiers (%eth0, %25eth0) are only valid on link-local interfaces.
  if (h.includes('%')) return null;

  if (h.includes('.')) {
    const lastColon = h.lastIndexOf(':');
    if (lastColon === -1) return null;
    const ipv4Suffix = h.slice(lastColon + 1);
    const octets = parseDottedIpv4(ipv4Suffix);
    if (!octets) return null;
    const hi = ((octets[0]! << 8) | octets[1]!).toString(16);
    const lo = ((octets[2]! << 8) | octets[3]!).toString(16);
    h = `${h.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  if (h === '::') return [0, 0, 0, 0, 0, 0, 0, 0];

  const doubleColon = h.indexOf('::');
  if (doubleColon === -1) {
    const parts = h.split(':');
    if (parts.length !== 8) return null;
    const hextets = parts.map((p) => parseHextet(p));
    if (hextets.some((v) => v === null)) return null;
    return hextets as number[];
  }

  // Only one `::` compression sequence is valid in IPv6.
  if (h.indexOf('::', doubleColon + 2) !== -1) return null;

  const left = h.slice(0, doubleColon);
  const right = h.slice(doubleColon + 2);
  const leftParts = left.length > 0 ? left.split(':') : [];
  const rightParts = right.length > 0 ? right.split(':') : [];
  if (leftParts.length + rightParts.length > 7) return null;

  const leftHextets = leftParts.map((p) => parseHextet(p));
  const rightHextets = rightParts.map((p) => parseHextet(p));
  if (leftHextets.some((v) => v === null) || rightHextets.some((v) => v === null)) {
    return null;
  }

  const missing = 8 - leftParts.length - rightParts.length;
  return [...(leftHextets as number[]), ...Array<number>(missing).fill(0), ...(rightHextets as number[])];
}

/**
 * Rejects non-global IPv4 ranges:
 * - 0.0.0.0/8 ("this network"), 10.0.0.0/8 (RFC 1918), 100.64.0.0/10 (CGNAT)
 * - 127.0.0.0/8 (loopback), 169.254.0.0/16 (link-local / IMDS), 172.16.0.0/12 (RFC 1918)
 * - 192.0.0.0/24 (IETF protocol assignments), 192.0.2.0/24 (TEST-NET-1), 192.168.0.0/16 (RFC 1918)
 * - 198.18.0.0/15 (benchmarking), 198.51.100.0/24 (TEST-NET-2), 203.0.113.0/24 (TEST-NET-3)
 * - 224.0.0.0/4 (multicast) and 240.0.0.0/4 (reserved / broadcast)
 */
function isPrivateOrLoopbackIpv4Octets(octets: number[]): boolean {
  const [a, b, c] = octets;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 100 && b! >= 64 && b! <= 127) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b! >= 16 && b! <= 31) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a! >= 224) return true;
  return false;
}

function isPrivateOrLoopbackIpv6Literal(host: string): boolean {
  const hextets = expandIpv6Hextets(host);
  // Fail closed on malformed IPv6 literals or zone-ID-bearing addresses.
  if (!hextets) return true;

  const [h0, h1, h2, h3, h4, h5, h6, h7] = hextets as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];

  // ::/96 — unspecified (::), loopback (::1), and deprecated IPv4-compatible IPv6 (::a.b.c.d)
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) return true;

  // ::ffff:0:0/96 — IPv4-mapped IPv6
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0xffff) {
    return isPrivateOrLoopbackIpv4Octets([(h6 >>> 8) & 255, h6 & 255, (h7 >>> 8) & 255, h7 & 255]);
  }

  // ::ffff:0:0:0/96 — IPv4-translated (SIIT)
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0xffff && h5 === 0) return true;

  // 64:ff9b::/96 — NAT64 well-known prefix
  if (h0 === 0x0064 && h1 === 0xff9b && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) return true;

  // 64:ff9b:1::/48 — NAT64 local-use prefix
  if (h0 === 0x0064 && h1 === 0xff9b && h2 === 0x0001) return true;

  // 100::/64 — discard-only
  if (h0 === 0x0100 && h1 === 0 && h2 === 0 && h3 === 0) return true;

  // 2001::/32 — Teredo tunneling
  if (h0 === 0x2001 && h1 === 0x0000) return true;

  // 2001:db8::/32 — documentation
  if (h0 === 0x2001 && h1 === 0x0db8) return true;

  // 2002::/16 — 6to4
  if (h0 === 0x2002) return true;

  // fc00::/7 — unique-local (fc00:: through fdff::)
  if (h0 >= 0xfc00 && h0 <= 0xfdff) return true;

  // fe80::/10 — link-local (fe80:: through febf::)
  if (h0 >= 0xfe80 && h0 <= 0xfebf) return true;

  // fec0::/10 — deprecated site-local (fec0:: through feff::)
  if (h0 >= 0xfec0 && h0 <= 0xfeff) return true;

  // ff00::/8 — multicast
  if ((h0 & 0xff00) === 0xff00) return true;

  return false;
}

function extractIpv4Octets(host: string): number[] | null {
  const h = normalizeHost(host);
  if (h.includes(':')) return null;
  return parseDottedIpv4(h) ?? parseIntegerIpv4(h);
}

/** True when `host` looks like an IP literal (v4 or v6), without Node's isIP. */
export function isIpLiteral(host: string): boolean {
  const h = normalizeHost(host);
  if (h.includes(':')) return expandIpv6Hextets(h) !== null || h.includes('%');
  if (h.includes('.')) return parseDottedIpv4(h) !== null;
  return parseIntegerIpv4(h) !== null;
}

/**
 * Returns true if `host` resolves to a private, loopback, link-local, or
 * reserved internal address — i.e. one we never want to hit from a server-side
 * fetcher.
 */
export function isPrivateOrLoopbackHost(host: string): boolean {
  const h = normalizeHost(host);
  if (h.length === 0) return true;
  if (
    h === 'localhost' ||
    h === 'localhost.localdomain' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.home.arpa') ||
    h === 'metadata' ||
    h === 'metadata.google.internal'
  ) {
    return true;
  }

  if (h.includes(':')) return isPrivateOrLoopbackIpv6Literal(h);

  const ipv4 = extractIpv4Octets(h);
  if (ipv4) return isPrivateOrLoopbackIpv4Octets(ipv4);

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

/** Injectable DNS resolver for tests and custom runtimes. */
export type HostResolver = (hostname: string) => Promise<string[]>;

type DohAnswer = { type?: number; data?: string };

async function queryDoh(hostname: string, type: 'A' | 'AAAA'): Promise<string[]> {
  const typeNum = type === 'A' ? 1 : 28;
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${typeNum}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.timeout(DOH_TIMEOUT_MS),
    });
  } catch {
    throw new SafeRenderTargetError(
      'dns_resolution_failed',
      `could not resolve host: ${hostname}`,
    );
  }
  if (!res.ok) {
    throw new SafeRenderTargetError(
      'dns_resolution_failed',
      `could not resolve host: ${hostname}`,
    );
  }
  const body = (await res.json()) as { Answer?: DohAnswer[] };
  const addresses: string[] = [];
  for (const answer of body.Answer ?? []) {
    const data = (answer.data ?? '').trim().replace(/\.+$/, '');
    if (!data) continue;
    // Inspect CNAME targets (type 5) so aliases into internal/VPC domains fail closed.
    if (answer.type === 5) {
      if (isPrivateOrLoopbackHost(data)) {
        throw new SafeRenderTargetError(
          'dns_private',
          'url resolves through a CNAME to a private, loopback, or internal host',
        );
      }
      continue;
    }
    // Strictly keep only A (type 1) or AAAA (type 28) records matching the query.
    if (answer.type !== typeNum) continue;
    if (!isIpLiteral(data)) continue;
    addresses.push(data);
  }
  return addresses;
}

/** Resolve A/AAAA records via DNS-over-HTTPS (edge-safe, no node:dns). */
export async function resolveHostAddresses(hostname: string): Promise<string[]> {
  const normalized = normalizeHost(hostname);
  if (isIpLiteral(normalized)) return [normalized];

  const [aRecords, aaaaRecords] = await Promise.all([
    queryDoh(normalized, 'A'),
    queryDoh(normalized, 'AAAA'),
  ]);
  const addresses = [...aRecords, ...aaaaRecords];
  if (addresses.length === 0) {
    throw new SafeRenderTargetError(
      'dns_resolution_failed',
      `could not resolve host: ${normalized}`,
    );
  }
  return addresses;
}

/**
 * Validates that a URL is safe to pass to the render pipeline.
 *
 * - https scheme only
 * - rejects private/loopback/link-local/internal host literals
 * - resolves hostnames via A/AAAA records and re-checks resolved addresses
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

  const host = normalizeHost(parsed.hostname);
  if (isPrivateOrLoopbackHost(host)) {
    throw new SafeRenderTargetError(
      'private_host',
      'url must not target a private, loopback, or link-local host',
    );
  }

  if (isIpLiteral(host)) return;

  const resolveHost = opts.resolveHost ?? resolveHostAddresses;
  let addresses: string[];
  try {
    addresses = await resolveHost(host);
  } catch (err) {
    if (err instanceof SafeRenderTargetError) throw err;
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
    if (isPrivateOrLoopbackHost(addr)) {
      throw new SafeRenderTargetError(
        'dns_private',
        'url resolves to a private, loopback, or link-local address',
      );
    }
  }
}

/**
 * Validates that a Slack alert webhook URL uses HTTPS, targets an allowlisted
 * Slack webhook host, and resolves exclusively to public addresses.
 */
export async function assertSafeSlackWebhookUrl(
  url: string,
  opts: { resolveHost?: HostResolver } = {},
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SafeRenderTargetError('invalid_url', 'Slack webhook URL must be a valid URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new SafeRenderTargetError(
      'scheme_not_allowed',
      'Slack webhook URL must use the https scheme',
    );
  }
  const host = normalizeHost(parsed.hostname);
  if (!ALLOWED_SLACK_WEBHOOK_HOSTS.has(host)) {
    throw new SafeRenderTargetError(
      'invalid_url',
      'Slack webhook URL must target hooks.slack.com',
    );
  }
  await assertSafeRenderTarget(url, opts);
}

/**
 * Returns true when `routePath` is an origin-bound relative path:
 * - starts with `/`, never `//`
 * - contains no backslashes or ASCII control characters
 * - resolves against `baseUrl` to the exact same origin and protocol
 */
export function isSafeRelativeRoutePath(routePath: string, baseUrl?: string): boolean {
  if (typeof routePath !== 'string' || routePath.length === 0 || routePath.length > 2048) {
    return false;
  }
  if (!routePath.startsWith('/') || routePath.startsWith('//')) return false;
  if (routePath.includes('\\')) return false;
  for (let i = 0; i < routePath.length; i++) {
    const code = routePath.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  try {
    const base = new URL(baseUrl ?? 'https://example.invalid');
    const resolved = new URL(routePath, base);
    return resolved.origin === base.origin && resolved.protocol === base.protocol;
  } catch {
    return false;
  }
}

/**
 * Asserts every route path in `routes` is an origin-bound relative path under `baseUrl`.
 */
export function assertSafeRoutePaths(
  baseUrl: string,
  routes: ReadonlyArray<string | { path: string }>,
): void {
  for (const entry of routes) {
    const routePath = typeof entry === 'string' ? entry : entry.path;
    if (!isSafeRelativeRoutePath(routePath, baseUrl)) {
      throw new SafeRenderTargetError(
        'invalid_url',
        `Route path must be an origin-bound relative path starting with '/': ${routePath}`,
      );
    }
  }
}
