import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@notification/drivers/Twilio', () => ({
  sendSms: vi.fn(async (_cfg: any, _payload: any) => ({ ok: true })),
}));

import { sendSmsNotification } from '@app/Toolkit/Notification/sendSms';
import { sendSms } from '@notification/drivers/Twilio';

describe('sendSmsNotification toolkit', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('delegates to Twilio driver with credentials and payload', async () => {
    await sendSmsNotification('AC123', 'tok', '+15551234567', '+15559876543', 'hi');

    expect((sendSms as any).mock.calls.length).toBe(1);
    const [cfg, payload] = (sendSms as any).mock.calls[0];
    expect(cfg.accountSid).toBe('AC123');
    expect(payload.to).toBe('+15559876543');
  });
});
