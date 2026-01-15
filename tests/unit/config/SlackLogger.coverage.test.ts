import { describe, expect, it, vi } from 'vitest';

describe('SlackLogger coverage', () => {
  it('sends a batch when enabled', async () => {
    process.env.SLACK_LOG_ENABLED = 'true';
    process.env.SLACK_LOG_WEBHOOK_URL = 'https://hooks.example.com';
    process.env.SLACK_LOG_LEVELS = 'warn';
    process.env.SLACK_LOG_BATCH_WINDOW_MS = '0';

    const send = vi.fn().mockResolvedValue(undefined);
    const post = vi.fn(() => ({ send }));

    vi.doMock('@httpClient/Http', () => ({
      HttpClient: { post },
    }));

    const { SlackLogger } = await import('@config/logging/SlackLogger');

    await SlackLogger.enqueue({
      timestamp: new Date().toISOString(),
      level: 'warn',
      message: 'warned',
    });

    expect(post).toHaveBeenCalled();
    expect(send).toHaveBeenCalled();
  });
});
