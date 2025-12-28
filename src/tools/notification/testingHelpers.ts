import { NotificationRegistry } from '@notification/Registry';
import NotificationFake from '@notification/testing';

type DriverLike = {
  send(recipient: string, message: string, options?: Record<string, unknown>): Promise<unknown>;
};

export const useFakeDriver = (
  name = 'notification-fake',
  fake: unknown = NotificationFake
): { driverName: string; restore: () => void } => {
  let previous: DriverLike | undefined;
  try {
    previous = NotificationRegistry.get(name) as DriverLike;
  } catch {
    previous = undefined;
  }

  const fakeDriver = fake as unknown as DriverLike;
  NotificationRegistry.register(name, fakeDriver);
  const prevEnv = process.env['NOTIFICATION_DRIVER'];
  process.env['NOTIFICATION_DRIVER'] = name;

  return {
    driverName: name,
    restore() {
      // Restore previous driver if present, otherwise keep fake registered
      if (previous === undefined) {
        NotificationRegistry.register(name, NotificationFake as unknown as DriverLike);
      } else {
        NotificationRegistry.register(name, previous as DriverLike);
      }

      if (prevEnv === undefined) delete process.env['NOTIFICATION_DRIVER'];
      else process.env['NOTIFICATION_DRIVER'] = prevEnv;
    },
  };
};

export default { useFakeDriver };
