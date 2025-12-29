import { afterEach, describe, expect, test, vi } from 'vitest';

type EnvMock = {
  getBool: (key: string, defaultValue?: boolean) => boolean;
  getInt: (key: string, defaultValue?: number) => number;
  get: (key: string, defaultValue?: string) => string;
};

type SlackPayload = {
  text?: string;
  attachments?: Array<{ color?: string; text: string }>;
};

const mockSlackDeps = async (opts: {
  enabled: boolean;
  levels?: string;
  webhookUrl?: string;
  batchWindowMs?: number;
}): Promise<{ postSpy: ReturnType<typeof vi.fn>; sendSpy: ReturnType<typeof vi.fn> }> => {
  vi.resetModules();
  vi.restoreAllMocks();

  const env: EnvMock = {
    getBool: (key, defaultValue) => {
      if (key === 'SLACK_LOG_ENABLED') return opts.enabled;
      return defaultValue ?? false;
    },
    getInt: (key, defaultValue) => {
      if (key === 'SLACK_LOG_BATCH_WINDOW_MS') return opts.batchWindowMs ?? defaultValue ?? 0;
      return defaultValue ?? 0;
    },
    get: (key, defaultValue) => {
      if (key === 'SLACK_LOG_LEVELS') return opts.levels ?? defaultValue ?? '';
      if (key === 'SLACK_LOG_WEBHOOK_URL') return opts.webhookUrl ?? defaultValue ?? '';
      return defaultValue ?? '';
    },
  };

  const sendSpy = vi.fn(async () => undefined);
  const postSpy = vi.fn((url: string, payload?: SlackPayload) => ({
    url,
    payload,
    send: sendSpy,
  }));

  vi.doMock('@config/env', () => ({ Env: Object.freeze(env) }));
  vi.doMock('@httpClient/Http', () => ({ HttpClient: Object.freeze({ post: postSpy }) }));

  return { postSpy, sendSpy };
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SlackLogger - batching and filtering (stable)', () => {
  test('does nothing when disabled', async () => {
    const { postSpy } = await mockSlackDeps({ enabled: false });
    const { SlackLogger } = await import('@config/logging/SlackLogger');

    await expect(
      SlackLogger.enqueue({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'boom',
      })
    ).resolves.toBeUndefined();

    expect(postSpy).not.toHaveBeenCalled();
  });

  test('filters by configured levels', async () => {
    const { postSpy } = await mockSlackDeps({
      enabled: true,
      levels: 'error',
      webhookUrl: 'https://hooks.slack.test/123',
      batchWindowMs: 0,
    });

    const { SlackLogger } = await import('@config/logging/SlackLogger');

    await SlackLogger.enqueue({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message: 'should not send',
    });

    expect(postSpy).not.toHaveBeenCalled();
  });

  test('swallows missing webhook URL error (best-effort)', async () => {
    const { postSpy, sendSpy } = await mockSlackDeps({
      enabled: true,
      levels: 'warn,error,fatal',
      webhookUrl: '   ',
      batchWindowMs: 0,
    });

    const { SlackLogger } = await import('@config/logging/SlackLogger');

    await expect(
      SlackLogger.enqueue({
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: 'will try to send',
      })
    ).resolves.toBeUndefined();

    expect(postSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  test('posts immediate batch and formats payload', async () => {
    const { postSpy, sendSpy } = await mockSlackDeps({
      enabled: true,
      levels: 'warn,error,fatal',
      webhookUrl: 'https://hooks.slack.test/123',
      batchWindowMs: 0,
    });

    const { SlackLogger } = await import('@config/logging/SlackLogger');

    await SlackLogger.enqueue({
      timestamp: '2025-01-01T00:00:00.000Z',
      level: 'warn',
      message: 'warn-me',
      category: 'test-cat',
      error: 'some-error',
      data: { foo: 'bar' },
    });

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);

    const args = postSpy.mock.calls[0];
    expect(args[0]).toBe('https://hooks.slack.test/123');
    expect(args[1]?.attachments?.[0]?.color).toBe('#D39E00');
    expect(args[1]?.attachments?.[0]?.text).toContain('category=test-cat');
    expect(args[1]?.attachments?.[0]?.text).toContain('*error:* some-error');
    expect(args[1]?.attachments?.[0]?.text).toContain('`{"foo":"bar"}`');
  });

  test('uses default color for info level', async () => {
    const { postSpy } = await mockSlackDeps({
      enabled: true,
      levels: 'info',
      webhookUrl: 'https://hooks.slack.test/123',
      batchWindowMs: 0,
    });

    const { SlackLogger } = await import('@config/logging/SlackLogger');

    await SlackLogger.enqueue({
      timestamp: '2025-01-01T00:00:00.000Z',
      level: 'info',
      message: 'info-msg',
    });

    const args = postSpy.mock.calls[0];
    expect(args[1]?.attachments?.[0]?.color).toBe('#439FE0');
  });

  test('dedupes identical long messages within the batch window (truncation branch)', async () => {
    vi.useFakeTimers();

    const { postSpy, sendSpy } = await mockSlackDeps({
      enabled: true,
      levels: 'warn,error,fatal',
      webhookUrl: 'https://hooks.slack.test/123',
      batchWindowMs: 5000,
    });

    const { SlackLogger } = await import('@config/logging/SlackLogger');

    const longMessage = 'x'.repeat(600);
    const ev = {
      timestamp: '2025-01-01T00:00:00.000Z',
      level: 'error' as const,
      message: longMessage,
      error: 'same',
    };

    const p1 = SlackLogger.enqueue(ev);
    const p2 = SlackLogger.enqueue(ev);

    await vi.advanceTimersByTimeAsync(6000);
    await Promise.all([p1, p2]);

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});
