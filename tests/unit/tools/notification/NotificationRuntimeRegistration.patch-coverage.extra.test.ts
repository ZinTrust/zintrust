import { describe, expect, it } from 'vitest';

import { NotificationChannelRegistry } from '@notification/NotificationChannelRegistry';
import { registerNotificationChannelsFromRuntimeConfig } from '@notification/NotificationRuntimeRegistration';

describe('NotificationRuntimeRegistration patch coverage (extra)', () => {
  it('throws when default channel is empty', () => {
    NotificationChannelRegistry.reset();

    expect(() =>
      registerNotificationChannelsFromRuntimeConfig({
        default: '',
        drivers: {
          console: { driver: 'console' } as any,
        },
      } as any)
    ).toThrow(/Notification default channel is not configured/i);
  });

  it('throws when default channel is not configured', () => {
    NotificationChannelRegistry.reset();

    expect(() =>
      registerNotificationChannelsFromRuntimeConfig({
        default: 'console',
        drivers: {
          slack: { driver: 'slack' } as any,
        },
      } as any)
    ).toThrow(/Notification default channel not configured/i);
  });
});
