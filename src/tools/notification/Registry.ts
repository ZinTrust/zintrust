import { ErrorFactory } from '@exceptions/ZintrustError';
import { ConsoleDriver } from '@notification/drivers/Console';
import { TermiiDriver } from '@notification/drivers/Termii';

type DriverLike = {
  send(recipient: string, message: string, options?: Record<string, unknown>): Promise<unknown>;
};

const drivers = new Map<string, DriverLike>();

drivers.set('termii', TermiiDriver);
drivers.set('console', ConsoleDriver);

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
