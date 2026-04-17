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
});
