/**
 * SEC-2: shared render-target SSRF helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  assertSafeRenderTarget,
  isPrivateOrLoopbackHost,
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
    ]) {
      expect(isPrivateOrLoopbackHost(host)).toBe(true);
    }
    expect(isPrivateOrLoopbackHost('example.com')).toBe(false);
  });
});

describe('assertSafeRenderTarget', () => {
  it('rejects non-https schemes and private host literals', async () => {
    for (const url of [
      'http://example.com',
      'file:///etc/passwd',
      'https://127.0.0.1',
      'https://169.254.169.254',
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
  });

  it('accepts hostnames that resolve to public addresses', async () => {
    await expect(
      assertSafeRenderTarget('https://example.com', {
        resolveHost: async () => ['93.184.216.34'],
      }),
    ).resolves.toBeUndefined();
  });
});