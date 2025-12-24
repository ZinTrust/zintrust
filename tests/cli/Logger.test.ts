/**
 * Logger Test Suite
 * Tests for file-based logging with rotation and retention
 */

import { LogEntry, Logger, LoggerInstance } from '@cli/logger/Logger';
import { fs } from '@node-singletons';
import * as path from '@node-singletons/path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Logger Initialization and Structure', () => {
  let testLogsDir: string;
  let loggerInstance: LoggerInstance;

  beforeEach(() => {
    // Reset singleton between tests to avoid cross-test coupling
    globalThis.__loggerInstance = undefined;

    // Create temporary logs directory for testing
    testLogsDir = path.join(process.cwd(), '.test-logs');
    if (!fs.existsSync(testLogsDir)) {
      fs.mkdirSync(testLogsDir, { recursive: true });
    }

    // Initialize logger with test directory
    loggerInstance = Logger.create(testLogsDir, 1024 * 1024, 'debug');
  });

  afterEach(() => {
    // Clean up test logs directory
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true });
    }

    globalThis.__loggerInstance = undefined;
  });

  it('should create logs directory structure', () => {
    expect(fs.existsSync(testLogsDir)).toBe(true);
    // Current logger writes to category-based files in the logs dir (e.g., app.log)
  });

  it('should return logs directory path', () => {
    expect(loggerInstance.getLogsDirectory()).toBe(testLogsDir);
  });

  it('should return current log level', () => {
    expect(loggerInstance.getLogLevel()).toBe('debug');
  });

  it('should be a singleton', () => {
    const instance1 = Logger.getInstance();
    const instance2 = Logger.getInstance();

    expect(instance1).toBe(instance2);
  });
});

describe('Logger Writing Operations', () => {
  let testLogsDir: string;
  let loggerInstance: LoggerInstance;

  beforeEach(() => {
    globalThis.__loggerInstance = undefined;
    testLogsDir = path.join(process.cwd(), '.test-logs');
    if (!fs.existsSync(testLogsDir)) {
      fs.mkdirSync(testLogsDir, { recursive: true });
    }
    loggerInstance = Logger.create(testLogsDir, 1024 * 1024, 'debug');
  });

  afterEach(() => {
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true });
    }

    globalThis.__loggerInstance = undefined;
  });

  it('should write debug log entries', () => {
    loggerInstance.debug('Test debug message', { data: 'test' });

    const logFile = path.join(testLogsDir, 'app.log');

    expect(fs.existsSync(logFile)).toBe(true);
    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content).toContain('Test debug message');
    expect(content).toContain('"level":"debug"');
  });

  it('should write info log entries', () => {
    loggerInstance.info('Test info message');

    const logFile = path.join(testLogsDir, 'app.log');

    expect(fs.existsSync(logFile)).toBe(true);
    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content).toContain('Test info message');
    expect(content).toContain('"level":"info"');
  });

  it('should write warn log entries', () => {
    loggerInstance.warn('Test warning message');

    const logFile = path.join(testLogsDir, 'app.log');

    expect(fs.existsSync(logFile)).toBe(true);
    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content).toContain('Test warning message');
    expect(content).toContain('"level":"warn"');
  });
});

describe('Logger Advanced Writing', () => {
  let testLogsDir: string;
  let loggerInstance: LoggerInstance;

  beforeEach(() => {
    globalThis.__loggerInstance = undefined;
    testLogsDir = path.join(process.cwd(), '.test-logs');
    if (!fs.existsSync(testLogsDir)) {
      fs.mkdirSync(testLogsDir, { recursive: true });
    }
    loggerInstance = Logger.create(testLogsDir, 1024 * 1024, 'debug');
  });

  afterEach(() => {
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true });
    }

    globalThis.__loggerInstance = undefined;
  });

  it('should write error log entries to both app and error logs', () => {
    // Default category is 'app'
    loggerInstance.error('Test error message');
    // And errors can also be logged to a separate category file
    loggerInstance.error('Test error message', undefined, 'errors');

    const appLogFile = path.join(testLogsDir, 'app.log');
    const errorLogFile = path.join(testLogsDir, 'errors.log');

    expect(fs.existsSync(appLogFile)).toBe(true);
    expect(fs.existsSync(errorLogFile)).toBe(true);

    const appContent = fs.readFileSync(appLogFile, 'utf-8');
    const errorContent = fs.readFileSync(errorLogFile, 'utf-8');

    expect(appContent).toContain('Test error message');
    expect(appContent).toContain('"level":"error"');
    expect(errorContent).toContain('Test error message');
    expect(errorContent).toContain('"level":"error"');
  });

  it('should include timestamps in log entries', () => {
    loggerInstance.info('Test message with timestamp');

    const logFile = path.join(testLogsDir, 'app.log');
    const content = fs.readFileSync(logFile, 'utf-8');

    expect(content).toMatch(/"timestamp":"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"/);
  });
});

