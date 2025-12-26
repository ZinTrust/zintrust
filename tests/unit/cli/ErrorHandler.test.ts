import { ErrorHandler } from '@/cli/ErrorHandler';
import { Logger } from '@config/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Logger
vi.mock('@config/logger', () => ({
  Logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ErrorHandler', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('should handle error and exit with code 1', () => {
    ErrorHandler.handle('Something went wrong');
    expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Something went wrong'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle Error object', () => {
    ErrorHandler.handle(new Error('Something went wrong'));
    expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Something went wrong'));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle custom exit code', () => {
    ErrorHandler.handle('Error', 5);
    expect(exitSpy).toHaveBeenCalledWith(5);
  });

  it('should not log when log parameter is false', () => {
    ErrorHandler.handle('Silent error', 1, false);
    expect(Logger.error).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should handle usage error and exit with code 2', () => {
    ErrorHandler.usageError('Invalid argument');
    expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid argument'));
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('should include command hint in usage error', () => {
    ErrorHandler.usageError('Invalid argument', 'generate');
    expect(Logger.error).toHaveBeenCalledWith(expect.stringContaining('Run: zin generate --help'));
  });

  it('should not include command hint when command is empty string', () => {
    ErrorHandler.usageError('Invalid argument', '');
    expect(Logger.error).toHaveBeenCalledWith(expect.not.stringContaining('Run: zin'));
  });

  it('should display info', () => {
    ErrorHandler.info('Info message');
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Info message'));
  });

  it('should display success', () => {
    ErrorHandler.success('Success message');
    expect(Logger.info).toHaveBeenCalledWith(expect.stringContaining('Success message'));
  });

  it('should display warning', () => {
    ErrorHandler.warn('Warning message');
    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Warning message'));
  });

  it('should display banner', () => {
    ErrorHandler.banner('1.0.0');
    expect(consoleLogSpy).toHaveBeenCalled();
    // Check for some banner content
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Framework: '));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Version:   '));
  });

  it('should fall back to defaults in banner when Env values are falsy', async () => {
    vi.resetModules();
    vi.doMock('@config/env', () => ({
      Env: {
        NODE_ENV: '',
        DB_CONNECTION: '',
      },
    }));

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { ErrorHandler: FreshErrorHandler } = await import('@/cli/ErrorHandler');
    FreshErrorHandler.banner('1.0.0');

    // Should still render banner without throwing.
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should not log debug when verbose is false', () => {
    ErrorHandler.debug('Debug message', false);
    expect(Logger.debug).not.toHaveBeenCalled();
  });

  it('should log debug when verbose is true', () => {
    ErrorHandler.debug('Debug message', true);
    expect(Logger.debug).toHaveBeenCalledWith(expect.stringContaining('Debug message'));
  });
});
