import { ErrorFactory } from '@exceptions/ZintrustError';
import { ConsoleDriver } from '@notification/drivers/Console';
import { SlackNotificationDriver } from '@notification/drivers/SlackNotification';
import { TermiiDriver } from '@notification/drivers/Termii';
import { TwilioNotificationDriver } from '@notification/drivers/TwilioNotification';

type DriverLike = {
  send(recipient: string, message: string, options?: Record<string, unknown>): Promise<unknown>;
};

const drivers = new Map<string, DriverLike>();

drivers.set('termii', TermiiDriver);
drivers.set('console', ConsoleDriver);
drivers.set('slack', SlackNotificationDriver);
drivers.set('twilio', TwilioNotificationDriver);

export const NotificationRegistry = Object.freeze({
  register(name: string, driver: DriverLike) {
    drivers.set(name.toLowerCase(), driver);
  },

  get(name: string): DriverLike {
    const key = (name ?? '').toString().trim().toLowerCase();
    const drv = drivers.get(key);
    if (!drv) throw ErrorFactory.createConfigError(`Notification driver not registered: ${name}`);
    return drv;
  },

  list(): string[] {
    return Array.from(drivers.keys()).sort((a, b) => a.localeCompare(b));
  },
});

export default NotificationRegistry;
