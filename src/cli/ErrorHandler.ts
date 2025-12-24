/**
 * Error Handler - CLI Error Formatting & Exit Codes
 * Provides consistent error formatting and proper Unix exit codes
 * Sealed namespace with immutable error handling methods
 */

import { Env } from '@config/env';
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
const handleError = (
  error: Error | string,
  exitCode: number = EXIT_CODES.RUNTIME_ERROR,
  log: boolean = true
): void => {
  const message = typeof error === 'string' ? error : error.message;
  const formattedMessage = `${chalk.red('[ERROR]')} ${message}`;

  if (log) {
    Logger.error(formattedMessage);
  }
  process.exit(exitCode);
};

/**
 * Display usage error with help hint
 */
const usageError = (message: string, command?: string): void => {
  const helpText = `Run: zin ${command} --help`;
  const hint = command !== undefined && command !== '' ? `\n${chalk.gray(helpText)}` : '';
  const formattedMessage = `${chalk.red('[ERROR]')} ${message}${hint}`;

  Logger.warn(formattedMessage);

  process.exit(EXIT_CODES.USAGE_ERROR);
};

/**
 * Display info message
 */
const displayInfo = (message: string): void => {
  const formatted = `${chalk.blue('[i]')} ${message}`;
  Logger.info(formatted);
};

/**
 * Display framework banner
 */
const displayBanner = (version: string): void => {
  /* eslint-disable no-console */
  const framework = 'Zintrust Framework';
  const bannerWidth = 46;
  const env = Env.NODE_ENV || 'development';
  const db = Env.DB_CONNECTION || 'sqlite';

  console.log(chalk.cyan('┌' + '─'.repeat(bannerWidth) + '┐'));
  console.log(
    `${chalk.cyan('│')} ${chalk.bold.white('Framework: ')}${chalk.bold.cyan(
      framework.padEnd(bannerWidth - 12)
    )} ${chalk.cyan('│')}`
  );
  console.log(
    `${chalk.cyan('│')} ${chalk.bold.white('Version:   ')}${chalk.bold.green(
      version.padEnd(bannerWidth - 12)
    )} ${chalk.cyan('│')}`
  );
  console.log(
    `${chalk.cyan('│')} ${chalk.bold.white('Env:       ')}${chalk.bold.yellow(
      env.padEnd(bannerWidth - 12)
    )} ${chalk.cyan('│')}`
  );
  console.log(
    `${chalk.cyan('│')} ${chalk.bold.white('Database:  ')}${chalk.bold.magenta(
      db.padEnd(bannerWidth - 12)
    )} ${chalk.cyan('│')}`
  );
  console.log(chalk.cyan('└' + '─'.repeat(bannerWidth) + '┘'));
  console.log();
  /* eslint-enable no-console */
};

/**
 * Display success message
 */
const displaySuccess = (message: string): void => {
  const formatted = `${chalk.green('[✓]')} ${message}`;
  Logger.info(formatted);
};

/**
 * Display warning message
 */
const displayWarning = (message: string): void => {
  const formatted = `${chalk.yellow('[!]')} ${message}`;
  Logger.warn(formatted);
};

/**
 * Display debug message (only if verbose)
 */
const displayDebug = (message: string, verbose: boolean = false): void => {
  if (verbose) {
    const formatted = `${chalk.gray('[DEBUG]')} ${message}`;
    Logger.debug(formatted);
  }
};

/**
 * ErrorHandler namespace - sealed for immutability
 */
export const ErrorHandler = Object.freeze({
  handle: handleError,
  usageError,
  info: displayInfo,
  success: displaySuccess,
  warn: displayWarning,
  debug: displayDebug,
  banner: displayBanner,
});
