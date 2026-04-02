import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let kvSpy: ReturnType<typeof vi.fn>;
let slackSpy: ReturnType<typeof vi.fn>;
let httpSpy: ReturnType<typeof vi.fn>;
let consoleLogSpy: ReturnType<typeof vi.spyOn>;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  delete process.env.NODE_ENV;
  delete process.env['LOG_FORMAT'];

  consoleLogSpy = vi.spyOn(globalThis.console, 'log').mockImplementation(() => undefined);
  consoleWarnSpy = vi.spyOn(globalThis.console, 'warn').mockImplementation(() => undefined);
  consoleErrorSpy = vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
  consoleDebugSpy = vi.spyOn(globalThis.console, 'debug').mockImplementation(() => undefined);

  // Recreate spies for each test so the mocked modules can reference them
  kvSpy = vi.fn();
  slackSpy = vi.fn();
  httpSpy = vi.fn();

  // Expose to global so hoisted mock factories can call them at runtime
  (globalThis as any).__kvSpy = kvSpy;
  (globalThis as any).__slackSpy = slackSpy;
  (globalThis as any).__httpSpy = httpSpy;
});

afterEach(() => {
  consoleLogSpy.mockRestore();
  consoleWarnSpy.mockRestore();
  consoleErrorSpy.mockRestore();
  consoleDebugSpy.mockRestore();
});

