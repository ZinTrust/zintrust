import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Router } from '@routing/Router';
import { registerBroadcastRoutes } from '@routes/broadcast';

const mockSend = vi.fn(async () => ({ ok: true }));
vi.mock('@broadcast/Broadcast', () => ({ Broadcast: { send: mockSend } }));

describe('Broadcast routes', () => {
  let router: ReturnType<typeof Router.createRouter>;
  beforeEach(() => {
    router = Router.createRouter();
    registerBroadcastRoutes(router);
    vi.resetAllMocks();
  });

  it('registers POST /broadcast/send and delegates to Broadcast.send', async () => {
    const match = Router.match(router, 'POST', '/broadcast/send');
    expect(match).not.toBeNull();
    const handler = match?.handler as any;

    const req = { body: { channel: 'test', event: 'Ev', data: { x: 1 } } } as any;
    const jsonMock = vi.fn();
    const res = { json: jsonMock } as any;

    // Call handler
    await handler(req, res);

    expect(mockSend).toHaveBeenCalledWith('test', 'Ev', { x: 1 });
    expect(jsonMock).toHaveBeenCalledWith({ ok: true, result: { ok: true } });
  });
});
