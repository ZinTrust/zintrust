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

const fsMocks = {
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn().mockReturnValue({ size: 0, mtime: new Date() }),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
};

vi.mock('@node-singletons/fs', () => fsMocks);
vi.mock('@node-singletons/path', () => ({
  join: (...parts: string[]) => parts.join('/'),
}));

describe('Logger Config', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();

    fsMocks.existsSync.mockReset();
    fsMocks.mkdirSync.mockReset();
    fsMocks.appendFileSync.mockReset();
    fsMocks.readdirSync.mockReset();
    fsMocks.statSync.mockReset();
    fsMocks.renameSync.mockReset();
    fsMocks.unlinkSync.mockReset();

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NODE_ENV;
    delete process.env.LOG_FORMAT;
    delete process.env.LOG_TO_FILE;
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

  describe('JSON logging', () => {
    it('should emit valid JSON with redaction', async () => {
      process.env['LOG_FORMAT'] = 'json';
      vi.resetModules();

      const { Logger } = await import('@/config/logger');
      Logger.info('Hello', { password: 'secret', nested: { token: 'abc' }, ok: true });

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.any(String));
      const raw = (consoleLogSpy.mock.calls[0]?.[0] ?? '') as string;
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      expect(parsed['level']).toBe('info');
      expect(parsed['message']).toBe('Hello');

      const data = parsed['data'] as any;
      expect(data.password).toBe('[REDACTED]');
      expect(data.nested.token).toBe('[REDACTED]');
      expect(data.ok).toBe(true);
    });

    it('should handle circular data without crashing', async () => {
      process.env['LOG_FORMAT'] = 'json';
      vi.resetModules();

      const { Logger } = await import('@/config/logger');

      const payload: any = { a: 1 };
      payload.self = payload;

      Logger.info('Circular', payload);

      const raw = (consoleLogSpy.mock.calls[0]?.[0] ?? '') as string;
      const parsed = JSON.parse(raw) as any;
      expect(parsed.data.self).toBe('[Circular]');
    });
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
