import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.useRealTimers();
  delete process.env['SLACK_LOG_ENABLED'];
  delete process.env['SLACK_LOG_WEBHOOK_URL'];
  delete process.env['SLACK_LOG_LEVELS'];
  delete process.env['SLACK_LOG_BATCH_WINDOW_MS'];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SlackLogger additional branches', () => {
  it('does nothing when disabled', async () => {
    process.env['SLACK_LOG_ENABLED'] = 'false';

    const sendSpy = vi.fn(async () => undefined);
    await vi.doMock('@httpClient/Http', () => ({
      HttpClient: { post: () => ({ send: sendSpy }) },
    }));

    const { SlackLogger } = await import('@/config/logging/SlackLogger');

    await SlackLogger.enqueue({ timestamp: new Date().toISOString(), level: 'warn', message: 'm' });

    // allow scheduling to settle
    await new Promise((r) => setImmediate(r as any));

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('respects SLACK_LOG_LEVELS and dedupes identical messages', async () => {
    process.env['SLACK_LOG_ENABLED'] = 'true';
    process.env['SLACK_LOG_WEBHOOK_URL'] = 'https://hooks.slack.com/test';
    process.env['SLACK_LOG_LEVELS'] = 'info,warn';
    process.env['SLACK_LOG_BATCH_WINDOW_MS'] = '10';

    vi.useFakeTimers();

    const sendSpy = vi.fn(async () => undefined);
    await vi.doMock('@httpClient/Http', () => ({
      HttpClient: { post: () => ({ send: sendSpy }) },
    }));

    const { SlackLogger } = await import('@/config/logging/SlackLogger');

    const p1 = SlackLogger.enqueue({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'same',
      error: undefined,
    });
    const p2 = SlackLogger.enqueue({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: 'same',
      error: undefined,
    });

    // advance timers past the batching window to force a flush
    await vi.advanceTimersByTimeAsync(20);
    await Promise.all([p1, p2]);

    // only one HTTP post should have been issued due to dedupe
    expect(sendSpy).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('immediately flushes when window is zero', async () => {
    process.env['SLACK_LOG_ENABLED'] = 'true';
    process.env['SLACK_LOG_WEBHOOK_URL'] = 'https://hooks.slack.com/test';
    process.env['SLACK_LOG_BATCH_WINDOW_MS'] = '0';

    const sendSpy = vi.fn(async () => undefined);
    await vi.doMock('@httpClient/Http', () => ({
      HttpClient: { post: () => ({ send: sendSpy }) },
    }));

    const { SlackLogger } = await import('@/config/logging/SlackLogger');

    await SlackLogger.enqueue({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: 'err',
    });

    // allow immediate run to execute
    await new Promise((r) => setImmediate(r as any));

    expect(sendSpy).toHaveBeenCalled();
  });

  it('handles missing webhook by not throwing', async () => {
    process.env['SLACK_LOG_ENABLED'] = 'true';
    process.env['SLACK_LOG_WEBHOOK_URL'] = '   ';
    process.env['SLACK_LOG_BATCH_WINDOW_MS'] = '0';

    const sendSpy = vi.fn(async () => undefined);
    await vi.doMock('@httpClient/Http', () => ({
      HttpClient: { post: () => ({ send: sendSpy }) },
    }));

    const { SlackLogger } = await import('@/config/logging/SlackLogger');

    // should not throw even if sendBatch throws due to missing webhook
    await SlackLogger.enqueue({ timestamp: new Date().toISOString(), level: 'warn', message: 'x' });

    expect(sendSpy).not.toHaveBeenCalled();
  });
});
