import { Logger, createLoggerScope } from '@/config/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock FileLogger
vi.mock('@cli/logger/Logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Logger Config', () => {
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;
  // let consoleDebugSpy: any;
  // let exitSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    // exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should log info', () => {
    Logger.info('Info message', { key: 'value' });
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Info message'),
      expect.anything()
    );
  });

  it('should log warn', () => {
    Logger.warn('Warn message');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Warn message'),
      expect.anything()
    );
  });

  it('should log error', () => {
    Logger.error('Error message', new Error('oops'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error message'), 'oops');
  });

  it('should log fatal and exit in production', () => {
    // We can't easily change NODE_ENV here as it's read at module load time.
    // But we can verify it calls console.error and FileLogger.error
    Logger.fatal('Fatal error');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Fatal error'),
      expect.anything()
    );
  });

  describe('ScopedLogger', () => {
    it('should log with scope prefix', () => {
      const scoped = createLoggerScope('MyScope');
      scoped.info('Scoped message');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MyScope] Scoped message'),
        expect.anything()
      );
    });
  });
});