describe('Logger additional branches', () => {
  it('redacts custom fields from SENSITIVE_FIELDS env', async () => {
    vi.resetModules();
    const logSpy = vi.spyOn(globalThis.console, 'log').mockImplementation(() => undefined);

    vi.doMock('@config/env', () => ({
      Env: {
        LOG_LEVEL: 'debug',
        get: (key: string, fallback?: string) => {
          if (key === 'LOG_FORMAT') return 'json';
          if (key === 'SENSITIVE_FIELDS') return 'ssn,credit_card';
          return fallback ?? '';
        },
        getBool: (_key: string, fallback?: boolean) => Boolean(fallback),
      },
    }));

    const { Logger } = await import('@config/logger');
    Logger.info('custom-redaction', {
      ssn: '123-45-6789',
      credit_card: '4111111111111111',
      visible: 'ok',
    });

    const raw = (logSpy.mock.calls[0]?.[0] ?? '') as string;
    const parsed = JSON.parse(raw) as { data: Record<string, string> };

    expect(parsed.data['ssn']).toBe('[REDACTED]');
    expect(parsed.data['credit_card']).toBe('[REDACTED]');
    expect(parsed.data['visible']).toBe('ok');

    logSpy.mockRestore();
    vi.doUnmock('@config/env');
  });

  it('updates SENSITIVE_FIELDS dynamically and ignores malformed entries', async () => {
    vi.resetModules();
    const logSpy = vi.spyOn(globalThis.console, 'log').mockImplementation(() => undefined);
    let sensitiveFields = 'custom_one, invalid key, ???';

    vi.doMock('@config/env', () => ({
      Env: {
        LOG_LEVEL: 'debug',
        get: (key: string, fallback?: string) => {
          if (key === 'LOG_FORMAT') return 'json';
          if (key === 'SENSITIVE_FIELDS') return sensitiveFields;
          return fallback ?? '';
        },
        getBool: (_key: string, fallback?: boolean) => Boolean(fallback),
      },
    }));

    const { Logger } = await import('@config/logger');

    Logger.info('dynamic-redaction-1', {
      custom_one: 'secret-a',
      custom_two: 'visible-a',
      'invalid key': 'visible-invalid',
    });

    sensitiveFields = 'custom_two';

    Logger.info('dynamic-redaction-2', {
      custom_one: 'visible-b',
      custom_two: 'secret-b',
    });

    const first = JSON.parse((logSpy.mock.calls[0]?.[0] ?? '') as string) as {
      data: Record<string, string>;
    };
    const second = JSON.parse((logSpy.mock.calls[1]?.[0] ?? '') as string) as {
      data: Record<string, string>;
    };

    expect(first.data['custom_one']).toBe('[REDACTED]');
    expect(first.data['custom_two']).toBe('visible-a');
    expect(first.data['invalid key']).toBe('visible-invalid');

    expect(second.data['custom_one']).toBe('visible-b');
    expect(second.data['custom_two']).toBe('[REDACTED]');

    logSpy.mockRestore();
    vi.doUnmock('@config/env');
  });

  it('handles Env.get non-string and null values via fallback/string conversion', async () => {
    const logSpy = vi.spyOn(globalThis.console, 'log').mockImplementation(() => undefined);

    vi.resetModules();
    vi.doMock('@config/env', () => ({
      Env: {
        LOG_LEVEL: 'debug',
        get: (key: string, fallback?: string) => (key === 'LOG_FORMAT' ? 123 : fallback),
        getBool: (_key: string, fallback?: boolean) => Boolean(fallback),
      },
    }));

    const { Logger } = await import('@config/logger');
    Logger.info('coerce non-string LOG_FORMAT');

    vi.resetModules();
    vi.doMock('@config/env', () => ({
      Env: {
        LOG_LEVEL: 'debug',
        get: (_key: string, _fallback?: string) => null,
        getBool: (_key: string, fallback?: boolean) => Boolean(fallback),
      },
    }));

    const { Logger: LoggerNull } = await import('@config/logger');
    LoggerNull.info('fallback when Env.get returns null');

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
    vi.doUnmock('@config/env');
  });

  it('falls back when Env.getBool throws', async () => {
    vi.resetModules();
    const logSpy = vi.spyOn(globalThis.console, 'log').mockImplementation(() => undefined);

    vi.doMock('@config/env', () => ({
      Env: {
        LOG_LEVEL: 'debug',
        get: (_key: string, fallback?: string) => fallback ?? 'text',
        getBool: (key: string, fallback?: boolean) => {
          if (key === 'DISABLE_LOGGING') {
            throw new Error('boom');
          }
          return Boolean(fallback);
        },
      },
    }));

    const { Logger } = await import('@config/logger');
    Logger.info('getBool throw fallback');

    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
    vi.doUnmock('@config/env');
  });

  it('debug logs only in development', async () => {
    process.env.NODE_ENV = 'development';

    const debugSpy = vi.spyOn(globalThis.console, 'debug').mockImplementation(() => undefined);

    const { Logger } = await import('@config/logger');

    Logger.debug('dbg-msg', { a: 1 });

    expect(debugSpy).toHaveBeenCalled();

    debugSpy.mockRestore();
  });

  it('emitCloudLogs enqueues to Kv/Slack/Http based on level', async () => {
    // Mocks reference module-scoped spies (recreated in beforeEach)

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

    // Preload mocked modules so dynamic imports resolve immediately
    await import('@config/logging/KvLogger');
    await import('@config/logging/SlackLogger');
    await import('@config/logging/HttpLogger');

    const { Logger } = await import('@config/logger');

    Logger.error('err-level', new Error('boom'));

    // allow dynamic imports to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(kvSpy).toHaveBeenCalled();
    expect(slackSpy).toHaveBeenCalled();
    expect(httpSpy).toHaveBeenCalled();

    // Reset modules and recreate spies to ensure a fresh state for the second phase
    vi.resetModules();
    kvSpy = vi.fn();
    slackSpy = vi.fn();
    httpSpy = vi.fn();

    (globalThis as any).__kvSpy = kvSpy;
    (globalThis as any).__slackSpy = slackSpy;
    (globalThis as any).__httpSpy = httpSpy;

    // Now test warn level: should call Slack and Http but not KV
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

    const { Logger: Logger2 } = await import('@config/logger');

    Logger2.warn('warn-level');

    // allow dynamic imports to settle
    await new Promise((r) => setTimeout(r, 50));

    expect(kvSpy).not.toHaveBeenCalled();
    expect(slackSpy).toHaveBeenCalled();
    expect(httpSpy).toHaveBeenCalled();
  });

  it('dispatches sink contexts and unregisters safely', async () => {
    const logSpy = vi.spyOn(globalThis.console, 'log').mockImplementation(() => undefined);
    const sink = vi.fn();
    const throwingSink = vi.fn(() => {
      throw new Error('sink failed');
    });

    const { Logger } = await import('@config/logger');

    const removeSink = Logger.addSink(sink);
    Logger.addSink(throwingSink);

    expect(() => Logger.info('object-context', { ok: true })).not.toThrow();
    expect(() => Logger.info('undefined-context')).not.toThrow();
    expect(() => Logger.info('primitive-context', 42)).not.toThrow();

    expect(sink).toHaveBeenNthCalledWith(1, 'info', 'object-context', { ok: true });
    expect(sink).toHaveBeenNthCalledWith(2, 'info', 'undefined-context', undefined);
    expect(sink).toHaveBeenNthCalledWith(3, 'info', 'primitive-context', { value: 42 });

    removeSink();
    removeSink();

    Logger.info('after-remove', { skipped: true });

    expect(sink).toHaveBeenCalledTimes(3);
    expect(throwingSink).toHaveBeenCalledTimes(4);

    logSpy.mockRestore();
  });
});
