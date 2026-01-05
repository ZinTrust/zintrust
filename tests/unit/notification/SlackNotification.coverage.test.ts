import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@notification/drivers/Slack', () => {
  return {
    SlackDriver: {
      send: vi.fn(async () => ({ ok: true })),
    },
  };
});

import { SlackDriver } from '@notification/drivers/Slack';
import { SlackNotificationDriver } from '@notification/drivers/SlackNotification';

describe('SlackNotificationDriver patch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['SLACK_WEBHOOK_URL'] = 'https://example.invalid/webhook';
  });

  it('builds payload and forwards to SlackDriver', async () => {
    const res = await SlackNotificationDriver.send('ignored', 'hello', { extra: 123 });

    expect(SlackDriver.send).toHaveBeenCalledWith(
      { webhookUrl: 'https://example.invalid/webhook' },
      { text: 'hello', extra: 123 }
    );

    expect(res).toEqual({ ok: true });
  });
});
