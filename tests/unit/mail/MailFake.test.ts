import { MailFake } from '@/tools/mail/testing';
import { beforeEach, describe, expect, it } from 'vitest';

beforeEach(() => {
  MailFake.reset();
});

describe('MailFake', () => {
  it('saves sent messages and returns ok', async () => {
    const res = await MailFake.send({ to: 'a@b.com', subject: 's', text: 't' });
    expect(res.ok).toBe(true);
    expect(res.driver).toBe('disabled');

    const sent = MailFake.getSent();
    expect(sent.length).toBe(1);
    expect(sent[0].to).toEqual(['a@b.com']);
  });

  it('handles array of recipients and attachments', async () => {
    await MailFake.send({
      to: ['a@b.com', 'c@d.com'],
      subject: 'sub',
      text: 'txt',
      attachments: [{ filename: 'f.txt', content: Buffer.from('ok') }],
    });

    const sent = MailFake.getSent();
    expect(sent[0].to).toEqual(['a@b.com', 'c@d.com']);
    expect(sent[0].attachments?.[0].filename).toBe('f.txt');
  });

  it('assertSent passes and assertNotSent throws appropriately', async () => {
    await MailFake.send({ to: 'x@y.com', subject: 's', text: 't' });

    expect(() => MailFake.assertSent((r) => r.to.includes('x@y.com'))).not.toThrow();
    expect(() => MailFake.assertNotSent((r) => r.to.includes('x@y.com'))).toThrow();
  });

  it('assertSent throws when predicate does not match any sent mail', async () => {
    await MailFake.send({ to: 'a@b.com', subject: 's', text: 't' });
    expect(() => MailFake.assertSent((r) => r.to.includes('nope@x.com'))).toThrow();
  });
});
