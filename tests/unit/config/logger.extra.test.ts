import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  env: {
    logLevel: 'debug',
    values: new Map<string, unknown>(),
    bools: new Map<string, boolean>(),
    throwingBoolKeys: new Set<string>(),
  },
  kvSpy: vi.fn(),
  slackSpy: vi.fn(),
  httpSpy: vi.fn(),
}));

vi.mock('@config/env', () => ({
  Env: {
    get LOG_LEVEL() {
      return mockState.env.logLevel;
    },
    get: (key: string, fallback?: string) => {
      if (!mockState.env.values.has(key)) {
        return fallback ?? '';
      }

      return mockState.env.values.get(key);
    },
    getBool: (key: string, fallback?: boolean) => {
      if (mockState.env.throwingBoolKeys.has(key)) {
        throw new Error('boom');
      }

      if (mockState.env.bools.has(key)) {
        return mockState.env.bools.get(key) ?? false;
      }

      return fallback ?? false;
    },
  },
}));

vi.mock('@config/logging/KvLogger', () => ({
  KvLogger: {
    enqueue: (...args: unknown[]) => mockState.kvSpy(...args),
  },
}));

vi.mock('@config/logging/SlackLogger', () => ({
  SlackLogger: {
    enqueue: (...args: unknown[]) => mockState.slackSpy(...args),
  },
}));

vi.mock('@config/logging/HttpLogger', () => ({
  HttpLogger: {
    enqueue: (...args: unknown[]) => mockState.httpSpy(...args),
  },
}));

let consoleLogSpy: ReturnType<typeof vi.spyOn>;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

const resetEnvMock = (): void => {
  mockState.env.logLevel = 'debug';
  mockState.env.values.clear();
  mockState.env.bools.clear();
  mockState.env.throwingBoolKeys.clear();
};

const setEnvValue = (key: string, value: unknown): void => {
  if (key === 'LOG_LEVEL' && typeof value === 'string') {
    mockState.env.logLevel = value;
  }

  mockState.env.values.set(key, value);
};

const loadLogger = async () => {
  const { Logger } = await import('@config/logger');
  return Logger;
};

