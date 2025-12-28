import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Slack driver before importing the toolkit
vi.mock('@notification/drivers/Slack', () => ({
  sendSlackWebhook: vi.fn(async (_cfg: any, _payload: any) => ({ ok: true })),
}));

import { sendSlackNotification } from '@app/Toolkit/Notification/sendSlackNotification';
import { sendSlackWebhook } from '@notification/drivers/Slack';

describe('sendSlackNotification toolkit', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('delegates to Slack driver with webhook and message', async () => {
    const url = 'https://hooks.slack.com/services/T/BUCKET/KEY';
    const msg = { text: 'Hello from toolkit' };

    await sendSlackNotification(url, msg);

    expect((sendSlackWebhook as any).mock.calls.length).toBe(1);
    const [cfg, payload] = (sendSlackWebhook as any).mock.calls[0];
    expect(cfg.webhookUrl).toBe(url);
    expect(payload).toEqual(msg);
  });
});
