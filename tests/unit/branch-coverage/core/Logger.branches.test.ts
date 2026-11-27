/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Logger,
  cleanLogsOnce,
  shouldSkipTraceLogContext,
  withTraceSkipContext,
} from '@config/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
  bools: new Map<string, boolean>(),
  logLevel: 'debug',
  omitGet: false,
  omitGetBool: false,
  production: false,
  fileWrite: vi.fn(() => true),
  fileWriteIsFunction: true,
  switchFormatAfter: -1,
  logFormatCalls: 0,
  kv: vi.fn(),
  slack: vi.fn(),
  http: vi.fn(),
}));

function makeEnv(): Record<string, unknown> {
  const env: Record<string, unknown> = {
    get LOG_LEVEL() {
      return mockState.logLevel;
    },
    getBool: (key: string, fallback?: boolean) => mockState.bools.get(key) ?? fallback ?? false,
    get: (key: string, fallback?: string) => {
      if (!mockState.values.has(key)) return fallback ?? '';
      if (key === 'LOG_FORMAT' && mockState.switchFormatAfter >= 0) {
        mockState.logFormatCalls += 1;
        if (mockState.logFormatCalls > mockState.switchFormatAfter) return 'json';
      }
      return mockState.values.get(key);
    },
  };

  if (mockState.omitGet) delete env['get'];
  if (mockState.omitGetBool) delete env['getBool'];
  return env;
}

vi.mock('@config/env', () => ({ Env: makeEnv() }));
vi.mock('@config/app', () => ({
  appConfig: {
    isProduction: () => mockState.production,
  },
}));
vi.mock('@config/FileLogWriter.js', () => ({
  FileLogWriter: {
    get write() {
      return mockState.fileWriteIsFunction ? mockState.fileWrite : 42;
    },
  },
  cleanOnce: () => ['old.log'],
}));
vi.mock('@config/logging/KvLogger', () => ({ KvLogger: { enqueue: mockState.kv } }));
vi.mock('@config/logging/SlackLogger', () => ({ SlackLogger: { enqueue: mockState.slack } }));
vi.mock('@config/logging/HttpLogger', () => ({ HttpLogger: { enqueue: mockState.http } }));

let consoleLogSpy: ReturnType<typeof vi.spyOn>;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

const setEnv = (key: string, value: unknown): void => {
  mockState.values.set(key, value);
};

const loadLogger = async () => {
  await import('@config/env');
  return import('@config/logger');
};

