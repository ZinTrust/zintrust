import { NotificationRegistry } from '@notification/Registry';
import { NotificationService } from '@notification/Service';
import { describe, expect, it, vi } from 'vitest';

describe('Notification Service', () => {
  it('routes to console driver by default', async () => {
    const out = await NotificationService.send('user', 'hi');
    expect(out).toEqual({ ok: true });
  });

  it('uses registered driver when configured', async () => {
    const spy = vi.fn(async () => ({ ok: true }));
    NotificationRegistry.register('testdrv', { send: spy } as any);
    process.env['NOTIFICATION_DRIVER'] = 'testdrv';

    const res = await NotificationService.send('u', 'm');
    expect(spy).toHaveBeenCalled();
    expect(res).toEqual({ ok: true });

    delete process.env['NOTIFICATION_DRIVER'];
  });

  it('validates recipient and message', async () => {
    await expect(NotificationService.send('' as any, 'hi')).rejects.toHaveProperty(
      'message',
      'Recipient required'
    );
    await expect(NotificationService.send(null as any, 'hi')).rejects.toHaveProperty(
      'message',
      'Recipient required'
    );

    await expect(NotificationService.send('user', '' as any)).rejects.toHaveProperty(
      'message',
      'Message required'
    );
    await expect(NotificationService.send('user', 123 as any)).rejects.toHaveProperty(
      'message',
      'Message required'
    );
  });

  it('lists registered drivers', () => {
    const drivers = NotificationService.listDrivers();
    expect(Array.isArray(drivers)).toBe(true);
    expect(drivers.length).toBeGreaterThan(0);
  });
});
