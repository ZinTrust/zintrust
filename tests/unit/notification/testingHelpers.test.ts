import { NotificationRegistry } from '@notification/Registry';
import { useFakeDriver } from '@notification/testingHelpers';
import { describe, expect, it } from 'vitest';

describe('Notification testing helpers', () => {
  it('registers a fake driver and restores previous state', () => {
    const helper = useFakeDriver('fake-for-test');

    expect(NotificationRegistry.list()).toContain('fake-for-test');

    helper.restore();

    const after = NotificationRegistry.list();
    expect(Array.isArray(after)).toBe(true);
    // fake-for-test should still be present but restored
    expect(after).toContain('fake-for-test');
  });

  it('restores a previously-registered driver and restores NOTIFICATION_DRIVER env', async () => {
    const name = 'fake-for-test-restore-previous';
    const previous = {
      send: async () => ({ ok: true, previous: true }),
    };

    NotificationRegistry.register(name, previous as any);
    process.env['NOTIFICATION_DRIVER'] = 'prev-driver';

    const fake = {
      send: async () => ({ ok: true, fake: true }),
    };

    const helper = useFakeDriver(name, fake);
    expect(process.env['NOTIFICATION_DRIVER']).toBe(name);

    const during = NotificationRegistry.get(name) as any;
    await expect(during.send('r', 'm')).resolves.toMatchObject({ fake: true });

    helper.restore();

    expect(process.env['NOTIFICATION_DRIVER']).toBe('prev-driver');
    const after = NotificationRegistry.get(name) as any;
    await expect(after.send('r', 'm')).resolves.toMatchObject({ previous: true });

    delete process.env['NOTIFICATION_DRIVER'];
  });
});
