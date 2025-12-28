import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test-first: expect a Slack webhook driver to POST JSON to the provided webhook URL

describe('SlackWebhook driver (smoke)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('posts a message to a webhook URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    (globalThis as any).fetch = fetchMock;

    // Import the driver lazily so we can implement it after the test
    const { sendSlackWebhook } = await import('@notification/drivers/Slack');

    const url = 'https://hooks.slack.com/services/T/BUCKET/KEY';
    const msg = { text: 'Hello from test' };

    await sendSlackWebhook({ webhookUrl: url }, msg as any);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, opts] = (fetchMock as any).mock.calls[0];
    expect(calledUrl).toBe(url);
    expect(opts.method).toBe('POST');
    expect(opts.headers['content-type']).toMatch(/application\/json/);
    expect(JSON.parse(opts.body)).toEqual(msg);
  });
});
