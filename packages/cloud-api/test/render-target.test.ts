/**
 * SEC-2: shared render-target SSRF helpers.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  assertSafeRenderTarget,
  isPrivateOrLoopbackHost,
  resolveHostAddresses,
  SafeRenderTargetError,
} from '../src/security/render-target.js';

describe('isPrivateOrLoopbackHost', () => {
  it('blocks private, loopback, and metadata hosts', () => {
    for (const host of [
      '127.0.0.1',
      '10.0.0.5',
      '192.168.1.1',
      '172.16.0.1',
      '169.254.169.254',
      'localhost',
      'metadata.google.internal',
      '::1',
      '[::1]',
      '0.0.0.0',
    ]) {
      expect(isPrivateOrLoopbackHost(host)).toBe(true);
    }
    expect(isPrivateOrLoopbackHost('example.com')).toBe(false);
  });

  it('blocks IPv6 link-local (fe80::/10), loopback, unspecified, and unique-local', () => {
    for (const host of [
      'fe80::1',
      '[fe80::1]',
      'feb0::1',
      'fea0::dead:beef',
      'fc00::1',
      'fd12:3456::',
      '::',
      '0:0:0:0:0:0:0:0',
    ]) {
      expect(isPrivateOrLoopbackHost(host)).toBe(true);
    }
  });

  it('blocks IPv4-mapped loopback, metadata, private, and link-local ranges', () => {
    for (const host of [
      '::ffff:127.0.0.1',
      '[::ffff:127.0.0.1]',
      '::ffff:7f00:1',
      '[::ffff:7f00:1]',
      '::ffff:169.254.169.254',
      '::ffff:10.0.0.1',
      '::ffff:a9fe:a9fe', // 169.254.169.254 hex-mapped
      '0:0:0:0:0:ffff:127.0.0.1',
      '0:0:0:0:0:ffff:7f00:1',
    ]) {
      expect(isPrivateOrLoopbackHost(host)).toBe(true);
    }
  });

  it('blocks obfuscated IPv4 literal forms', () => {
    for (const host of [
      '2130706433',
      '0x7f000001',
      '0177.0.0.1',
      '127.1',
      '0',
    ]) {
      expect(isPrivateOrLoopbackHost(host)).toBe(true);
    }
  });
});

describe('assertSafeRenderTarget', () => {
  it('rejects non-https schemes and private host literals', async () => {
    for (const url of [
      'http://example.com',
      'file:///etc/passwd',
      'https://127.0.0.1',
      'https://169.254.169.254',
      'https://[::ffff:127.0.0.1]',
      'https://[::ffff:169.254.169.254]',
      'https://[::ffff:7f00:1]',
      'https://[fe80::1]',
      'https://[::1]',
      'https://2130706433',
      'https://0.0.0.0',
    ]) {
      await expect(assertSafeRenderTarget(url)).rejects.toBeInstanceOf(SafeRenderTargetError);
    }
  });

  it('rejects hostnames that resolve to private addresses', async () => {
    await expect(
      assertSafeRenderTarget('https://rebind.example', {
        resolveHost: async () => ['10.0.0.1'],
      }),
    ).rejects.toMatchObject({ code: 'dns_private' });

    await expect(
      assertSafeRenderTarget('https://rebind.example', {
        resolveHost: async () => ['::ffff:127.0.0.1'],
      }),
    ).rejects.toMatchObject({ code: 'dns_private' });

    await expect(
      assertSafeRenderTarget('https://rebind.example', {
        resolveHost: async () => ['fe80::1'],
      }),
    ).rejects.toMatchObject({ code: 'dns_private' });
  });

  it('accepts hostnames that resolve to public addresses', async () => {
    await expect(
      assertSafeRenderTarget('https://example.com', {
        resolveHost: async () => ['93.184.216.34'],
      }),
    ).resolves.toBeUndefined();
  });

  it('fails closed when injected DNS resolution errors', async () => {
    await expect(
      assertSafeRenderTarget('https://example.com', {
        resolveHost: async () => {
          throw new Error('timeout');
        },
      }),
    ).rejects.toMatchObject({ code: 'dns_resolution_failed' });
  });
});

describe('resolveHostAddresses — DoH fail-closed (SEC-2)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.stubGlobal('fetch', originalFetch);
  });

  it('rejects when DoH fetch throws (network/timeout)', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('network timeout');
    });

    await expect(resolveHostAddresses('example.com')).rejects.toMatchObject({
      code: 'dns_resolution_failed',
    });
  });

  it('rejects when DoH returns a non-OK HTTP status', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('error', { status: 503 }),
    );

    await expect(resolveHostAddresses('example.com')).rejects.toMatchObject({
      code: 'dns_resolution_failed',
    });
  });

  it('rejects when DoH returns no records', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ Answer: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    await expect(resolveHostAddresses('no-such-host.example')).rejects.toMatchObject({
      code: 'dns_resolution_failed',
    });
  });
});