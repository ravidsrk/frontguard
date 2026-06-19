/**
 * Edge/Worker-safe SSRF guard for render targets. No Node built-ins — runs on
 * Cloudflare Workers and Vercel edge unchanged.
 *
 * DNS-rebinding residual: submit-time resolve+check cannot stop the Daytona
 * renderer from re-resolving the hostname to a different address at render time.
 * Fully closing that gap requires pinning the sandbox fetcher to the validated
 * IP (Daytona/infra change) — out of scope for cloud-api; track as OPS follow-up.
 */

function stripBrackets(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) return h.slice(1, -1);
  return h;
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
      const max = (256 ** remainingSlots) - 1;
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

function unwrapIpv4MappedIpv6(host: string): number[] | null {
  const h = stripBrackets(host);

  const dottedSuffix = h.match(/^(?:.*:)?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dottedSuffix) {
    return parseDottedIpv4(dottedSuffix[1]!);
  }

  const hexSuffix = h.match(/^(?:.*:)?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hexSuffix) {
    const hi = Number.parseInt(hexSuffix[1]!, 16);
    const lo = Number.parseInt(hexSuffix[2]!, 16);
    if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
    return ipv4FromUint32(((hi << 16) | lo) >>> 0);
  }

  return null;
}

function parseHextet(part: string): number | null {
  if (part.length === 0 || part.length > 4) return null;
  const value = Number.parseInt(part, 16);
  if (!Number.isFinite(value) || value < 0 || value > 0xffff) return null;
  return value;
}

/** Expand an IPv6 literal (no embedded IPv4) into eight 16-bit hextets. */
function expandIpv6Hextets(host: string): number[] | null {
  const h = stripBrackets(host);
  if (!h.includes(':')) return null;
  if (h.includes('.')) return null;
  if (h === '::') return [0, 0, 0, 0, 0, 0, 0, 0];

  const doubleColon = h.indexOf('::');
  if (doubleColon === -1) {
    const parts = h.split(':');
    if (parts.length !== 8) return null;
    const hextets = parts.map((p) => parseHextet(p));
    if (hextets.some((v) => v === null)) return null;
    return hextets as number[];
  }

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

function isLoopbackIpv6(host: string): boolean {
  const hextets = expandIpv6Hextets(host);
  if (!hextets) return stripBrackets(host) === '::1';
  return hextets.slice(0, 7).every((v) => v === 0) && hextets[7] === 1;
}

function isUnspecifiedIpv6(host: string): boolean {
  const h = stripBrackets(host);
  if (h === '::') return true;
  const hextets = expandIpv6Hextets(h);
  return hextets !== null && hextets.every((v) => v === 0);
}

/** fe80::/10 — IPv6 link-local (fe80:: through febf::) */
function isLinkLocalIpv6(host: string): boolean {
  const hextets = expandIpv6Hextets(host);
  if (!hextets) return false;
  const first = hextets[0]!;
  return first >= 0xfe80 && first <= 0xfebf;
}

/** fc00::/7 — IPv6 unique-local (fc00:: through fdff::) */
function isUniqueLocalIpv6(host: string): boolean {
  const hextets = expandIpv6Hextets(host);
  if (!hextets) return false;
  const first = hextets[0]!;
  return first >= 0xfc00 && first <= 0xfdff;
}

function isPrivateOrLoopbackIpv4Octets(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b! >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b! >= 64 && b! <= 127) return true;
  if (a! >= 224) return true;
  return false;
}

function isPrivateOrLoopbackIpv6Literal(host: string): boolean {
  const h = stripBrackets(host);

  const mapped = unwrapIpv4MappedIpv6(h);
  if (mapped) return isPrivateOrLoopbackIpv4Octets(mapped);

  if (isUnspecifiedIpv6(h)) return true;
  if (isLoopbackIpv6(h)) return true;
  if (isLinkLocalIpv6(h)) return true;
  if (isUniqueLocalIpv6(h)) return true;

  return false;
}

function extractIpv4Octets(host: string): number[] | null {
  const h = stripBrackets(host);
  if (h.includes(':')) return unwrapIpv4MappedIpv6(h);
  return parseDottedIpv4(h) ?? parseIntegerIpv4(h);
}

/** True when `host` looks like an IP literal (v4 or v6), without Node's isIP. */
export function isIpLiteral(host: string): boolean {
  const h = stripBrackets(host);
  if (h.includes(':')) return true;
  if (h.includes('.')) return parseDottedIpv4(h) !== null;
  return parseIntegerIpv4(h) !== null;
}

/**
 * Returns true if `host` resolves to a private, loopback, or link-local
 * address — i.e. one we never want to hit from a server-side fetcher.
 */
export function isPrivateOrLoopbackHost(host: string): boolean {
  const h = stripBrackets(host);
  if (h === 'localhost' || h === 'localhost.localdomain') return true;
  if (h === 'metadata.google.internal' || h === 'metadata') return true;

  const ipv4 = extractIpv4Octets(h);
  if (ipv4) return isPrivateOrLoopbackIpv4Octets(ipv4);

  if (h.includes(':')) return isPrivateOrLoopbackIpv6Literal(h);

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

type DohAnswer = { data?: string };

async function queryDoh(hostname: string, type: 'A' | 'AAAA'): Promise<string[]> {
  const typeNum = type === 'A' ? 1 : 28;
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${typeNum}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/dns-json' } });
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
  return (body.Answer ?? [])
    .map((a) => (a.data ?? '').replace(/\.$/, ''))
    .filter((addr) => addr.length > 0);
}

/** Resolve A/AAAA records via DNS-over-HTTPS (edge-safe, no node:dns). */
export async function resolveHostAddresses(hostname: string): Promise<string[]> {
  if (isIpLiteral(hostname)) return [stripBrackets(hostname)];

  const [aRecords, aaaaRecords] = await Promise.all([
    queryDoh(hostname, 'A'),
    queryDoh(hostname, 'AAAA'),
  ]);
  const addresses = [...aRecords, ...aaaaRecords];
  if (addresses.length === 0) {
    throw new SafeRenderTargetError(
      'dns_resolution_failed',
      `could not resolve host: ${hostname}`,
    );
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