import { beforeEach, describe, expect, it, vi } from 'vitest';

import FakeStorage from '@storage/testing';

function sendGridMockFactory() {
  return {
    SendGridDriver: {
      send: vi.fn(async (_config: any, message: any) => ({
        ok: true,
        provider: 'sendgrid',
        message,
      })),
    },
  };
}

describe('sendWelcomeEmail toolkit', () => {
  beforeEach(() => {
    FakeStorage.reset();
    vi.restoreAllMocks();
  });

  it('sends a welcome email with attachment read from disk', async () => {
    vi.resetModules();
    // Ensure Mail selects SendGrid driver when modules are loaded
    process.env.MAIL_DRIVER = 'sendgrid';
    process.env.SENDGRID_API_KEY = 'test-key';
    process.env.MAIL_FROM_ADDRESS = 'noreply@example.com';

    vi.mock('@mail/drivers/SendGrid', sendGridMockFactory);

    // Register SendGrid handler (Mail is registry-first)
    const { MailDriverRegistry } = await import('@mail/MailDriverRegistry');
    const { SendGridDriver } = await import('@mail/drivers/SendGrid');
    MailDriverRegistry.register('sendgrid', async (cfg, message) => {
      const apiKey = (cfg as any)?.apiKey;
      return SendGridDriver.send({ apiKey } as any, message as any);
    });

    const { sendWelcomeEmail } = await import('@app/Toolkit/Mail/sendWelcomeEmail');

    // Use actual Local storage path
    const fs = await import('fs/promises');
    const path = await import('path');
    const storagePath = path.join(process.cwd(), 'storage', 'welcome');
    await fs.mkdir(storagePath, { recursive: true });
    await fs.writeFile(path.join(storagePath, 'guide.pdf'), Buffer.from('pdf'));

    await sendWelcomeEmail('u@example.com', 'Alice', 'local', 'welcome/guide.pdf');

    const calls = (SendGridDriver.send as any).mock.calls;
    expect(calls.length).toBe(1);
    const message = calls[0][1] as any;
    expect(message.to).toBe('u@example.com');
    expect(message.attachments?.[0]?.filename).toBe('guide.pdf');
    expect(message.attachments?.[0]?.content.toString()).toBe('pdf');
  });
});
