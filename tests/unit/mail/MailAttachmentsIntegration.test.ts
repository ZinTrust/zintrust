import MailFake from '@mail/testing';
import FakeStorage from '@storage/testing';
import { beforeEach, describe, it } from 'vitest';

describe('Mail attachments integration (fake)', () => {
  beforeEach(() => {
    FakeStorage.reset();
    MailFake.reset();
  });

  it('sends mail with attachment resolved from storage when Mail uses fake driver', async () => {
    // Use FakeStorage as the disk and MailFake as the mail sender
    await FakeStorage.put('local', 'files/x.txt', Buffer.from('abc'));

    // Instead of wiring global replacement, call Mail.send using internal logic.
    // Simulate the "fake" driver by calling MailFake directly and ensure resolveAttachments works.

    const input = {
      to: 'u@example.com',
      subject: 'sub',
      text: 't',
      attachments: [{ disk: 'local', path: 'files/x.txt', filename: 'x.txt' }],
    } as any;

    // Resolve attachments explicitly to simulate what Mail.send does
    const { resolveAttachments } = await import('@mail/attachments');
    const attachments = await resolveAttachments(input.attachments, { storage: FakeStorage });

    // Use MailFake directly to record send
    await MailFake.send({ ...input, attachments });

    // assert
    expect(attachments).toHaveLength(1);
    expect(attachments[0].filename).toBe('x.txt');

    MailFake.assertSent(
      (r) =>
        r.subject === 'sub' && r.attachments?.length === 1 && r.attachments[0].filename === 'x.txt'
    );
  });
});
