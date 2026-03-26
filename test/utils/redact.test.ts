import { describe, it, expect } from 'vitest';
import { redact, containsSecret } from '../../src/utils/redact.js';

describe('redact', () => {
  it('redacts OpenAI API keys', () => {
    const input = 'my key is sk-abc123456789012345678';
    const result = redact(input);
    expect(result).not.toContain('sk-abc123456789012345678');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts OpenAI project keys', () => {
    const key = 'sk-proj-' + 'a'.repeat(50);
    const result = redact(`token: ${key}`);
    expect(result).not.toContain(key);
    expect(result).toContain('[REDACTED]');
  });

  it('redacts Anthropic API keys', () => {
    const key = 'anthropic-' + 'x'.repeat(30);
    const result = redact(`key=${key}`);
    expect(result).not.toContain(key);
    expect(result).toContain('[REDACTED]');
  });

  it('redacts GitHub PAT tokens (ghp_)', () => {
    const key = 'ghp_' + 'A'.repeat(36);
    const result = redact(`Authorization: ${key}`);
    expect(result).not.toContain(key);
    expect(result).toContain('[REDACTED]');
  });

  it('redacts Bearer tokens', () => {
    const token = 'Bearer ' + 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const result = redact(`Header: ${token}`);
    expect(result).not.toContain(token);
    expect(result).toContain('[REDACTED]');
  });

  it('leaves normal text unchanged', () => {
    const text = 'Hello world, this is a normal log message with no secrets.';
    expect(redact(text)).toBe(text);
  });

  it('redacts multiple secrets in one string', () => {
    const sk = 'sk-' + 'a'.repeat(25);
    const ghp = 'ghp_' + 'B'.repeat(36);
    const input = `keys: ${sk} and ${ghp}`;
    const result = redact(input);
    expect(result).not.toContain(sk);
    expect(result).not.toContain(ghp);
    expect(result.match(/\[REDACTED\]/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it('returns empty string for empty input', () => {
    expect(redact('')).toBe('');
  });

  it('returns falsy values as-is', () => {
    // The function returns early on falsy input
    expect(redact(undefined as unknown as string)).toBeUndefined();
  });
});

describe('containsSecret', () => {
  it('detects OpenAI keys', () => {
    expect(containsSecret('sk-' + 'x'.repeat(25))).toBe(true);
  });

  it('returns false for normal text', () => {
    expect(containsSecret('just a normal string')).toBe(false);
  });

  it('returns false for empty/non-string input', () => {
    expect(containsSecret('')).toBe(false);
    expect(containsSecret(null as unknown as string)).toBe(false);
  });
});
