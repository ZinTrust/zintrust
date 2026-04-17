import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/trace/SystemTraceBridge', () => ({
  SystemTraceBridge: {
    emitNotification: vi.fn(),
  },
}));

import { SystemTraceBridge } from '@/trace/SystemTraceBridge';
import { Notification } from '@notification/Notification';

describe('Notification.compose', () => {
  beforeEach(() => {
    Notification.clearChannels();
    vi.clearAllMocks();
  });

  it('sends required and best-effort channels with normalized results', async () => {
    const emailSpy = vi.fn(async () => ({ accepted: true }));
    const pushSpy = vi.fn(async () => {
      throw new Error('push down');
    });

    Notification.registerChannel('email', emailSpy);
    Notification.registerChannel('push', pushSpy);

    const result = await Notification.compose({
      context: { requestId: 'req-1' },
    })
      .email({ to: 'account@example.com', subject: 'Done' })
      .push({ recipientId: 'account-1', title: 'Done' })
      .required(['email'])
      .bestEffort(['push'])
      .send();

    expect(emailSpy).toHaveBeenCalledWith(
      { to: 'account@example.com', subject: 'Done' },
      { requestId: 'req-1' }
    );
    expect(pushSpy).toHaveBeenCalledWith(
      { recipientId: 'account-1', title: 'Done' },
      { requestId: 'req-1' }
    );
    expect(result).toEqual({
      ok: true,
      results: [
        {
          channel: 'email',
          policy: 'required',
          ok: true,
          payload: { to: 'account@example.com', subject: 'Done' },
          result: { accepted: true },
        },
        {
          channel: 'push',
          policy: 'best_effort',
          ok: false,
          payload: { recipientId: 'account-1', title: 'Done' },
          error: expect.any(Error),
        },
      ],
    });
    expect(SystemTraceBridge.emitNotification).toHaveBeenCalledWith(
      'compose:email',
      ['email'],
      undefined,
      undefined,
      { to: 'account@example.com', subject: 'Done' }
    );
  });

  it('rejects when a required channel fails', async () => {
    Notification.registerChannel('email', async () => {
      throw new Error('smtp failed');
    });

    await expect(
      Notification.compose()
        .email({ to: 'account@example.com', subject: 'Done' })
        .required(['email'])
        .send()
    ).rejects.toMatchObject({
      results: [
        {
          channel: 'email',
          policy: 'required',
          ok: false,
        },
      ],
    });
  });

  it('rejects when a referenced required channel is not registered', async () => {
    await expect(
      Notification.compose().channel('slack', { text: 'hello' }).required(['slack']).send()
    ).rejects.toMatchObject({
      results: [
        {
          channel: 'slack',
          policy: 'required',
          ok: false,
        },
      ],
    });
  });

  it('lists registered compose channels separately from drivers', () => {
    Notification.registerChannel('email', async () => ({ accepted: true }));
    Notification.registerChannel('push', async () => ({ accepted: true }));

    expect(Notification.hasChannel('email')).toBe(true);
    expect(Notification.listChannels()).toEqual(['email', 'push']);
  });

  it('supports sms/webhook aliases and channel registry cleanup', async () => {
    const smsSpy = vi.fn(async () => ({ queued: true }));
    const webhookSpy = vi.fn(async () => ({ delivered: true }));

    Notification.registerChannel('sms', smsSpy);
    Notification.registerChannel('webhook', webhookSpy);

    const result = await Notification.compose()
      .sms({ to: '+2340000000000', message: 'ping' })
      .webhook({ url: 'https://example.com/hook' })
      .send();

    expect(result.ok).toBe(true);
    expect(result.results).toEqual([
      expect.objectContaining({ channel: 'sms', policy: 'required', ok: true }),
      expect.objectContaining({ channel: 'webhook', policy: 'required', ok: true }),
    ]);

    Notification.unregisterChannel('sms');
    expect(Notification.hasChannel('sms')).toBe(false);

    Notification.clearChannels();
    expect(Notification.listChannels()).toEqual([]);
  });

  it('validates compose inputs before sending', async () => {
    expect(() => Notification.registerChannel('email', undefined as never)).toThrow(
      /handler must be a function/i
    );
    expect(() => Notification.compose().channel('  ', { ok: true })).toThrow(
      /channel name must be a non-empty string/i
    );
    expect(() => Notification.compose().required('email' as never)).toThrow(/must be an array/i);

    await expect(Notification.compose().send()).rejects.toThrow(/at least one channel/i);
  });
});
