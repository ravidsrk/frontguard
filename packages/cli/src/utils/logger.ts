/**
 * Structured logger for Frontguard.
 * Supports log levels, respects --verbose/--debug flags, and redacts secrets.
 */

import chalk from 'chalk';
import { redact } from './redact.js';

/** Log levels in order of verbosity */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/** Global logger configuration */
let currentLevel: LogLevel = 'info';

/**
 * Sets the global log level.
 * @param level - Minimum log level to display
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/**
 * Gets the current log level.
 */
export function getLogLevel(): LogLevel {
  return currentLevel;
}

/**
 * Checks if a given level would produce output at the current setting.
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
}

/**
 * Formats and redacts a log message.
 */
function formatMessage(parts: unknown[]): string {
  return redact(
    parts
      .map((p) => {
        if (typeof p === 'string') return p;
        if (p instanceof Error) return p.stack || p.message;
        try {
          return JSON.stringify(p, null, 2);
        } catch {
          return String(p);
        }
      })
      .join(' ')
  );
}

/** Logger instance with level-based methods */
export const logger = {
  /**
   * Debug-level log — only shown with --debug flag.
   * Use for internal state, timing details, and troubleshooting.
   */
  debug(...args: unknown[]): void {
    if (!shouldLog('debug')) return;
    const msg = formatMessage(args);
    console.error(chalk.gray(`  ${chalk.dim('[debug]')} ${msg}`));
  },

  /**
   * Info-level log — shown by default.
   * Use for progress updates, stage transitions, and key events.
   */
  info(...args: unknown[]): void {
    if (!shouldLog('info')) return;
    const msg = formatMessage(args);
    console.error(chalk.blue(`  ℹ ${msg}`));
  },

  /**
   * Warning-level log — always shown unless errors-only.
   * Use for non-fatal issues, degraded functionality, and suggestions.
   */
  warn(...args: unknown[]): void {
    if (!shouldLog('warn')) return;
    const msg = formatMessage(args);
    console.error(chalk.yellow(`  ⚠ ${msg}`));
  },

  /**
   * Error-level log — always shown.
   * Use for failures, exceptions, and fatal issues.
   */
  error(...args: unknown[]): void {
    if (!shouldLog('error')) return;
    const msg = formatMessage(args);
    console.error(chalk.red(`  ✘ ${msg}`));
  },

  /**
   * Blank line for visual separation in output.
   */
  newline(): void {
    if (!shouldLog('info')) return;
    console.error('');
  },
};
