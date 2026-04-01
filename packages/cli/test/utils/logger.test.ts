import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, setLogLevel, getLogLevel, type LogLevel } from '../../src/utils/logger.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  setLogLevel('info'); // reset to default
  stderrSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// setLogLevel / getLogLevel
// ---------------------------------------------------------------------------

describe('setLogLevel / getLogLevel', () => {
  it('defaults to info', () => {
    setLogLevel('info');
    expect(getLogLevel()).toBe('info');
  });

  it('can be changed to debug', () => {
    setLogLevel('debug');
    expect(getLogLevel()).toBe('debug');
  });

  it('can be changed to error', () => {
    setLogLevel('error');
    expect(getLogLevel()).toBe('error');
  });
});

// ---------------------------------------------------------------------------
// Log level gating
// ---------------------------------------------------------------------------

describe('log level gating', () => {
  it('at level=info: debug is suppressed, info/warn/error are shown', () => {
    setLogLevel('info');

    logger.debug('debug message');
    expect(stderrSpy).not.toHaveBeenCalled();

    logger.info('info message');
    expect(stderrSpy).toHaveBeenCalledTimes(1);

    logger.warn('warn message');
    expect(stderrSpy).toHaveBeenCalledTimes(2);

    logger.error('error message');
    expect(stderrSpy).toHaveBeenCalledTimes(3);
  });

  it('at level=debug: all levels are shown', () => {
    setLogLevel('debug');

    logger.debug('debug message');
    expect(stderrSpy).toHaveBeenCalledTimes(1);

    logger.info('info message');
    expect(stderrSpy).toHaveBeenCalledTimes(2);

    logger.warn('warn message');
    expect(stderrSpy).toHaveBeenCalledTimes(3);

    logger.error('error message');
    expect(stderrSpy).toHaveBeenCalledTimes(4);
  });

  it('at level=warn: debug and info are suppressed', () => {
    setLogLevel('warn');

    logger.debug('debug message');
    logger.info('info message');
    expect(stderrSpy).not.toHaveBeenCalled();

    logger.warn('warn message');
    expect(stderrSpy).toHaveBeenCalledTimes(1);

    logger.error('error message');
    expect(stderrSpy).toHaveBeenCalledTimes(2);
  });

  it('at level=error: only error is shown', () => {
    setLogLevel('error');

    logger.debug('nope');
    logger.info('nope');
    logger.warn('nope');
    expect(stderrSpy).not.toHaveBeenCalled();

    logger.error('yes');
    expect(stderrSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Message formatting
// ---------------------------------------------------------------------------

describe('message formatting', () => {
  it('includes the message text in output', () => {
    setLogLevel('info');
    logger.info('hello world');
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toContain('hello world');
  });

  it('serializes objects as JSON', () => {
    setLogLevel('info');
    logger.info('data:', { key: 'value' });
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toContain('key');
    expect(output).toContain('value');
  });

  it('serializes Error objects with stack', () => {
    setLogLevel('info');
    const err = new Error('boom');
    logger.info(err);
    const output = stderrSpy.mock.calls[0][0] as string;
    expect(output).toContain('boom');
  });
});

// ---------------------------------------------------------------------------
// newline
// ---------------------------------------------------------------------------

describe('logger.newline', () => {
  it('outputs an empty line at info level', () => {
    setLogLevel('info');
    logger.newline();
    expect(stderrSpy).toHaveBeenCalledWith('');
  });

  it('is suppressed at warn level', () => {
    setLogLevel('warn');
    logger.newline();
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
