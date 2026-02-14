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

  if (log) {
    Logger.error(message);
  }
  process.exit(exitCode);
};

/**
 * Display usage error with help hint
 */
const usageError = (message: string, command?: string): void => {
  const helpText = `Run: zin ${command} --help`;
  const hint = command !== undefined && command !== '' ? `\n${chalk.gray(helpText)}` : '';

  Logger.error(`${message}${hint}`);

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
  const framework = 'ZinTrust Framework';
  const bannerWidth = 46;
  const env = Env.NODE_ENV ?? 'development';
  const db = Env.DB_CONNECTION || 'sqlite';

  const border = chalk.cyanBright;
  const label = chalk.bold.white;
  const frameworkValue = chalk.bold.cyanBright;
  const versionValue = chalk.bold.greenBright;
  const envValue = chalk.bold.yellowBright;
  const dbValue = chalk.bold.magentaBright;

  console.log(border('┌' + '─'.repeat(bannerWidth) + '┐'));
  console.log(
    `${border('│')} ${label('Framework: ')}${frameworkValue(
      framework.padEnd(bannerWidth - 12)
    )} ${border('│')}`
  );
  console.log(
    `${border('│')} ${label('Version:   ')}${versionValue(
      version.padEnd(bannerWidth - 12)
    )} ${border('│')}`
  );
  console.log(
    `${border('│')} ${label('Env:       ')}${envValue(env.padEnd(bannerWidth - 12))} ${border('│')}`
  );
  console.log(
    `${border('│')} ${label('Database:  ')}${dbValue(db.padEnd(bannerWidth - 12))} ${border('│')}`
  );
  console.log(border('└' + '─'.repeat(bannerWidth) + '┘'));
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
