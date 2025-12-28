import { ErrorFactory } from '@exceptions/ZintrustError';

type SentRecord = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  from?: { address?: string; name?: string };
  attachments?: Array<{ filename: string; content: Buffer }>;
};

type FakeSendInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  from?: { address?: string; name?: string };
  attachments?: Array<{ filename: string; content: Buffer }>;
};

export const MailFake = Object.freeze({
  _sent: [] as Array<SentRecord>,

  async send(input: FakeSendInput): Promise<{ ok: boolean; driver: string }> {
    const to = Array.isArray(input.to) ? input.to : [input.to];
    this._sent.push({
      to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      from: input.from,
      attachments: input.attachments,
    });
    await Promise.resolve();
    return { ok: true, driver: 'disabled' };
  },

  assertSent(predicate: (r: SentRecord) => boolean) {
    if (!this._sent.some(predicate)) {
      throw ErrorFactory.createValidationError('Expected a sent mail matching predicate');
    }
  },

  assertNotSent(predicate: (r: SentRecord) => boolean) {
    if (this._sent.some(predicate)) {
      throw ErrorFactory.createValidationError('Expected no sent mail matching predicate');
    }
  },

  getSent() {
    return this._sent.slice();
  },

  reset() {
    this._sent.length = 0;
  },
});

export default MailFake;