describe('Logger uncovered branches', () => {
  beforeEach(() => {
    mockState.values.clear();
    mockState.bools.clear();
    mockState.logLevel = 'debug';
    mockState.omitGet = false;
    mockState.omitGetBool = false;
    mockState.production = false;
    mockState.fileWriteIsFunction = true;
    mockState.switchFormatAfter = -1;
    mockState.logFormatCalls = 0;
    mockState.fileWrite.mockClear();
    mockState.kv.mockClear();
    mockState.slack.mockClear();
    mockState.http.mockClear();

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  it('falls back when Env.get and Env.getBool are unavailable', async () => {
    await loadLogger();
    const env = (await import('@config/env')).Env as any;
    const savedGet = env.get;
    const savedGetBool = env.getBool;
    delete env.get;
    delete env.getBool;

    try {
      Logger.info('missing-env-helpers');
    } finally {
      env.get = savedGet;
      env.getBool = savedGetBool;
    }
    expect(consoleLogSpy).toHaveBeenCalled();
  });

  it('uses explicit color values and rainbow status/duration buckets', async () => {
    setEnv('LOG_FORMAT', 'text');
    setEnv('LOG_COLOR', 'on');
    await loadLogger();

    Logger.info('[TRACE] /unknown 302 Found (60ms)');
    Logger.info('[GET] /teapot 419 Timeout (120ms)');
    Logger.info('[GET] /server 500 Error (300ms)');
    Logger.info('[GET] /ok 201 Created (40ms)');
    Logger.info('[GET] /missing 404 Missing (1000ms)');

    expect(consoleLogSpy).toHaveBeenCalledTimes(5);
    const lines = consoleLogSpy.mock.calls.map((call: any) => String(call[0]));
    expect(lines[0]).toContain('\u001b[');
    expect(lines.some((line: any) => line.includes('419 Timeout'))).toBe(true);
  });

  it('colorizes plain text that does not start with the level token', async () => {
    setEnv('LOG_FORMAT', 'text');
    setEnv('LOG_COLOR', 'always');
    await loadLogger();

    Logger.warn('plain warning message');
    expect(String(consoleWarnSpy.mock.calls[0]?.[0])).toContain('\u001b[');
  });

  it('handles a request log without a trailing metadata segment', async () => {
    setEnv('LOG_FORMAT', 'text');
    setEnv('LOG_COLOR', 'always');
    await loadLogger();

    Logger.info('[GET] /no-meta 200 OK (10ms)');
    expect(String(consoleLogSpy.mock.calls[0]?.[0])).toContain('/no-meta');
  });

  it('respects warn and error levels and logs symbol/function errors', async () => {
    setEnv('LOG_FORMAT', 'json');
    setEnv('LOG_LEVEL', 'warn');
    await loadLogger();

    Logger.debug('suppressed');
    Logger.warn('warned');
    Logger.error('symbol-error', Symbol('s'));
    Logger.error('function-error', () => undefined);
    Logger.error('number-error', 42);
    Logger.error('boolean-error', false);
    Logger.error('object-error', { a: 1 });

    expect(consoleDebugSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  it('uses json output for every level and avoids process.exit outside production', async () => {
    setEnv('LOG_FORMAT', 'json');
    setEnv('LOG_LEVEL', 'debug');
    await loadLogger();

    Logger.debug('dbg');
    Logger.info('inf');
    Logger.warn('wrn');
    Logger.error('err');
    Logger.fatal('ftl');

    for (const spy of [consoleDebugSpy, consoleLogSpy, consoleWarnSpy, consoleErrorSpy]) {
      expect(spy).toHaveBeenCalled();
      expect(() => JSON.parse(String(spy.mock.calls[0]?.[0]))).not.toThrow();
    }
  });

  it('short-circuits colorization when LOG_FORMAT is json', async () => {
    setEnv('LOG_FORMAT', 'text');
    setEnv('LOG_COLOR', 'always');
    mockState.switchFormatAfter = 2;
    await loadLogger();

    Logger.info('late-format-switch [GET] /health 200 OK (5ms)');

    expect(mockState.logFormatCalls).toBeGreaterThan(2);
    expect(String(consoleLogSpy.mock.calls[0]?.[0])).not.toContain('\u001b[');
  });

  it('redacts circular arrays and handles file writer fallbacks', async () => {
    setEnv('LOG_FORMAT', 'text');
    setEnv('LOG_TO_FILE', 'true');
    await loadLogger();

    const circular: unknown[] = [];
    circular.push(circular);
    Logger.info('circular', circular);
    Logger.info('second-file-log');
    await Promise.resolve();

    expect(String(consoleLogSpy.mock.calls[0]?.[0])).toContain('circular');
    expect(consoleLogSpy).toHaveBeenCalledTimes(2);
  });

  it('handles a file writer without a callable write method', async () => {
    mockState.fileWriteIsFunction = false;
    setEnv('LOG_FORMAT', 'text');
    setEnv('LOG_CHANNEL', 'file');
    await loadLogger();

    expect(() => Logger.info('non-callable-writer')).not.toThrow();
    expect(() => Logger.info('non-callable-writer-2')).not.toThrow();
  });

  it('skips log file cleanup when logging is disabled', async () => {
    mockState.bools.set('DISABLE_LOGGING', true);
    await loadLogger();

    expect(await cleanLogsOnce()).toEqual([]);
    expect(Logger.debug('disabled')).toBeUndefined();
    expect(shouldSkipTraceLogContext(withTraceSkipContext())).toBe(true);
    expect(
      shouldSkipTraceLogContext(withTraceSkipContext({ requestId: 'r' }))
    ).toBe(true);
  });
});
