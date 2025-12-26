/**
 * LogsCommand - CLI command for viewing and managing logs
 * Commands: zin logs, zin logs --follow, zin logs --level error, zin logs --clear
 */

import { BaseCommand, CommandOptions, IBaseCommand } from '@cli/BaseCommand';
import { Logger as FileLogger, LogEntry, LogLevel, LoggerInstance } from '@cli/logger/Logger';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import fs from '@node-singletons/fs';
import chalk from 'chalk';
import { Command } from 'commander';
import * as path from 'node:path';

interface LogsOptions {
  level: string;
  clear: boolean;
  follow: boolean;
  lines: number;
  category: string;
}

const normalizeLogsOptions = (options: CommandOptions): LogsOptions => {
  const level = typeof options['level'] === 'string' ? options['level'] : 'info';
  const clear = options['clear'] === true;
  const follow = options['follow'] === true;
  const linesRaw = typeof options['lines'] === 'string' ? options['lines'] : '50';
  const linesParsed = Number.parseInt(linesRaw, 10);
  const lines = Number.isFinite(linesParsed) ? linesParsed : 50;
  const category = typeof options['category'] === 'string' ? options['category'] : 'app';
  return { level, clear, follow, lines, category };
};

const getLevelColor = (level: string): ((text: string) => string) => {
  switch (level.toLowerCase()) {
    case 'debug':
      return chalk.gray;
    case 'info':
      return chalk.blue;
    case 'warn':
      return chalk.yellow;
    case 'error':
      return chalk.red;
    default:
      return chalk.white;
  }
};

const printLogEntry = (log: LogEntry): void => {
  const timestamp = chalk.gray(log.timestamp);
  const levelColor = getLevelColor(log.level);
  const level = levelColor(`[${log.level.toUpperCase()}]`);

  let output = `${timestamp} ${level} ${log.message}`;

  if (log.data !== undefined && Object.keys(log.data).length > 0) {
    output += ` ${chalk.cyan(JSON.stringify(log.data))}`;
  }

  Logger.info(output);
};

const parseLogEntry = (loggerInstance: LoggerInstance, line: string): LogEntry => {
  const maybe = loggerInstance as unknown as { parseLogEntry?: (l: string) => LogEntry };
  if (typeof maybe.parseLogEntry !== 'function') {
    throw ErrorFactory.createGeneralError('LoggerInstance does not support parseLogEntry');
  }
  return maybe.parseLogEntry(line);
};

const processLogChunk = (chunk: string | Buffer, loggerInstance: LoggerInstance): void => {
  const chunkStr = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
  const lines = chunkStr.split('\n').filter((line) => line.trim() !== '');
  for (const line of lines) {
    try {
      const entry = parseLogEntry(loggerInstance, line);
      printLogEntry(entry);
    } catch (error) {
      ErrorFactory.createTryCatchError('Failed to process log line', error);
    }
  }
};

const displayLogs = (
  loggerInstance: LoggerInstance,
  level: string,
  lines: number,
  category: string
): void => {
  const logs = loggerInstance.getLogs(category, lines);
  if (logs.length === 0) {
    Logger.info(chalk.yellow('ℹ  No logs found'));
    return;
  }

  let filtered = logs;
  if (level !== '' && level !== 'all') {
    filtered = loggerInstance.filterByLevel(logs, level as LogLevel);
  }

  if (filtered.length === 0) {
    Logger.info(chalk.yellow(`ℹ  No logs found with level: ${level}`));
    return;
  }

  Logger.info(chalk.blue(`📋 Last ${filtered.length} log entries (${category}):\n`));
  for (const log of [...filtered].reverse()) {
    printLogEntry(log);
  }
};

const followLogs = (category: string): void => {
  const loggerInstance = FileLogger.getInstance();
  const logsDir = loggerInstance.getLogsDirectory();
  const categoryDir = path.join(logsDir, category);

  if (!fs.existsSync(categoryDir)) {
    Logger.info(chalk.red(`✗ Log category directory not found: ${categoryDir}`));
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const logFile = path.join(categoryDir, `${today}.log`);

  Logger.info(chalk.blue(`👀 Following logs: ${logFile}\n`));
  Logger.info(chalk.gray('Press Ctrl+C to stop...\n'));

  let lastSize = 0;

  const interval = setInterval(() => {
    if (!fs.existsSync(logFile)) return;
    const stats = fs.statSync(logFile);
    if (stats.size <= lastSize) return;

    const stream = fs.createReadStream(logFile, {
      start: lastSize,
      encoding: 'utf-8',
    });

    stream.on('data', (chunk: string | Buffer) => {
      processLogChunk(chunk, loggerInstance);
    });

    lastSize = stats.size;
  }, 1000);

  process.on('SIGINT', () => {
    clearInterval(interval);
    Logger.info(chalk.yellow('\n\nLog following stopped'));
    process.exit(0);
  });
};

const clearLogs = (loggerInstance: LoggerInstance, category: string): void => {
  const success = loggerInstance.clearLogs(category);
  if (success === true) {
    Logger.info(chalk.green(`✓ Cleared logs for category: ${category}`));
  } else {
    Logger.info(chalk.red(`✗ Failed to clear logs for category: ${category}`));
  }
};

const executeLogs = (options: CommandOptions): void => {
  const normalized = normalizeLogsOptions(options);
  const loggerInstance = FileLogger.getInstance();

  if (options['lines'] !== undefined && Number.isNaN(Number(options['lines']))) {
    throw ErrorFactory.createGeneralError('Lines must be a number');
  }

  if (normalized.clear) {
    clearLogs(loggerInstance, normalized.category);
    return;
  }

  if (normalized.follow) {
    followLogs(normalized.category);
    return;
  }

  displayLogs(loggerInstance, normalized.level, normalized.lines, normalized.category);
};

export const LogsCommand = Object.freeze({
  /**
   * Create a new logs command instance
   */
  create(): IBaseCommand {
    const addOptions = (command: Command): void => {
      command
        .option('-l, --level <level>', 'Filter by log level (debug, info, warn, error)', 'info')
        .option('-c, --clear', 'Clear all logs')
        .option('-f, --follow', 'Follow logs in real-time (like tail -f)')
        .option('-n, --lines <number>', 'Number of lines to show', '50')
        .option(
          '--category <category>',
          'Log category (app, cli, errors, migrations, debug)',
          'app'
        );
    };

    const cmd: IBaseCommand = BaseCommand.create({
      name: 'logs',
      description: 'View and manage application logs',
      addOptions,
      execute: (options: CommandOptions): void => executeLogs(options),
    });

    return cmd;
  },

  /**
   * Register the command with Commander
   * @deprecated Use create() instead
   */
  register(program: Command): void {
    const cmd = program.command('logs');
    cmd.description('View and manage application logs');
    cmd
      .option('-l, --level <level>', 'Filter by log level (debug, info, warn, error)', 'info')
      .option('-c, --clear', 'Clear all logs')
      .option('-f, --follow', 'Follow logs in real-time (like tail -f)')
      .option('-n, --lines <number>', 'Number of lines to show', '50')
      .option('--category <category>', 'Log category (app, cli, errors, migrations, debug)', 'app');

    cmd.action((options: unknown) => {
      executeLogs(options as CommandOptions);
    });
  },
});

export default LogsCommand;
