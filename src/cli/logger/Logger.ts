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

let instance: LoggerInstance | undefined;

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

class LoggerImpl implements LoggerInstance {
  private readonly logsDir: string;
  private readonly maxFileSize: number; // in bytes
  private readonly retentionDays: number;
  private readonly currentLevel: LogLevel;
  private readonly levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(
    logsDir: string = path.join(process.cwd(), 'logs'),
    maxFileSize: number = 10 * 1024 * 1024, // 10MB
    retentionDays: number = 30,
    level: LogLevel = 'info'
  ) {
    this.logsDir = logsDir;
    this.maxFileSize = maxFileSize;
    this.retentionDays = retentionDays;
    this.currentLevel = level;

    this.ensureLogsDirectory();
  }

  private ensureLogsDirectory(): void {
    const dirs = [
      this.logsDir,
      path.join(this.logsDir, 'cli'),
      path.join(this.logsDir, 'app'),
      path.join(this.logsDir, 'errors'),
      path.join(this.logsDir, 'migrations'),
      path.join(this.logsDir, 'debug'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  public debug(message: string, data?: Record<string, unknown>, category?: string): void {
    this.log('debug', message, data, category);
  }

  public info(message: string, data?: Record<string, unknown>, category?: string): void {
    this.log('info', message, data, category);
  }

  public warn(message: string, data?: Record<string, unknown>, category?: string): void {
    this.log('warn', message, data, category);
  }

  public error(message: string, data?: Record<string, unknown>, category?: string): void {
    this.log('error', message, data, category);
  }

  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    category: string = 'app'
  ): void {
    if (this.levelPriority[level] < this.levelPriority[this.currentLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };

    this.writeLog(category, entry);

    if (level === 'error') {
      this.writeLog('errors', entry);
    }

    this.checkRotation();
  }

  private writeLog(category: string, entry: LogEntry): void {
    const filename =
      category === 'sonarcloud'
        ? `${this.getDateString()}-sonarqube.log`
        : `${this.getDateString()}.log`;
    const logFile =
      category === 'sonarcloud'
        ? path.join(this.logsDir, filename)
        : path.join(this.logsDir, category, filename);

    try {
      const formattedEntry = this.formatLogEntry(entry);
      fs.appendFileSync(logFile, formattedEntry + '\n', 'utf-8');
    } catch (error) {
      process.stderr.write(`Failed to write log entry: ${(error as Error).message}\n`);
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    const parts = [`[${entry.timestamp}]`, `[${entry.level.toUpperCase()}]`, entry.message];

    if (entry.data !== undefined && Object.keys(entry.data).length > 0) {
      parts.push(JSON.stringify(entry.data));
    }

    return parts.join(' ');
  }

  private getDateString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  private checkRotation(): void {
    const logFile = path.join(this.logsDir, 'app', `${this.getDateString()}.log`);

    try {
      const stats = fs.statSync(logFile);
      if (stats.size > this.maxFileSize) {
        this.rotateLog(logFile);
      }
    } catch {
      // File doesn't exist yet
    }

    this.cleanupOldLogs();
  }

  private rotateLog(logFile: string): void {
    const timestamp = Date.now();
    const dir = path.dirname(logFile);
    const ext = path.extname(logFile);
    const base = path.basename(logFile, ext);
    const rotatedFile = path.join(dir, `${base}.${timestamp}${ext}`);

    try {
      fs.renameSync(logFile, rotatedFile);
    } catch (error) {
      process.stderr.write(`Failed to rotate log: ${(error as Error).message}\n`);
    }
  }

  private cleanupOldLogs(): void {
    const now = Date.now();
    const maxAge = this.retentionDays * 24 * 60 * 60 * 1000;

    const categories = ['cli', 'app', 'errors', 'migrations', 'debug'];

    for (const category of categories) {
      const categoryDir = path.join(this.logsDir, category);

      if (!fs.existsSync(categoryDir)) {
        continue;
      }

      const files = fs.readdirSync(categoryDir);

      for (const file of files) {
        const filePath = path.join(categoryDir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtimeMs > maxAge) {
          try {
            fs.unlinkSync(filePath);
          } catch (error) {
            process.stderr.write(`Failed to delete old log: ${(error as Error).message}\n`);
          }
        }
      }
    }
  }

  public getLogs(category: string = 'app', limit: number = 100): LogEntry[] {
    const categoryDir = path.join(this.logsDir, category);

    if (!fs.existsSync(categoryDir)) {
      return [];
    }

    const files = fs
      .readdirSync(categoryDir)
      .sort((a, b) => a.localeCompare(b))
      .reverse();
    const logs: LogEntry[] = [];

    for (const file of files) {
      if (logs.length >= limit) {
        break;
      }

      const filePath = path.join(categoryDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines.toReversed()) {
        if (logs.length >= limit) {
          break;
        }

        try {
          const entry = this.parseLogEntry(line);
          logs.push(entry);
        } catch {
          // Skip malformed lines
        }
      }
    }

    return logs;
  }

  private parseLogEntry(line: string): LogEntry {
    const timestampMatch = new RegExp(/^\[([^\]]+)\]/).exec(line);
    if (timestampMatch === null) {
      throw new Error('Invalid log format');
    }

    const timestamp = timestampMatch[1];
    const afterTimestamp = line.substring(timestampMatch[0].length).trim();

    const levelMatch = new RegExp(/^\[([^\]]+)\]/).exec(afterTimestamp);
    if (levelMatch === null) {
      throw new Error('Invalid log level format');
    }

    const level = levelMatch[1].toLowerCase() as LogLevel;
    const rest = afterTimestamp.substring(levelMatch[0].length).trim();

    let message = rest;
    let data: Record<string, unknown> | undefined;

    const jsonMatch = new RegExp(/^(.+?)\s+({.+})$/).exec(rest);
    if (jsonMatch !== null) {
      message = jsonMatch[1];
      try {
        data = JSON.parse(jsonMatch[2]) as Record<string, unknown>;
      } catch {
        message = rest;
      }
    }

    return {
      timestamp,
      level,
      message,
      data,
    };
  }

  public filterByLevel(logs: LogEntry[], level: LogLevel): LogEntry[] {
    return logs.filter((log) => log.level === level);
  }

  public filterByDateRange(logs: LogEntry[], startDate: Date, endDate: Date): LogEntry[] {
    const start = startDate.getTime();
    const end = endDate.getTime();

    return logs.filter((log) => {
      const time = new Date(log.timestamp).getTime();
      return time >= start && time <= end;
    });
  }

  public clearLogs(category: string = 'app'): boolean {
    const categoryDir = path.join(this.logsDir, category);

    if (!fs.existsSync(categoryDir)) {
      return false;
    }

    try {
      const files = fs.readdirSync(categoryDir);
      for (const file of files) {
        fs.unlinkSync(path.join(categoryDir, file));
      }
      return true;
    } catch (error) {
      process.stderr.write(`Failed to clear logs: ${(error as Error).message}\n`);
      return false;
    }
  }

  public getLogsDirectory(): string {
    return this.logsDir;
  }

  public getLogLevel(): LogLevel {
    return this.currentLevel;
  }
}

/**
 * Logger provides structured logging to files with rotation and retention
 */
export const Logger = {
  getInstance(): LoggerInstance {
    instance ??= new LoggerImpl();
    return instance;
  },

  initialize(
    logsDir?: string,
    maxFileSize?: number,
    retentionDays?: number,
    level?: LogLevel
  ): LoggerInstance {
    instance = new LoggerImpl(logsDir, maxFileSize, retentionDays, level);
    return instance;
  },

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

  getLogs(category: string = 'app', limit: number = 100): LogEntry[] {
    return this.getInstance().getLogs(category, limit);
  },

  filterByLevel(logs: LogEntry[], level: LogLevel): LogEntry[] {
    return this.getInstance().filterByLevel(logs, level);
  },

  filterByDateRange(logs: LogEntry[], startDate: Date, endDate: Date): LogEntry[] {
    return this.getInstance().filterByDateRange(logs, startDate, endDate);
  },

  clearLogs(category: string = 'app'): boolean {
    return this.getInstance().clearLogs(category);
  },

  getLogsDirectory(): string {
    return this.getInstance().getLogsDirectory();
  },

  getLogLevel(): LogLevel {
    return this.getInstance().getLogLevel();
  },
};

/**
 * Export singleton instance
 */
export const logger = Logger.getInstance();
