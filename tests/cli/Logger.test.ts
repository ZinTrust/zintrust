/**
 * Logger Test Suite
 * Tests for file-based logging with rotation and retention
 */

import { LogEntry, Logger, LoggerInstance } from '@cli/logger/Logger';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('Logger Initialization and Structure', () => {
  let testLogsDir: string;
  let loggerInstance: LoggerInstance;

  beforeEach(() => {
    // Create temporary logs directory for testing
    testLogsDir = path.join(process.cwd(), '.test-logs');
    if (!fs.existsSync(testLogsDir)) {
      fs.mkdirSync(testLogsDir, { recursive: true });
    }

    // Initialize logger with test directory
    loggerInstance = Logger.initialize(testLogsDir, 1024 * 1024, 30, 'debug');
  });

  afterEach(() => {
    // Clean up test logs directory
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true });
    }
  });

  it('should create logs directory structure', () => {
    expect(fs.existsSync(testLogsDir)).toBe(true);
    expect(fs.existsSync(path.join(testLogsDir, 'cli'))).toBe(true);
    expect(fs.existsSync(path.join(testLogsDir, 'app'))).toBe(true);
    expect(fs.existsSync(path.join(testLogsDir, 'errors'))).toBe(true);
    expect(fs.existsSync(path.join(testLogsDir, 'migrations'))).toBe(true);
    expect(fs.existsSync(path.join(testLogsDir, 'debug'))).toBe(true);
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
    testLogsDir = path.join(process.cwd(), '.test-logs');
    if (!fs.existsSync(testLogsDir)) {
      fs.mkdirSync(testLogsDir, { recursive: true });
    }
    loggerInstance = Logger.initialize(testLogsDir, 1024 * 1024, 30, 'debug');
  });

  afterEach(() => {
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true });
    }
  });

  it('should write debug log entries', () => {
    loggerInstance.debug('Test debug message', { data: 'test' });

    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(testLogsDir, 'app', `${today}.log`);

    expect(fs.existsSync(logFile)).toBe(true);
    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content).toContain('Test debug message');
    expect(content).toContain('[DEBUG]');
  });

  it('should write info log entries', () => {
    loggerInstance.info('Test info message');

    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(testLogsDir, 'app', `${today}.log`);

    expect(fs.existsSync(logFile)).toBe(true);
    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content).toContain('Test info message');
    expect(content).toContain('[INFO]');
  });

  it('should write warn log entries', () => {
    loggerInstance.warn('Test warning message');

    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(testLogsDir, 'app', `${today}.log`);

    expect(fs.existsSync(logFile)).toBe(true);
    const content = fs.readFileSync(logFile, 'utf-8');
    expect(content).toContain('Test warning message');
    expect(content).toContain('[WARN]');
  });
});

describe('Logger Advanced Writing', () => {
  let testLogsDir: string;
  let loggerInstance: LoggerInstance;

  beforeEach(() => {
    testLogsDir = path.join(process.cwd(), '.test-logs');
    if (!fs.existsSync(testLogsDir)) {
      fs.mkdirSync(testLogsDir, { recursive: true });
    }
    loggerInstance = Logger.initialize(testLogsDir, 1024 * 1024, 30, 'debug');
  });

  afterEach(() => {
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true });
    }
  });

  it('should write error log entries to both app and error logs', () => {
    loggerInstance.error('Test error message');

    const today = new Date().toISOString().split('T')[0];
    const appLogFile = path.join(testLogsDir, 'app', `${today}.log`);
    const errorLogFile = path.join(testLogsDir, 'errors', `${today}.log`);

    expect(fs.existsSync(appLogFile)).toBe(true);
    expect(fs.existsSync(errorLogFile)).toBe(true);

    const appContent = fs.readFileSync(appLogFile, 'utf-8');
    const errorContent = fs.readFileSync(errorLogFile, 'utf-8');

    expect(appContent).toContain('Test error message');
    expect(errorContent).toContain('Test error message');
  });

  it('should include timestamps in log entries', () => {
    loggerInstance.info('Test message with timestamp');

    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(testLogsDir, 'app', `${today}.log`);
    const content = fs.readFileSync(logFile, 'utf-8');

    expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
  });
});

describe('Logger Data and Filtering', () => {
  let testLogsDir: string;
  let loggerInstance: LoggerInstance;

  beforeEach(() => {
    testLogsDir = path.join(process.cwd(), '.test-logs');
    if (!fs.existsSync(testLogsDir)) {
      fs.mkdirSync(testLogsDir, { recursive: true });
    }
    loggerInstance = Logger.initialize(testLogsDir, 1024 * 1024, 30, 'debug');
  });

  afterEach(() => {
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true });
    }
  });

  it('should include data in log entries', () => {
    const testData = { userId: 123, action: 'login' };
    loggerInstance.info('User logged in', testData);

    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(testLogsDir, 'app', `${today}.log`);
    const content = fs.readFileSync(logFile, 'utf-8');

    expect(content).toContain('userId');
    expect(content).toContain('123');
    expect(content).toContain('action');
    expect(content).toContain('login');
  });

  it('should respect log level filtering', () => {
    // Create logger with info level (debug messages ignored)
    const infoLogger = Logger.initialize(testLogsDir, 1024 * 1024, 30, 'info');

    infoLogger.debug('This should be ignored');
    infoLogger.info('This should be logged');

    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(testLogsDir, 'app', `${today}.log`);
    const content = fs.readFileSync(logFile, 'utf-8');

    expect(content).not.toContain('This should be ignored');
    expect(content).toContain('This should be logged');
  });
});

describe('Logger Retrieval and Filtering', () => {
  let testLogsDir: string;
  let loggerInstance: LoggerInstance;

  beforeEach(() => {
    testLogsDir = path.join(process.cwd(), '.test-logs');
    if (!fs.existsSync(testLogsDir)) {
      fs.mkdirSync(testLogsDir, { recursive: true });
    }
    loggerInstance = Logger.initialize(testLogsDir, 1024 * 1024, 30, 'debug');
  });

  afterEach(() => {
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true });
    }
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

    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(testLogsDir, 'app', `${today}.log`);
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
    testLogsDir = path.join(process.cwd(), '.test-logs');
    if (!fs.existsSync(testLogsDir)) {
      fs.mkdirSync(testLogsDir, { recursive: true });
    }
    loggerInstance = Logger.initialize(testLogsDir, 1024 * 1024, 30, 'debug');
  });

  afterEach(() => {
    if (fs.existsSync(testLogsDir)) {
      fs.rmSync(testLogsDir, { recursive: true });
    }
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
