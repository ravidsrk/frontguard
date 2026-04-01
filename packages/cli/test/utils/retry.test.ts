import { describe, it, expect, vi } from 'vitest';
import { retry, createRetrier } from '../../src/utils/retry.js';

describe('retry', () => {
  it('succeeds on first attempt without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn, { retries: 3, backoff: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds eventually', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail-1'))
      .mockRejectedValueOnce(new Error('fail-2'))
      .mockResolvedValue('success');

    const onRetry = vi.fn();
    const result = await retry(fn, { retries: 3, backoff: 1, onRetry });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    // First retry is called with (error, 1), second with (error, 2)
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 1);
    expect(onRetry).toHaveBeenCalledWith(expect.any(Error), 2);
  });

  it('throws last error when all retries are exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

    await expect(
      retry(fn, { retries: 2, backoff: 1 })
    ).rejects.toThrow('persistent failure');

    // initial attempt + 2 retries = 3 total calls
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('wraps non-Error throws into Error instances', async () => {
    const fn = vi.fn().mockRejectedValue('string error');

    await expect(
      retry(fn, { retries: 0, backoff: 1 })
    ).rejects.toThrow('string error');
  });

  it('respects isRetryable — throws immediately for non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'));

    await expect(
      retry(fn, {
        retries: 3,
        backoff: 1,
        isRetryable: () => false,
      })
    ).rejects.toThrow('fatal');

    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('createRetrier', () => {
  it('creates a retrier with default options', async () => {
    const retrier = createRetrier({ retries: 1, backoff: 1 });
    const fn = vi.fn().mockResolvedValue(42);
    const result = await retrier(fn);
    expect(result).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('allows overrides on each call', async () => {
    const retrier = createRetrier({ retries: 5, backoff: 1 });
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(retrier(fn, { retries: 0 })).rejects.toThrow('fail');
    // retries: 0 means only 1 attempt
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
