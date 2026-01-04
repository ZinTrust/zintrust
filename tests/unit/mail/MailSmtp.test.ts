import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Mail (SMTP)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();

    process.env['MAIL_DRIVER'] = 'smtp';
    process.env['MAIL_HOST'] = 'smtp.example.com';
    process.env['MAIL_PORT'] = '587';
    process.env['MAIL_USERNAME'] = 'user';
    process.env['MAIL_PASSWORD'] = 'pass';
    process.env['MAIL_SECURE'] = 'false';
    process.env['MAIL_FROM_ADDRESS'] = 'no-reply@example.com';
    process.env['MAIL_FROM_NAME'] = 'Zintrust';
  });

  it('passes secure=false to SMTP driver when MAIL_SECURE=false', async () => {
    process.env['MAIL_SECURE'] = 'false';

    const send = vi.fn(async (config: { secure?: unknown }, _message: unknown) => ({
      ok: true as const,
      provider: 'smtp' as const,
      config,
    }));
    vi.doMock('@mail/drivers/Smtp', () => ({
      SmtpDriver: { send },
      default: { send },
    }));

    const { MailDriverRegistry } = await import('@mail/MailDriverRegistry');
    const { SmtpDriver } = await import('@mail/drivers/Smtp');
    MailDriverRegistry.register('smtp', async (cfg, message) => {
      const { driver: _d, ...rest } = (cfg as any) ?? {};
      return SmtpDriver.send(rest as any, message as any);
    });

    const { Mail } = await import('@mail/Mail');
    await Mail.send({ to: 'user@example.com', subject: 'Hello', text: 'Plain text' });

    expect(send).toHaveBeenCalledTimes(1);
    const firstCall = send.mock.calls[0];
    expect(firstCall?.[0]?.secure).toBe(false);
  });

  it('passes secure=true to SMTP driver when MAIL_SECURE=true', async () => {
    process.env['MAIL_SECURE'] = 'true';

    const send = vi.fn(async (config: { secure?: unknown }, _message: unknown) => ({
      ok: true as const,
      provider: 'smtp' as const,
      config,
    }));
    vi.doMock('@mail/drivers/Smtp', () => ({
      SmtpDriver: { send },
      default: { send },
    }));

    const { MailDriverRegistry } = await import('@mail/MailDriverRegistry');
    const { SmtpDriver } = await import('@mail/drivers/Smtp');
    MailDriverRegistry.register('smtp', async (cfg, message) => {
      const { driver: _d, ...rest } = (cfg as any) ?? {};
      return SmtpDriver.send(rest as any, message as any);
    });

    const { Mail } = await import('@mail/Mail');
    await Mail.send({ to: 'user@example.com', subject: 'Hello', text: 'Plain text' });

    expect(send).toHaveBeenCalledTimes(1);
    const firstCall = send.mock.calls[0];
    expect(firstCall?.[0]?.secure).toBe(true);
  });

  it("passes secure='starttls' to SMTP driver when MAIL_SECURE=starttls", async () => {
    process.env['MAIL_SECURE'] = 'starttls';

    const send = vi.fn(async (config: { secure?: unknown }, _message: unknown) => ({
      ok: true as const,
      provider: 'smtp' as const,
      config,
    }));
    vi.doMock('@mail/drivers/Smtp', () => ({
      SmtpDriver: { send },
      default: { send },
    }));

    const { MailDriverRegistry } = await import('@mail/MailDriverRegistry');
    const { SmtpDriver } = await import('@mail/drivers/Smtp');
    MailDriverRegistry.register('smtp', async (cfg, message) => {
      const { driver: _d, ...rest } = (cfg as any) ?? {};
      return SmtpDriver.send(rest as any, message as any);
    });

    const { Mail } = await import('@mail/Mail');
    await Mail.send({ to: 'user@example.com', subject: 'Hello', text: 'Plain text' });

    expect(send).toHaveBeenCalledTimes(1);
    const firstCall = send.mock.calls[0];
    expect(firstCall?.[0]?.secure).toBe('starttls');
  });
});
