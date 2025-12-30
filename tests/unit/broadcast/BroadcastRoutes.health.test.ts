import { registerBroadcastRoutes } from '@routes/broadcast';
import { Router } from '@routing/Router';
import { describe, expect, it, vi } from 'vitest';

describe('Broadcast routes - health', () => {
  it('registers GET /broadcast/health', async () => {
    const router = Router.createRouter();
    registerBroadcastRoutes(router);

    const match = Router.match(router, 'GET', '/broadcast/health');
    expect(match).not.toBeNull();

    const res = { json: vi.fn() } as any;

    await (match as any).handler({} as any, res);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
