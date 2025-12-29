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

let kvSpy: ReturnType<typeof vi.fn>;
let slackSpy: ReturnType<typeof vi.fn>;
let httpSpy: ReturnType<typeof vi.fn>;

describe('Logger Config', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();

    // Recreate spies for modules that are mocked via vi.mock() (hoisted)
    kvSpy = vi.fn();
    slackSpy = vi.fn();
    httpSpy = vi.fn();

    // Expose them on global so hoisted mock factories can call through to the current spy
    (globalThis as any).__kvSpy = kvSpy;
    (globalThis as any).__slackSpy = slackSpy;
    (globalThis as any).__httpSpy = httpSpy;

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
    delete process.env['LOG_FORMAT'];
    delete process.env['LOG_TO_FILE'];
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

    it('should enqueue to cloud loggers for error/fatal and not for info', async () => {
      vi.resetModules();

      // Use module-scoped spies recreated in beforeEach
      // Use global hooks so hoisted mock factories can reference live spies
      vi.mock('@config/logging/KvLogger', () => ({
        KvLogger: { enqueue: (...args: unknown[]) => (globalThis as any).__kvSpy?.(...args) },
      }));
      vi.mock('@config/logging/SlackLogger', () => ({
        SlackLogger: { enqueue: (...args: unknown[]) => (globalThis as any).__slackSpy?.(...args) },
      }));
      vi.mock('@config/logging/HttpLogger', () => ({
        HttpLogger: { enqueue: (...args: unknown[]) => (globalThis as any).__httpSpy?.(...args) },
      }));

      // Ensure mocks are loaded before the Logger triggers dynamic imports
      await import('@config/logging/KvLogger');
      await import('@config/logging/SlackLogger');
      await import('@config/logging/HttpLogger');

      const { Logger } = await import('@/config/logger');

      Logger.error('boom', new Error('boom'));
      // allow dynamic imports and microtasks to run
      await new Promise((r) => setTimeout(r, 50));

      expect(kvSpy).toHaveBeenCalled();
      expect(slackSpy).toHaveBeenCalled();
      expect(httpSpy).toHaveBeenCalled();

      // Warn should not call KV enqueue
      vi.resetModules();
      // Recreate spies for the new module instance
      kvSpy = vi.fn();
      slackSpy = vi.fn();
      httpSpy = vi.fn();

      (globalThis as any).__kvSpy = kvSpy;
      (globalThis as any).__slackSpy = slackSpy;
      (globalThis as any).__httpSpy = httpSpy;

      // Use global hooks so hoisted mock factories can reference live spies
      vi.mock('@config/logging/KvLogger', () => ({
        KvLogger: { enqueue: (...args: unknown[]) => (globalThis as any).__kvSpy?.(...args) },
      }));
      vi.mock('@config/logging/SlackLogger', () => ({
        SlackLogger: { enqueue: (...args: unknown[]) => (globalThis as any).__slackSpy?.(...args) },
      }));
      vi.mock('@config/logging/HttpLogger', () => ({
        HttpLogger: { enqueue: (...args: unknown[]) => (globalThis as any).__httpSpy?.(...args) },
      }));

      const { Logger: Logger2 } = await import('@/config/logger');
      Logger2.warn('warn');
      // allow dynamic imports to settle
      await new Promise((r) => setTimeout(r, 50));

      expect(kvSpy).not.toHaveBeenCalled();
      expect(slackSpy).toHaveBeenCalled();
      expect(httpSpy).toHaveBeenCalled();
    });
  });
});
