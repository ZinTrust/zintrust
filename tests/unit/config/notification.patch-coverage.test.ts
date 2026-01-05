import { describe, expect, it, vi } from 'vitest';

describe('src/config/notification patch coverage', () => {
  it('throws when NOTIFICATION_DRIVER is unknown (no fallback)', async () => {
    vi.resetModules();
    process.env['NOTIFICATION_DRIVER'] = 'does-not-exist';

    await expect(async () => {
      const { default: notificationConfig } = await import('@config/notification');
      // Access triggers default resolution
      void notificationConfig.default;
    }).rejects.toMatchObject({
      message: expect.stringContaining('Notification channel not configured'),
    });

    delete process.env['NOTIFICATION_DRIVER'];
  });

  it('getDriverConfig throws when explicitly selecting unknown channel', async () => {
    const { default: notificationConfig } = await import('@config/notification');

    await expect(async () => notificationConfig.getDriverConfig('missing')).rejects.toMatchObject({
      message: expect.stringContaining('Notification channel not configured'),
    });
  });

  it("getDriverConfig('default') resolves configured default", async () => {
    const { default: notificationConfig } = await import('@config/notification');

    const cfg = notificationConfig.getDriverConfig('default');
    expect(cfg).toMatchObject({ driver: 'console' });
  });

  it('throws when default channel is misconfigured (no fallback)', async () => {
    const { default: notificationConfig } = await import('@config/notification');

    const fakeConfig = {
      default: 'missing',
      drivers: {
        console: { driver: 'console' },
      },
    };

    expect(() => (notificationConfig.getDriverConfig as any).call(fakeConfig, undefined)).toThrow(
      /Notification channel not configured/i
    );
  });

  it('throws when no channels are configured and selection is not explicit', async () => {
    const { default: notificationConfig } = await import('@config/notification');

    const fakeConfig = {
      default: 'missing',
      drivers: {},
    };

    await expect(async () =>
      (notificationConfig.getDriverConfig as any).call(fakeConfig, undefined)
    ).rejects.toMatchObject({
      message: expect.stringContaining('No notification channels are configured'),
    });
  });
});
