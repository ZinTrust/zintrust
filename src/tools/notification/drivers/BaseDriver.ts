import { ErrorFactory } from '@exceptions/ZintrustError';

export const BaseDriver = Object.freeze({
  async send(): Promise<unknown> {
    await Promise.resolve();
    throw ErrorFactory.createConfigError('Notification driver must implement send()');
  },
});

export default BaseDriver;
