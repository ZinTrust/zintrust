import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Notification named channels', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('throws when selecting an unknown channel', async () => {
    vi.doMock('@config/notification', () => ({
      default: {
        default: 'console',
        drivers: {
          console: { driver: 'console' },
        },
        getDriverConfig: (name?: string) => {
          const selected = String(name ?? 'console').trim();
          if (selected === 'console' || selected === 'default') return { driver: 'console' };
          throw new Error(`Notification channel not configured: ${selected}`);
        },
        providers: {
          console: { driver: 'console' },
          termii: { driver: 'termii', apiKey: '', sender: '', endpoint: '' },
          twilio: { driver: 'twilio', accountSid: '', authToken: '', fromNumber: '' },
          slack: { driver: 'slack', webhookUrl: '' },
        },
      },
      notificationConfig: {
        default: 'console',
        drivers: { console: { driver: 'console' } },
        getDriverConfig: (name?: string) => {
          const selected = String(name ?? 'console').trim();
          if (selected === 'console' || selected === 'default') return { driver: 'console' };
          throw new Error(`Notification channel not configured: ${selected}`);
        },
        providers: {
          console: { driver: 'console' },
          termii: { driver: 'termii', apiKey: '', sender: '', endpoint: '' },
          twilio: { driver: 'twilio', accountSid: '', authToken: '', fromNumber: '' },
          slack: { driver: 'slack', webhookUrl: '' },
        },
      },
    }));

    const { Notification } = await import('@notification/Notification');

    await expect(Notification.channel('missing').send('x', 'hi')).rejects.toThrow(
      /not configured|not registered/i
    );
  });

  it('routes Slack webhook by channel config', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({ ok: true }),
    }));
    vi.stubGlobal('fetch', fetchSpy as any);

    vi.doMock('@config/notification', () => ({
      default: {
        get default() {
          return 'ops';
        },
        get drivers() {
          return {
            ops: { driver: 'slack', webhookUrl: 'https://hooks.slack.test/ops' },
          };
        },
        getDriverConfig: (name?: string) => {
          const selected = String(name ?? 'ops')
            .trim()
            .toLowerCase();
          if (selected === 'default' || selected === 'ops')
            return { driver: 'slack', webhookUrl: 'https://hooks.slack.test/ops' };
          throw new Error(`Notification channel not configured: ${selected}`);
        },
        get providers() {
          return {
            console: { driver: 'console' },
            termii: { driver: 'termii', apiKey: '', sender: '', endpoint: '' },
            twilio: { driver: 'twilio', accountSid: '', authToken: '', fromNumber: '' },
            slack: { driver: 'slack', webhookUrl: 'https://hooks.slack.test/ops' },
          };
        },
      },
      notificationConfig: {
        get default() {
          return 'ops';
        },
        get drivers() {
          return {
            ops: { driver: 'slack', webhookUrl: 'https://hooks.slack.test/ops' },
          };
        },
        getDriverConfig: (name?: string) => {
          const selected = String(name ?? 'ops')
            .trim()
            .toLowerCase();
          if (selected === 'default' || selected === 'ops')
            return { driver: 'slack', webhookUrl: 'https://hooks.slack.test/ops' };
          throw new Error(`Notification channel not configured: ${selected}`);
        },
        get providers() {
          return {
            console: { driver: 'console' },
            termii: { driver: 'termii', apiKey: '', sender: '', endpoint: '' },
            twilio: { driver: 'twilio', accountSid: '', authToken: '', fromNumber: '' },
            slack: { driver: 'slack', webhookUrl: 'https://hooks.slack.test/ops' },
          };
        },
      },
    }));

    const { Notification } = await import('@notification/Notification');

    await Notification.channel('ops').send('ignored', 'Hello', { username: 'bot' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as any;
    expect(url).toBe('https://hooks.slack.test/ops');
    expect(init?.method).toBe('POST');
  });
});
