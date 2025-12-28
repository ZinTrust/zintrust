import { describe, it, expect, vi, beforeEach } from 'vitest';

// Smoke test: Twilio SMS driver should POST form-encoded data to Twilio API using basic auth

describe('Twilio SMS driver (smoke)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('posts an sms with required fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, text: async () => '' });
    (globalThis as any).fetch = fetchMock;

    const { sendSms } = await import('@notification/drivers/Twilio');

    const cfg = { accountSid: 'AC123', authToken: 'tok', from: '+15551234567' };
    const payload = { to: '+15559876543', body: 'Hello from Twilio test' };

    await sendSms(cfg as any, payload as any);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, opts] = (fetchMock as any).mock.calls[0];
    expect(calledUrl).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`
    );
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toMatch(/^Basic /);
    expect(opts.headers['content-type']).toMatch(/application\/x-www-form-urlencoded/);
    const bodyStr =
      typeof opts.body === 'string' ? opts.body : new URLSearchParams(opts.body).toString();
    expect(bodyStr).toContain('To=%2B15559876543');
    expect(bodyStr).toContain('From=%2B15551234567');
    expect(bodyStr).toContain('Body=Hello+from+Twilio+test');
  });
});
