import { ErrorFactory } from '@exceptions/ZintrustError';

export const BaseDriver = Object.freeze({
  async send(): Promise<unknown> {
    await Promise.resolve();
    throw ErrorFactory.createConfigError('Broadcast driver must implement send()');
  },
});

export default BaseDriver;
