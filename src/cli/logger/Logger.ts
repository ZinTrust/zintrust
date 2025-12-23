/**
 * Logger - File-Based Logging System
 * Logs to files with rotation, retention policies, and multiple log levels
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
}

export interface LoggerInstance {
  debug(message: string, data?: Record<string, unknown>, category?: string): void;
  info(message: string, data?: Record<string, unknown>, category?: string): void;
  warn(message: string, data?: Record<string, unknown>, category?: string): void;
  error(message: string, data?: Record<string, unknown>, category?: string): void;
  getLogs(category?: string, limit?: number): LogEntry[];
  filterByLevel(logs: LogEntry[], level: LogLevel): LogEntry[];
  filterByDateRange(logs: LogEntry[], startDate: Date, endDate: Date): LogEntry[];
  clearLogs(category?: string): boolean;
  getLogsDirectory(): string;
  getLogLevel(): LogLevel;
}

const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const ensureLogsDir = (logsDir: string): void => {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
};

const getLogFilePath = (logsDir: string, category: string = 'app'): string => {
  return path.join(logsDir, `${category}.log`);
};

const writeToLogFile = (
  logsDir: string,
  maxFileSize: number,
  entry: LogEntry,
  category: string = 'app'
): void => {
  ensureLogsDir(logsDir);
  const logFile = getLogFilePath(logsDir, category);
  const logString = JSON.stringify(entry) + '\n';

  try {
    // Check file size for rotation
    if (fs.existsSync(logFile)) {
      const stats = fs.statSync(logFile);
      if (stats.size > maxFileSize) {
        const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
        fs.renameSync(logFile, `${logFile}.${timestamp}.bak`);
      }
    }

    fs.appendFileSync(logFile, logString);
  } catch (error) {
    // Fallback to stderr if file logging fails
    process.stderr.write(`Failed to write to log file: ${String(error)}\n`);
  }
};

const log = (
  logsDir: string,
  maxFileSize: number,
  currentLevel: LogLevel,
  logLevel: LogLevel,
  message: string,
  data?: Record<string, unknown>,
  category: string = 'app'
): void => {
  if (levelPriority[logLevel] < levelPriority[currentLevel]) {
    return;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: logLevel,
    message,
    data,
    context: category,
  };

  writeToLogFile(logsDir, maxFileSize, entry, category);
};

export const Logger = Object.freeze({
  /**
   * Create a new logger instance
   */
  create(
    logsDir: string = path.join(process.cwd(), 'logs'),
    maxFileSize: number = 10 * 1024 * 1024, // 10MB
    level: LogLevel = 'info'
  ): LoggerInstance {
    return {
      debug(message: string, data?: Record<string, unknown>, category?: string): void {
        log(logsDir, maxFileSize, level, 'debug', message, data, category);
      },
      info(message: string, data?: Record<string, unknown>, category?: string): void {
        log(logsDir, maxFileSize, level, 'info', message, data, category);
      },
      warn(message: string, data?: Record<string, unknown>, category?: string): void {
        log(logsDir, maxFileSize, level, 'warn', message, data, category);
      },
      error(message: string, data?: Record<string, unknown>, category?: string): void {
        log(logsDir, maxFileSize, level, 'error', message, data, category);
      },
      getLogs(category: string = 'app', limit: number = 100): LogEntry[] {
        const logFile = getLogFilePath(logsDir, category);
        if (!fs.existsSync(logFile)) return [];

        try {
          const content = fs.readFileSync(logFile, 'utf-8');
          return content
            .split('\n')
            .filter((line) => line.trim() !== '')
            .map((line) => JSON.parse(line) as LogEntry)
            .reverse()
            .slice(0, limit);
        } catch (error) {
          process.stderr.write(`Failed to read logs: ${String(error)}\n`);
          return [];
        }
      },
      filterByLevel(logs: LogEntry[], filterLevel: LogLevel): LogEntry[] {
        return logs.filter((l) => l.level === filterLevel);
      },
      filterByDateRange(logs: LogEntry[], startDate: Date, endDate: Date): LogEntry[] {
        return logs.filter((l) => {
          const date = new Date(l.timestamp);
          return date >= startDate && date <= endDate;
        });
      },
      clearLogs(category: string = 'app'): boolean {
        const logFile = getLogFilePath(logsDir, category);
        if (fs.existsSync(logFile)) {
          fs.unlinkSync(logFile);
          return true;
        }
        return false;
      },
      getLogsDirectory(): string {
        return logsDir;
      },
      getLogLevel(): LogLevel {
        return level;
      },
    };
  },

  /**
   * Get singleton instance
   */
  getInstance(): LoggerInstance {
    globalThis.__loggerInstance ??= this.create();
    return globalThis.__loggerInstance;
  },

  // Static-like methods for convenience
  debug(message: string, data?: Record<string, unknown>, category?: string): void {
    this.getInstance().debug(message, data, category);
  },
  info(message: string, data?: Record<string, unknown>, category?: string): void {
    this.getInstance().info(message, data, category);
  },
  warn(message: string, data?: Record<string, unknown>, category?: string): void {
    this.getInstance().warn(message, data, category);
  },
  error(message: string, data?: Record<string, unknown>, category?: string): void {
    this.getInstance().error(message, data, category);
  },
});

// Extend globalThis for singleton
declare global {
  var __loggerInstance: LoggerInstance | undefined;
}

export default Logger;
