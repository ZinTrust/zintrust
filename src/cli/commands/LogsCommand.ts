/**
 * LogsCommand - CLI command for viewing and managing logs
 * Commands: zin logs, zin logs --follow, zin logs --level error, zin logs --clear
 */

import { Logger as FileLogger, LogEntry, LogLevel, LoggerInstance } from '@cli/logger/Logger';
import { Logger } from '@config/logger';
import * as chalk from 'chalk';
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface LogsOptions {
  level: string;
  clear: boolean;
  follow: boolean;
  lines: string;
  category: string;
}

/**
 * Get color for log level
 */
function getLevelColor(level: string): (text: string) => string {
  switch (level.toLowerCase()) {
    case 'debug':
      return chalk.default.gray;
    case 'info':
      return chalk.default.blue;
    case 'warn':
      return chalk.default.yellow;
    case 'error':
      return chalk.default.red;
    default:
      return chalk.default.white;
  }
}

/**
 * Print a single log entry with formatting
 */
function printLogEntry(log: LogEntry): void {
  const timestamp = chalk.default.gray(log.timestamp);
  const levelColor = getLevelColor(log.level);
  const level = levelColor(`[${log.level.toUpperCase()}]`);

  let output = `${timestamp} ${level} ${log.message}`;

  if (log.data !== undefined && Object.keys(log.data).length > 0) {
    output += ` ${chalk.default.cyan(JSON.stringify(log.data))}`;
  }

  Logger.info(output);
}

/**
 * Process a single log line
 */
function processLogLine(line: string, loggerInstance: LoggerInstance): void {
  try {
    const entry = (
      loggerInstance as unknown as { parseLogEntry: (line: string) => LogEntry }
    ).parseLogEntry(line);
    printLogEntry(entry);
  } catch (error) {
    Logger.error('Failed to process log line', error);
    // Malformed line, skip
  }
}

/**
 * Process a chunk of log data
 */
function processLogChunk(chunk: string | Buffer, loggerInstance: LoggerInstance): void {
  const chunkStr = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
  const lines = chunkStr.split('\n').filter((line) => line.trim() !== '');

  for (const line of lines) {
    processLogLine(line, loggerInstance);
  }
}

/**
 * Display recent logs
 */
function displayLogs(
  loggerInstance: LoggerInstance,
  level: string,
  lines: string,
  category: string
): void {
  const numLines = Number.parseInt(lines, 10);
  const logs = loggerInstance.getLogs(category, numLines);

  if (logs.length === 0) {
    Logger.info(chalk.default.yellow('ℹ  No logs found'));
    return;
  }

  // Filter by level if specified
  let filtered = logs;
  if (level !== undefined && level !== '' && level !== 'all') {
    filtered = loggerInstance.filterByLevel(logs, level as LogLevel);
  }

  if (filtered.length === 0) {
    Logger.info(chalk.default.yellow(`ℹ  No logs found with level: ${level}`));
    return;
  }

  Logger.info(chalk.default.blue(`📋 Last ${filtered.length} log entries (${category}):\n`));

  for (const log of [...filtered].reverse()) {
    printLogEntry(log);
  }
}

/**
 * Follow logs in real-time
 */
function followLogs(category: string): void {
  const loggerInstance = FileLogger.getInstance();
  const logsDir = loggerInstance.getLogsDirectory();
  const categoryDir = path.join(logsDir, category);

  if (!fs.existsSync(categoryDir)) {
    Logger.info(chalk.default.red(`✗ Log category directory not found: ${categoryDir}`));
    return;
  }

  // Get today's log file
  const today = new Date().toISOString().split('T')[0];
  const logFile = path.join(categoryDir, `${today}.log`);

  Logger.info(chalk.default.blue(`👀 Following logs: ${logFile}\n`));
  Logger.info(chalk.default.gray('Press Ctrl+C to stop...\n'));

  let lastSize = 0;

  // Check for new lines periodically
  const interval = setInterval(() => {
    if (!fs.existsSync(logFile)) {
      return;
    }

    const stats = fs.statSync(logFile);
    if (stats.size > lastSize) {
      // Read new lines
      const stream = fs.createReadStream(logFile, {
        start: lastSize,
        encoding: 'utf-8',
      });

      stream.on('data', (chunk: string | Buffer) => {
        processLogChunk(chunk, loggerInstance);
      });

      lastSize = stats.size;
    }
  }, 1000);

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(interval);
    Logger.info(chalk.default.yellow('\n\nLog following stopped'));
    process.exit(0);
  });
}

/**
 * Clear logs for a category
 */
function clearLogs(loggerInstance: LoggerInstance, category: string): void {
  const confirmed = true; // In real CLI, would prompt for confirmation

  if (!confirmed) {
    Logger.info(chalk.default.yellow('Clearing logs cancelled'));
    return;
  }

  const success = loggerInstance.clearLogs(category);

  if (success === true) {
    Logger.info(chalk.default.green(`✓ Cleared logs for category: ${category}`));
  } else {
    Logger.info(chalk.default.red(`✗ Failed to clear logs for category: ${category}`));
  }
}

/**
 * Handle logs command
 */
async function handleLogs(options: LogsOptions): Promise<void> {
  const loggerInstance = FileLogger.getInstance();

  // Clear logs
  if (options.clear === true) {
    clearLogs(loggerInstance, options.category);
    return;
  }

  // Follow logs in real-time
  if (options.follow === true) {
    followLogs(options.category);
    return;
  }

  // Display recent logs
  displayLogs(loggerInstance, options.level, options.lines, options.category);
}

/**
 * LogsCommand - CLI command for viewing and managing logs
 */
export const LogsCommand = {
  /**
   * Register the command with Commander
   */
  register(program: Command): void {
    program
      .command('logs')
      .description('View and manage application logs')
      .option('-l, --level <level>', 'Filter by log level (debug, info, warn, error)', 'info')
      .option('-c, --clear', 'Clear all logs')
      .option('-f, --follow', 'Follow logs in real-time (like tail -f)')
      .option('-n, --lines <number>', 'Number of lines to show', '50')
      .option('--category <category>', 'Log category (app, cli, errors, migrations, debug)', 'app')
      .action((options: LogsOptions) => handleLogs(options));
  },
};

export default LogsCommand;
