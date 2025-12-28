import { ErrorFactory } from '@exceptions/ZintrustError';

type SentRecord = {
  provider: string;
  payload: unknown;
  config: unknown;
};

export const NotificationFake = Object.freeze({
  _sent: [] as Array<SentRecord>,

  async send(provider: string, config: unknown, payload: unknown): Promise<{ ok: boolean }> {
    this._sent.push({ provider, config, payload });
    await Promise.resolve();
    return { ok: true };
  },

  assertSent(predicate: (r: SentRecord) => boolean) {
    if (!this._sent.some(predicate))
      throw ErrorFactory.createValidationError('Expected notification to be sent');
  },

  assertNotSent(predicate: (r: SentRecord) => boolean) {
    if (this._sent.some(predicate))
      throw ErrorFactory.createValidationError('Expected notification to NOT be sent');
  },

  assertSentCount(expected: number) {
    if (this._sent.length !== expected) {
      throw ErrorFactory.createValidationError('Unexpected notification send count', {
        expected,
        actual: this._sent.length,
      });
    }
  },

  getSent(): Array<SentRecord> {
    return [...this._sent];
  },

  lastSent(): SentRecord | undefined {
    return this._sent.length > 0 ? this._sent.at(-1) : undefined;
  },

  reset() {
    this._sent.length = 0;
  },
});

export default NotificationFake;
