import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@broadcast/Broadcast', () => ({ Broadcast: { send: vi.fn() } }));

const makeReqRes = () => {
  const calls: any = {};
  const res: any = {
    _calls: calls,
    setStatus(s: number) {
      calls.status = s;
      return res;
    },
    json(p: any) {
      calls.payload = p;
    },
  };
  const req: any = { body: undefined };
  return { req, res, calls };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('patch coverage: broadcast routes', () => {
  it('/broadcast/send: returns 400 when channel missing', async () => {
    const { Router } = await import('@routing/Router');
    const router = Router.createRouter();

    const { registerBroadcastRoutes } = await import('@/../routes/broadcast');
    registerBroadcastRoutes(router);

    const { req, res } = makeReqRes();
    req.body = { event: 'test' };
    await router.routes[1].handler(req, res);

    expect(res._calls.status).toBe(400);
    expect(res._calls.payload).toEqual({
      ok: false,
      error: 'Invalid payload: channel and event are required',
    });
  });

  it('/broadcast/send: returns 400 when event missing', async () => {
    const { Router } = await import('@routing/Router');
    const router = Router.createRouter();

    const { registerBroadcastRoutes } = await import('@/../routes/broadcast');
    registerBroadcastRoutes(router);

    const { req, res } = makeReqRes();
    req.body = { channel: 'ch' };
    await router.routes[1].handler(req, res);

    expect(res._calls.status).toBe(400);
    expect(res._calls.payload).toEqual({
      ok: false,
      error: 'Invalid payload: channel and event are required',
    });
  });

  it('/broadcast/send: succeeds with valid payload', async () => {
    const { Broadcast } = await import('@broadcast/Broadcast');
    vi.mocked(Broadcast.send as any).mockResolvedValue({ messageId: '123' });

    const { Router } = await import('@routing/Router');
    const router = Router.createRouter();

    const { registerBroadcastRoutes } = await import('@/../routes/broadcast');
    registerBroadcastRoutes(router);

    const { req, res } = makeReqRes();
    req.body = { channel: 'ch', event: 'ev', data: { x: 1 } };
    await router.routes[1].handler(req, res);

    expect(res._calls.payload).toEqual({ ok: true, result: { messageId: '123' } });
  });
});
