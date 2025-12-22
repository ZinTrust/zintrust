import { ErrorHandler, EXIT_CODES } from '@cli/ErrorHandler';
import { describe, expect, it, vi } from 'vitest';

describe('ErrorHandler', () => {
  it('should have correct exit codes', () => {
    expect(EXIT_CODES.SUCCESS).toBe(0);
    expect(EXIT_CODES.RUNTIME_ERROR).toBe(1);
    expect(EXIT_CODES.USAGE_ERROR).toBe(2);
  });

  it('should handle errors', () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    ErrorHandler.handle(new Error('Test error'), EXIT_CODES.RUNTIME_ERROR);

    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.RUNTIME_ERROR);
    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('should handle usage errors', () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    ErrorHandler.usageError('Invalid input', 'test-command');

    expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.USAGE_ERROR);
    logSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('should display info messages', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    ErrorHandler.info('Test message');

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('should display success messages', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    ErrorHandler.success('Operation completed');

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('should display warning messages', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    ErrorHandler.warn('Warning message');

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