describe('Logger Data and Filtering', () => {
  let testLogsDir: string;
  let loggerInstance: LoggerInstance;

  beforeEach(() => {
    globalThis.__loggerInstance = undefined;
    testLogsDir = path.join(process.cwd(), '.test-logs');
    if (!fs.existsSync(testLogsDir)) {
      fs.mkdirSync(testLogsDir, { recursive: true });
    }
    loggerInstance = Logger.create(testLogsDir, 1024 * 1024, 'debug');
  });

  afterEach(() => {
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true });
    }

    globalThis.__loggerInstance = undefined;
  });

  it('should include data in log entries', () => {
    const testData = { userId: 123, action: 'login' };
    loggerInstance.info('User logged in', testData);

    const logFile = path.join(testLogsDir, 'app.log');
    const content = fs.readFileSync(logFile, 'utf-8');

    expect(content).toContain('userId');
    expect(content).toContain('123');
    expect(content).toContain('action');
    expect(content).toContain('login');
  });

  it('should respect log level filtering', () => {
    // Create logger with info level (debug messages ignored)
    const infoLogger = Logger.create(testLogsDir, 1024 * 1024, 'info');

    infoLogger.debug('This should be ignored');
    infoLogger.info('This should be logged');

    const logFile = path.join(testLogsDir, 'app.log');
    const content = fs.readFileSync(logFile, 'utf-8');

    expect(content).not.toContain('This should be ignored');
    expect(content).toContain('This should be logged');
  });
});

describe('Logger Retrieval and Filtering', () => {
  let testLogsDir: string;
  let loggerInstance: LoggerInstance;

  beforeEach(() => {
    globalThis.__loggerInstance = undefined;
    testLogsDir = path.join(process.cwd(), '.test-logs');
    if (!fs.existsSync(testLogsDir)) {
      fs.mkdirSync(testLogsDir, { recursive: true });
    }
    loggerInstance = Logger.create(testLogsDir, 1024 * 1024, 'debug');
  });

  afterEach(() => {
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true });
    }

    globalThis.__loggerInstance = undefined;
  });

  it('should retrieve recent logs', () => {
    loggerInstance.info('Log entry 1');
    loggerInstance.info('Log entry 2');
    loggerInstance.info('Log entry 3');

    const logs = loggerInstance.getLogs('app', 10);

    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((log: LogEntry) => log.message.includes('Log entry'))).toBe(true);
  });

  it('should filter logs by level', () => {
    loggerInstance.info('Info message');
    loggerInstance.warn('Warn message');
    loggerInstance.error('Error message');

    const allLogs = loggerInstance.getLogs('app', 100);
    const warnLogs = loggerInstance.filterByLevel(allLogs, 'warn');

    expect(warnLogs.length).toBeGreaterThan(0);
    expect(warnLogs.every((log: LogEntry) => log.level === 'warn')).toBe(true);
  });

  it('should clear logs', () => {
    loggerInstance.info('Message to be cleared');

    const logFile = path.join(testLogsDir, 'app.log');
    expect(fs.existsSync(logFile)).toBe(true);

    const cleared = loggerInstance.clearLogs('app');
    expect(cleared).toBe(true);
    expect(fs.existsSync(logFile)).toBe(false);
  });
});

describe('Logger Parsing and Date Filtering', () => {
  let testLogsDir: string;
  let loggerInstance: LoggerInstance;

  beforeEach(() => {
    globalThis.__loggerInstance = undefined;
    testLogsDir = path.join(process.cwd(), '.test-logs');
    if (!fs.existsSync(testLogsDir)) {
      fs.mkdirSync(testLogsDir, { recursive: true });
    }
    loggerInstance = Logger.create(testLogsDir, 1024 * 1024, 'debug');
  });

  afterEach(() => {
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true });
    }

    globalThis.__loggerInstance = undefined;
  });

  it('should parse log entries correctly', () => {
    loggerInstance.info('Test message', { key: 'value' });

    const logs = loggerInstance.getLogs('app', 1);
    expect(logs.length).toBeGreaterThan(0);

    const log = logs[0];
    expect(log.message).toContain('Test message');
    expect(log.level).toBe('info');
    expect(log.timestamp).toBeDefined();
  });

  it('should filter logs by date range', () => {
    loggerInstance.info('Log message');

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const allLogs = loggerInstance.getLogs('app', 100);
    const filteredLogs = loggerInstance.filterByDateRange(allLogs, yesterday, tomorrow);

    expect(filteredLogs.length).toBeGreaterThan(0);
  });
});
