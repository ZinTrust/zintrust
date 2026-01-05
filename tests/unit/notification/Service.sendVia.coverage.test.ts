import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@notification/drivers/Console', () => {
  return {
    ConsoleDriver: {
      send: vi.fn(async () => ({ ok: true, via: 'console' })),
    },
  };
});

vi.mock('@notification/drivers/Slack', () => {
  return {
    SlackDriver: {
      send: vi.fn(async () => ({ ok: true, via: 'slack' })),
    },
  };
});

vi.mock('@notification/drivers/Twilio', () => {
  return {
    TwilioDriver: {
      send: vi.fn(async () => ({ ok: true, via: 'twilio' })),
    },
  };
});

import { ConsoleDriver } from '@notification/drivers/Console';
import { SlackDriver } from '@notification/drivers/Slack';
import { TwilioDriver } from '@notification/drivers/Twilio';
import { NotificationChannelRegistry } from '@notification/NotificationChannelRegistry';
import { NotificationService } from '@notification/Service';

describe('NotificationService.sendVia patch coverage', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    NotificationChannelRegistry.reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('routes to console driver when channel config is console', async () => {
    NotificationChannelRegistry.register('consoleChan', { driver: 'console' } as any);

    const res = await NotificationService.sendVia('consoleChan', 'user', 'hi', { a: 1 });

    expect(ConsoleDriver.send).toHaveBeenCalledWith('user', 'hi', { a: 1 });
    expect(res).toEqual({ ok: true, via: 'console' });
  });

  it('routes to slack driver when channel config is slack', async () => {
    NotificationChannelRegistry.register('slackChan', {
      driver: 'slack',
      webhookUrl: 'https://example.invalid/hook',
    } as any);

    const res = await NotificationService.sendVia('slackChan', 'user', 'hello', { foo: 'bar' });

    expect(SlackDriver.send).toHaveBeenCalledWith(
      { webhookUrl: 'https://example.invalid/hook' },
      { text: 'hello', foo: 'bar' }
    );
    expect(res).toEqual({ ok: true, via: 'slack' });
  });

  it('routes to twilio driver when channel config is twilio', async () => {
    NotificationChannelRegistry.register('twilioChan', {
      driver: 'twilio',
      accountSid: 'AC123',
      authToken: 'tok',
      fromNumber: '+100',
    } as any);

    const res = await NotificationService.sendVia('twilioChan', '+200', 'msg');

    expect(TwilioDriver.send).toHaveBeenCalledWith(
      { accountSid: 'AC123', authToken: 'tok', from: '+100' },
      { to: '+200', body: 'msg' }
    );
    expect(res).toEqual({ ok: true, via: 'twilio' });
  });

  it('termii: throws when apiKey missing', async () => {
    NotificationChannelRegistry.register('termiiChan', {
      driver: 'termii',
      apiKey: '',
      endpoint: 'https://termii.invalid',
    } as any);

    await expect(NotificationService.sendVia('termiiChan', 'user', 'hello')).rejects.toHaveProperty(
      'message',
      'TERMII_API_KEY is not configured'
    );
  });

  it('termii: throws when endpoint missing', async () => {
    NotificationChannelRegistry.register('termiiChan', {
      driver: 'termii',
      apiKey: 'k',
      endpoint: '',
    } as any);

    await expect(NotificationService.sendVia('termiiChan', 'user', 'hello')).rejects.toHaveProperty(
      'message',
      'TERMII_ENDPOINT is not configured'
    );
  });

  it('termii: throws when fetch returns !ok (and tolerates text() failure)', async () => {
    NotificationChannelRegistry.register('termiiChan', {
      driver: 'termii',
      apiKey: 'k',
      endpoint: 'https://termii.invalid',
      sender: 'Z',
    } as any);

    const text = vi.fn(async () => {
      throw new Error('boom');
    });

    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 400, text }) as any) as any;

    await expect(NotificationService.sendVia('termiiChan', 'user', 'hello')).rejects.toMatchObject({
      message: expect.stringContaining('Termii request failed (400)'),
    });
  });

  it('termii: returns {} when response json cannot be parsed', async () => {
    NotificationChannelRegistry.register('termiiChan', {
      driver: 'termii',
      apiKey: 'k',
      endpoint: 'https://termii.invalid',
      sender: 'Z',
    } as any);

    const json = vi.fn(async () => {
      throw new Error('invalid json');
    });

    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json }) as any) as any;

    const res = await NotificationService.sendVia('termiiChan', 'user', 'hello');
    expect(res).toEqual({});
  });

  it('throws for unsupported driver names', async () => {
    NotificationChannelRegistry.register('badChan', { driver: 'unknown' } as any);

    await expect(NotificationService.sendVia('badChan', 'user', 'hello')).rejects.toMatchObject({
      message: expect.stringContaining('Notification: unsupported driver'),
    });
  });
});
