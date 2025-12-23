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
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['NODE_ENV'];
  });

  it('should log info', async () => {
    const { Logger } = await import('@/config/logger');
    Logger.info('Info message', { key: 'value' });
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Info message'),
      expect.anything()
    );
  });

  it('should log warn', async () => {
    const { Logger } = await import('@/config/logger');
    Logger.warn('Warn message');
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Warn message'),
      expect.anything()
    );
  });

  it('should log warn with object payload', async () => {
    const { Logger } = await import('@/config/logger');
    Logger.warn('Warn message', { a: 1 });
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Warn message'),
      expect.anything()
    );
  });

  it('should log error', async () => {
    const { Logger } = await import('@/config/logger');
    Logger.error('Error message', new Error('oops'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error message'), 'oops');
  });

  it('should log debug to console only in development', async () => {
    process.env['NODE_ENV'] = 'development';
    vi.resetModules();

    const { Logger } = await import('@/config/logger');
    Logger.debug('Debug message', { a: 1 });

    expect(consoleDebugSpy).toHaveBeenCalledWith(
      expect.stringContaining('Debug message'),
      expect.anything()
    );
  });

  it('should log fatal and exit in production', async () => {
    process.env['NODE_ENV'] = 'production';
    vi.resetModules();

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const { Logger } = await import('@/config/logger');

    Logger.fatal('Fatal error');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Fatal error'),
      expect.anything()
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should format fatal Error instance', async () => {
    const { Logger } = await import('@/config/logger');
    Logger.fatal('Fatal error', new Error('boom'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Fatal error'), 'boom');
  });

  describe('ScopedLogger', () => {
    it('should log with scope prefix', async () => {
      const { Logger } = await import('@/config/logger');
      const scoped = Logger.scope('MyScope');
      scoped.info('Scoped message');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MyScope] Scoped message'),
        expect.anything()
      );
    });

    it('should forward debug/warn/error/fatal through scope', async () => {
      const { Logger } = await import('@/config/logger');
      const scoped = Logger.scope('MyScope');

      scoped.debug('d');
      scoped.warn('w');
      scoped.error('e', new Error('boom'));
      scoped.fatal('f');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[MyScope] w'),
        expect.anything()
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
