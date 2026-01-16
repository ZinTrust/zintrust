import { describe, expect, it, vi } from 'vitest';

describe('Logger', () => {
  it('writes JSON-formatted logs to file and redacts sensitive fields', async () => {
    vi.resetModules();

    const write = vi.fn();
    const cleanOnce = vi.fn(() => ['a.log']);

    vi.doMock('@config/logging/HttpLogger', () => ({ HttpLogger: { enqueue: () => {} } }));
    vi.doMock('@config/logging/KvLogger', () => ({ KvLogger: { enqueue: () => {} } }));
    vi.doMock('@config/logging/SlackLogger', () => ({ SlackLogger: { enqueue: () => {} } }));
    vi.doMock('@config/FileLogWriter', () => ({ FileLogWriter: { write }, cleanOnce }));
    vi.doMock('@config/app', () => ({
      appConfig: { isDevelopment: () => false, isProduction: () => false },
    }));
    vi.doMock('@config/env', () => ({
      Env: {
        get: (k: string, d?: string) => {
          if (k === 'LOG_FORMAT') return 'json';
          if (k === 'LOG_CHANNEL') return 'file';
          return d ?? '';
        },
        getBool: (_k: string, _d?: boolean) => true,
      },
    }));

    const { Logger } = await import('@config/logger');

    Logger.info('test', { password: 'secret', other: 'ok' });

    // allow async file writer promise chain to resolve
    await new Promise((r) => setTimeout(r, 50));

    expect(write).toHaveBeenCalled();
    const arg = write.mock.calls[0][0];
    expect(typeof arg).toBe('string');
    expect(arg).toContain('"password":"[REDACTED]"');
  });

  it('cleanLogsOnce returns deleted files and handles errors', async () => {
    vi.resetModules();
    const write = vi.fn();
    const cleanOnce = vi.fn(() => ['a.log', 'b.log']);
    vi.doMock('@config/logging/HttpLogger', () => ({ HttpLogger: { enqueue: () => {} } }));
    vi.doMock('@config/logging/KvLogger', () => ({ KvLogger: { enqueue: () => {} } }));
    vi.doMock('@config/logging/SlackLogger', () => ({ SlackLogger: { enqueue: () => {} } }));
    vi.doMock('@config/FileLogWriter', () => ({ FileLogWriter: { write }, cleanOnce }));
    vi.doMock('@config/app', () => ({
      appConfig: { isDevelopment: () => false, isProduction: () => false },
    }));
    vi.doMock('@config/env', () => ({
      Env: {
        get: (k: string, d?: string) => (k === 'LOG_CHANNEL' ? 'file' : (d ?? '')),
        getBool: (_k: string, _d?: boolean) => true,
      },
    }));

    const { Logger } = await import('@config/logger');

    const deleted = await Logger.cleanLogsOnce();
    expect(deleted).toEqual(['a.log', 'b.log']);
  });

  it('fatal calls process.exit in production', async () => {
    vi.resetModules();
    const kvEnq = vi.fn();
    const slackEnq = vi.fn();
    const httpEnq = vi.fn();

    vi.doMock('@config/logging/KvLogger', () => ({ KvLogger: { enqueue: kvEnq } }));
    vi.doMock('@config/logging/SlackLogger', () => ({ SlackLogger: { enqueue: slackEnq } }));
    vi.doMock('@config/logging/HttpLogger', () => ({ HttpLogger: { enqueue: httpEnq } }));
    vi.doMock('@config/app', () => ({
      appConfig: { isDevelopment: () => false, isProduction: () => true },
    }));
    vi.doMock('@config/env', () => ({
      Env: {
        get: (_k: string, d?: string) => d ?? '',
        getBool: (_k: string, _d?: boolean) => false,
      },
    }));

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error('exit ' + String(code));
    }) as any);

    const { Logger } = await import('@config/logger');

    try {
      Logger.fatal('boom', new Error('fail'));
      // allow async emitCloudLogs to run
      await new Promise((r) => setTimeout(r, 20));
    } catch (e: any) {
      expect(e.message).toContain('exit 1');
    }

    expect(exitSpy).toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});
