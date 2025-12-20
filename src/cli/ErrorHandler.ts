/**
 * Error Handler - CLI Error Formatting & Exit Codes
 * Provides consistent error formatting and proper Unix exit codes
 */

import { Logger } from '@config/logger';
import chalk from 'chalk';

export const EXIT_CODES = {
  SUCCESS: 0,
  RUNTIME_ERROR: 1,
  USAGE_ERROR: 2,
} as const;

/**
 * Format and display error
 * Exit codes: 0 (success), 1 (runtime error), 2 (usage error)
 */
export function handleError(
  error: Error | string,
  exitCode: number = EXIT_CODES.RUNTIME_ERROR
): void {
  const message = typeof error === 'string' ? error : error.message;
  const formattedMessage = `${chalk.red('[ERROR]')} ${message}`;

  Logger.error(formattedMessage);

  process.exit(exitCode);
}

/**
 * Display usage error with help hint
 */
export function usageError(message: string, command?: string): void {
  const helpText = `Run: zin ${command} --help`;
  const hint = command !== undefined && command !== '' ? `\n${chalk.gray(helpText)}` : '';
  const formattedMessage = `${chalk.red('[ERROR]')} ${message}${hint}`;

  Logger.warn(formattedMessage);

  process.exit(EXIT_CODES.USAGE_ERROR);
}

/**
 * Display info message
 */
export function displayInfo(message: string): void {
  const formatted = `${chalk.blue('[i]')} ${message}`;
  Logger.info(formatted);
}

/**
 * Display success message
 */
export function displaySuccess(message: string): void {
  const formatted = `${chalk.green('[✓]')} ${message}`;
  Logger.info(formatted);
}

/**
 * Display warning message
 */
export function displayWarning(message: string): void {
  const formatted = `${chalk.yellow('[!]')} ${message}`;
  Logger.warn(formatted);
}

/**
 * Display debug message (only if verbose)
 */
export function displayDebug(message: string, verbose: boolean = false): void {
  if (verbose) {
    const formatted = `${chalk.gray('[DEBUG]')} ${message}`;
    Logger.debug(formatted);
  }
}

/**
 * ErrorHandler namespace for backward compatibility
 */
export const ErrorHandler = {
  handle: handleError,
  usageError,
  info: displayInfo,
  success: displaySuccess,
  warn: displayWarning,
  debug: displayDebug,
};
