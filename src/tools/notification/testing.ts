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

  reset() {
    this._sent.length = 0;
  },
});

export default NotificationFake;
