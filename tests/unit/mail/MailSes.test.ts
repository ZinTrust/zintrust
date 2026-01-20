import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Mail (SES)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();

    process.env['MAIL_DRIVER'] = 'ses';
    process.env['MAIL_FROM_ADDRESS'] = 'no-reply@example.com';
    process.env['MAIL_FROM_NAME'] = 'ZinTrust';
    process.env['AWS_REGION'] = 'us-east-1';
    process.env['AWS_ACCESS_KEY_ID'] = 'AKIA..';
    process.env['AWS_SECRET_ACCESS_KEY'] = 'secret';
  });

  it('routes send to SesDriver when MAIL_DRIVER=ses', async () => {
    const send = vi.fn(async () => ({ ok: true as const, provider: 'ses' as const }));

    vi.doMock('@mail/drivers/Ses', () => ({
      SesDriver: { send },
      default: { send },
    }));

    const { Mail } = await import('@mail/Mail');

    const result = await Mail.send({
      to: 'user@example.com',
      subject: 'Hi',
      text: 'Hello',
    });

    expect(result.ok).toBe(true);
    expect(result.driver).toBe('ses');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
