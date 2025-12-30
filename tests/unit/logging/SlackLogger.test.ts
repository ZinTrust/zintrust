import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

function createFetchResponse(status: number, body: string) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Map<string, string>(),
    text: async () => body,
  } as any;
}

describe('SlackLogger', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();

    process.env['SLACK_LOG_ENABLED'] = 'true';
    process.env['SLACK_LOG_WEBHOOK_URL'] = 'https://hooks.slack.test/abc';
    process.env['SLACK_LOG_LEVELS'] = 'warn,error,fatal';

    globalThis.fetch = vi.fn(async () => createFetchResponse(200, 'ok')) as any;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;

    delete process.env['SLACK_LOG_ENABLED'];
    delete process.env['SLACK_LOG_WEBHOOK_URL'];
    delete process.env['SLACK_LOG_LEVELS'];
    delete process.env['SLACK_LOG_BATCH_WINDOW_MS'];
  });

  it('posts a batched message to the webhook', async () => {
    process.env['SLACK_LOG_BATCH_WINDOW_MS'] = '0';

    const { SlackLogger } = await import('@/config/logging/SlackLogger');

    const p = SlackLogger.enqueue({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'Something failed',
      category: 'unit',
      error: 'boom',
      data: { a: 1 },
    });

    await vi.runAllTimersAsync();
    await p;

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    const [url, init] = (globalThis.fetch as any).mock.calls[0] as [string, any];
    expect(url).toBe('https://hooks.slack.test/abc');
    expect(init.method).toBe('POST');

    const payload = JSON.parse(String(init.body)) as any;
    expect(payload.attachments?.[0]?.text).toContain('Something failed');
    expect(payload.attachments?.[0]?.text).toContain('boom');
  });

  it('deduplicates identical events within a batch window', async () => {
    process.env['SLACK_LOG_BATCH_WINDOW_MS'] = '5000';

    const { SlackLogger } = await import('@/config/logging/SlackLogger');

    const e = {
      timestamp: new Date('2025-12-28T00:00:00.000Z').toISOString(),
      level: 'error' as const,
      message: 'Same error',
      error: 'boom',
    };

    SlackLogger.enqueue(e);
    SlackLogger.enqueue(e);

    await vi.advanceTimersByTimeAsync(5000);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (globalThis.fetch as any).mock.calls[0] as [string, any];
    const payload = JSON.parse(String(init.body)) as any;

    const text = String(payload.attachments?.[0]?.text ?? '');
    const occurrences = text.split('Same error').length - 1;
    expect(occurrences).toBe(1);
  });

  it('respects SLACK_LOG_LEVELS', async () => {
    process.env['SLACK_LOG_BATCH_WINDOW_MS'] = '0';
    process.env['SLACK_LOG_LEVELS'] = 'error,fatal';

    const { SlackLogger } = await import('@/config/logging/SlackLogger');

    await SlackLogger.enqueue({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message: 'Warn should not send',
    });

    await vi.runAllTimersAsync();

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