beforeEach(() => {
  vi.resetModules();
  resetEnvMock();
  mockState.kvSpy.mockReset();
  mockState.slackSpy.mockReset();
  mockState.httpSpy.mockReset();

  delete process.env.NODE_ENV;
  delete process.env['LOG_FORMAT'];

  consoleLogSpy = vi.spyOn(globalThis.console, 'log').mockImplementation(() => undefined);
  consoleWarnSpy = vi.spyOn(globalThis.console, 'warn').mockImplementation(() => undefined);
  consoleErrorSpy = vi.spyOn(globalThis.console, 'error').mockImplementation(() => undefined);
  consoleDebugSpy = vi.spyOn(globalThis.console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
  consoleLogSpy.mockRestore();
  consoleWarnSpy.mockRestore();
  consoleErrorSpy.mockRestore();
  consoleDebugSpy.mockRestore();
});

describe('Logger additional branches', () => {
  it('redacts custom fields from SENSITIVE_FIELDS env', async () => {
    setEnvValue('LOG_FORMAT', 'json');
    setEnvValue('SENSITIVE_FIELDS', 'ssn,credit_card');

    const Logger = await loadLogger();
    Logger.info('custom-redaction', {
      ssn: '123-45-6789',
      credit_card: '4111111111111111',
      visible: 'ok',
    });

    const raw = (consoleLogSpy.mock.calls[0]?.[0] ?? '') as string;
    const parsed = JSON.parse(raw) as { data: Record<string, string> };

    expect(parsed.data['ssn']).toBe('[REDACTED]');
    expect(parsed.data['credit_card']).toBe('[REDACTED]');
    expect(parsed.data['visible']).toBe('ok');
  });

  it('updates SENSITIVE_FIELDS dynamically and ignores malformed entries', async () => {
    setEnvValue('LOG_FORMAT', 'json');
    setEnvValue('SENSITIVE_FIELDS', 'custom_one, invalid key, ???');

    const Logger = await loadLogger();

    Logger.info('dynamic-redaction-1', {
      custom_one: 'secret-a',
      custom_two: 'visible-a',
      'invalid key': 'visible-invalid',
    });

    setEnvValue('SENSITIVE_FIELDS', 'custom_two');

    Logger.info('dynamic-redaction-2', {
      custom_one: 'visible-b',
      custom_two: 'secret-b',
    });

    const first = JSON.parse((consoleLogSpy.mock.calls[0]?.[0] ?? '') as string) as {
      data: Record<string, string>;
    };
    const second = JSON.parse((consoleLogSpy.mock.calls[1]?.[0] ?? '') as string) as {
      data: Record<string, string>;
    };

    expect(first.data['custom_one']).toBe('[REDACTED]');
    expect(first.data['custom_two']).toBe('visible-a');
    expect(first.data['invalid key']).toBe('visible-invalid');
    expect(second.data['custom_one']).toBe('visible-b');
    expect(second.data['custom_two']).toBe('[REDACTED]');
  });

  it('handles Env.get non-string and null values via fallback/string conversion', async () => {
    setEnvValue('LOG_FORMAT', 123);

    const Logger = await loadLogger();
    Logger.info('coerce non-string LOG_FORMAT');

    vi.resetModules();
    resetEnvMock();
    setEnvValue('LOG_FORMAT', null);

    const LoggerNull = await loadLogger();
    LoggerNull.info('fallback when Env.get returns null');

    expect(consoleLogSpy).toHaveBeenCalledTimes(2);
  });

  it('falls back when Env.getBool throws', async () => {
    setEnvValue('LOG_FORMAT', 'text');
    mockState.env.throwingBoolKeys.add('DISABLE_LOGGING');

    const Logger = await loadLogger();
    Logger.info('getBool throw fallback');

    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('colors request log segments in text mode when LOG_COLOR is enabled', async () => {
    setEnvValue('LOG_FORMAT', 'text');
    setEnvValue('LOG_COLOR', 'always');

    const Logger = await loadLogger();

    Logger.info('[GET] /queue-monitor/api/events 200 OK (14ms) [requestId=req-123]');

    const rendered = (consoleLogSpy.mock.calls[0]?.[0] ?? '') as string;
    expect(rendered).toContain('\u001b[');
    expect(rendered).toContain('[INFO]');
    expect(rendered).toContain('[GET]');
    expect(rendered).toContain('200 OK');
    expect(rendered).toContain('(14ms)');
    expect(rendered).toContain('[requestId=req-123]');
  });

  it('colors slow and error request segments with ANSI output', async () => {
    setEnvValue('LOG_FORMAT', 'text');
    setEnvValue('LOG_COLOR', 'always');

    const Logger = await loadLogger();

    Logger.info('[POST] /jobs 500 Internal Server Error (1000ms) [requestId=req-500]');

    const rendered = (consoleLogSpy.mock.calls[0]?.[0] ?? '') as string;
    expect(rendered).toContain('\u001b[');
    expect(rendered).toContain('500 Internal Server Error');
    expect(rendered).toContain('(1000ms)');
  });

  it('uses Arctic as the default request-log theme fallback', async () => {
    setEnvValue('LOG_FORMAT', 'text');
    setEnvValue('LOG_COLOR', 'always');
    setEnvValue('LOG_COLOR_THEME', 'unknown-theme');

    const Logger = await loadLogger();

    Logger.info('[GET] /health 200 OK (14ms) [requestId=req-default]');

    const rendered = (consoleLogSpy.mock.calls[0]?.[0] ?? '') as string;
    expect(rendered).toContain('\u001b[1m\u001b[96m[INFO]\u001b[0m');
    expect(rendered).toContain('\u001b[1m\u001b[94m[GET]\u001b[0m');
    expect(rendered).toContain('\u001b[1m\u001b[97m/health\u001b[0m');
    expect(rendered).toContain('\u001b[1m\u001b[92m200 OK\u001b[0m');
    expect(rendered).toContain('\u001b[2m\u001b[97m[requestId=req-default]\u001b[0m');
  });

  it('switches request-log colors when LOG_COLOR_THEME is set', async () => {
    setEnvValue('LOG_FORMAT', 'text');
    setEnvValue('LOG_COLOR', 'always');
    setEnvValue('LOG_COLOR_THEME', 'production-safe');

    const Logger = await loadLogger();

    Logger.info('[GET] /health 200 OK (14ms) [requestId=req-production]');

    const rendered = (consoleLogSpy.mock.calls[0]?.[0] ?? '') as string;
    expect(rendered).toContain('\u001b[1m\u001b[34m[INFO]\u001b[0m');
    expect(rendered).toContain('\u001b[1m\u001b[34m[GET]\u001b[0m');
    expect(rendered).toContain('\u001b[1m\u001b[32m200 OK\u001b[0m');
  });

  it('debug logs only in development', async () => {
    process.env.NODE_ENV = 'development';

    const Logger = await loadLogger();
    Logger.debug('dbg-msg', { a: 1 });

    expect(consoleDebugSpy).toHaveBeenCalled();
  });

  it('emitCloudLogs enqueues to Kv/Slack/Http based on level', async () => {
    const Logger = await loadLogger();

    Logger.error('err-level', new Error('boom'));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockState.kvSpy).toHaveBeenCalled();
    expect(mockState.slackSpy).toHaveBeenCalled();
    expect(mockState.httpSpy).toHaveBeenCalled();

    mockState.kvSpy.mockReset();
    mockState.slackSpy.mockReset();
    mockState.httpSpy.mockReset();

    Logger.warn('warn-level');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockState.kvSpy).not.toHaveBeenCalled();
    expect(mockState.slackSpy).toHaveBeenCalled();
    expect(mockState.httpSpy).toHaveBeenCalled();
  });

  it('dispatches sink contexts and unregisters safely', async () => {
    const sink = vi.fn();
    const throwingSink = vi.fn(() => {
      throw new Error('sink failed');
    });

    const Logger = await loadLogger();

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
  });

  it('NO_COLOR suppresses ANSI colors even when LOG_COLOR is always', async () => {
    setEnvValue('LOG_FORMAT', 'text');
    setEnvValue('LOG_COLOR', 'always');
    setEnvValue('NO_COLOR', '1');

    const Logger = await loadLogger();

    Logger.info('[GET] /health 200 OK (5ms) [requestId=req-nc]');

    const rendered = (consoleLogSpy.mock.calls[0]?.[0] ?? '') as string;
    expect(rendered).not.toContain('\u001b[');
  });
});
