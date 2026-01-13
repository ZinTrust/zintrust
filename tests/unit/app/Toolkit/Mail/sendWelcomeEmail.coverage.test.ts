import { describe, expect, it, vi } from 'vitest';

const send = vi.fn(async () => ({ ok: true }));

vi.mock('@mail/Mail', () => ({
  Mail: {
    send,
  },
}));

describe('app/Toolkit/Mail/sendWelcomeEmail', () => {
  it('sends welcome email without attachments when inputs are blank', async () => {
    const { sendWelcomeEmail } = await import('@app/Toolkit/Mail/sendWelcomeEmail');

    await sendWelcomeEmail('a@b.com', 'Alice', '', '');

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@b.com',
        attachments: undefined,
      })
    );
  });

  it('adds attachments when disk and path provided', async () => {
    send.mockClear();
    const { sendWelcomeEmail } = await import('@app/Toolkit/Mail/sendWelcomeEmail');

    await sendWelcomeEmail('a@b.com', 'Alice', 'local', 'welcome.pdf');

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [{ disk: 'local', path: 'welcome.pdf' }],
      })
    );
  });
});
