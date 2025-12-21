import { ErrorHandler } from '@/cli/ErrorHandler';
import { Logger } from '@config/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Logger
vi.mock('@config/logger', () => ({
  Logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe('ErrorHandler', () => {
  let exitSpy: any;
  let consoleLogSpy: any;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
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

  it('should handle usage error and exit with code 2', () => {
    ErrorHandler.usageError('Invalid argument');
    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Invalid argument'));
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('should include command hint in usage error', () => {
    ErrorHandler.usageError('Invalid argument', 'generate');
    expect(Logger.warn).toHaveBeenCalledWith(expect.stringContaining('Run: zin generate --help'));
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
});
