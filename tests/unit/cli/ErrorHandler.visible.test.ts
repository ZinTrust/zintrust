import { ErrorHandler } from '@/cli/ErrorHandler';
import { Logger } from '@config/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ErrorHandler.visible', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('prints info directly to console without going through Logger', () => {
    ErrorHandler.visible.info('No pending trace migrations.');

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('No pending trace migrations.')
    );
    expect(Logger.info).not.toHaveBeenCalled();
  });

  it('prints success directly to console without going through Logger', () => {
    ErrorHandler.visible.success('Trace migrations applied.');

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Trace migrations applied.')
    );
    expect(Logger.info).not.toHaveBeenCalled();
  });

  it('prints warnings to stderr without going through Logger', () => {
    ErrorHandler.visible.warn('Cancelled.');

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Cancelled.'));
    expect(Logger.warn).not.toHaveBeenCalled();
  });
});
