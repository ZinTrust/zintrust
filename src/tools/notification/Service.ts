import { ErrorFactory } from '@exceptions/ZintrustError';
import { NotificationConfig } from '@notification/config';
import { NotificationRegistry } from '@notification/Registry';

export const NotificationService = Object.freeze({
  async send(recipient: string, message: string, options: Record<string, unknown> = {}) {
    if (!recipient || typeof recipient !== 'string')
      throw ErrorFactory.createValidationError('Recipient required');
    if (!message || typeof message !== 'string')
      throw ErrorFactory.createValidationError('Message required');

    const driverName = NotificationConfig.getDriver();
    const driver = NotificationRegistry.get(driverName);

    return driver.send(recipient, message, options);
  },

  listDrivers(): string[] {
    return NotificationRegistry.list();
  },
});

export default NotificationService;
