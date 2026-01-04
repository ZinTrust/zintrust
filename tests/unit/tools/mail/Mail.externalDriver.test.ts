import { describe, expect, it, vi } from 'vitest';

describe('Mail external drivers', () => {
  it('uses MailDriverRegistry when driver is not built-in and maps messageId safely', async () => {
    vi.resetModules();

    const prev = { ...process.env };

    try {
      process.env['MAIL_DRIVER'] = 'nodemailer';
      process.env['MAIL_FROM_ADDRESS'] = 'from@example.com';
      process.env['MAIL_FROM_NAME'] = 'From';
      process.env['MAIL_HOST'] = 'smtp.local';
      process.env['MAIL_PORT'] = '587';
      process.env['MAIL_USERNAME'] = 'user';
      process.env['MAIL_PASSWORD'] = 'pass';
      process.env['MAIL_SECURE'] = 'false';

      // Keep storage import safe (no attachments in this test).
      vi.doMock('@storage', () => ({ Storage: { getDisk: vi.fn() } }));

      const { MailDriverRegistry } = await import('@tools/mail/MailDriverRegistry');
      const handler = vi.fn(async () => ({ ok: true, messageId: 'nm-1' }));
      MailDriverRegistry.register('nodemailer', handler);

      const { Mail } = await import('@tools/mail/Mail');

      const res = await Mail.send({ to: 'a@b.com', subject: 's', text: 't' });
      expect(res.ok).toBe(true);
      expect(res.driver).toBe('nodemailer');
      expect(res.messageId).toBe('nm-1');
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      process.env = prev;
    }
  });
});
