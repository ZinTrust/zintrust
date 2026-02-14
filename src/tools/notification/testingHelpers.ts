import { Env } from '@config/env';
import { NotificationRegistry } from '@notification/Registry';
import NotificationFake from '@notification/testing';

// NOTE: This testing helper intentionally mutates runtime env values
// via Env.set() to temporarily override NOTIFICATION_DRIVER for test isolation.

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

  const fakeDriver = fake as DriverLike;
  NotificationRegistry.register(name, fakeDriver);
  const prevEnv = Env.get('NOTIFICATION_DRIVER', '');
  Env.set('NOTIFICATION_DRIVER', name);

  return {
    driverName: name,
    restore() {
      // Restore previous driver if present, otherwise keep fake registered
      if (previous === undefined) {
        NotificationRegistry.register(name, NotificationFake as unknown as DriverLike);
      } else {
        NotificationRegistry.register(name, previous);
      }

      if (prevEnv === '') Env.unset('NOTIFICATION_DRIVER');
      else Env.set('NOTIFICATION_DRIVER', prevEnv);
    },
  };
};

export default { useFakeDriver };
