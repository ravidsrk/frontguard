import { describe, it, expect } from 'vitest';
import { verifySlackSignature, timingSafeEqual } from '../src/verify.js';
import { signSlack } from './helpers.js';

const SECRET = 'shhh-signing-secret';
const NOW_MS = 1_700_000_000_000;
const TS = String(Math.floor(NOW_MS / 1000));

describe('verifySlackSignature', () => {
  it('accepts a correctly signed, fresh request', async () => {
    const body = 'token=x&command=/frontguard';
    const sig = await signSlack(body, TS, SECRET);
    expect(await verifySlackSignature(body, TS, sig, SECRET, { nowMs: NOW_MS })).toBe(true);
  });

  it('rejects a tampered body', async () => {
    const sig = await signSlack('original', TS, SECRET);
    expect(await verifySlackSignature('tampered', TS, sig, SECRET, { nowMs: NOW_MS })).toBe(false);
  });

  it('rejects a wrong secret', async () => {
    const body = 'b';
    const sig = await signSlack(body, TS, SECRET);
    expect(await verifySlackSignature(body, TS, sig, 'other-secret', { nowMs: NOW_MS })).toBe(false);
  });

  it('rejects a stale timestamp (replay guard)', async () => {
    const body = 'b';
    const staleTs = String(Math.floor(NOW_MS / 1000) - 10_000);
    const sig = await signSlack(body, staleTs, SECRET);
    expect(await verifySlackSignature(body, staleTs, sig, SECRET, { nowMs: NOW_MS })).toBe(false);
  });

  it('rejects missing or malformed headers', async () => {
    expect(await verifySlackSignature('b', null, 'v0=abc', SECRET, { nowMs: NOW_MS })).toBe(false);
    expect(await verifySlackSignature('b', TS, null, SECRET, { nowMs: NOW_MS })).toBe(false);
    expect(await verifySlackSignature('b', TS, 'sha256=abc', SECRET, { nowMs: NOW_MS })).toBe(false);
  });
});

describe('timingSafeEqual', () => {
  it('compares equal/unequal strings', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});
