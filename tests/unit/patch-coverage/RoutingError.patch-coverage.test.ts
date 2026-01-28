import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Router } from '@/routes/Router';

vi.mock('@config/app', () => ({
  appConfig: {
    isDevelopment: () => false,
  },
}));

vi.mock('@http/error-pages/ErrorPageRenderer', () => ({
  ErrorPageRenderer: {
    shouldSendHtml: vi.fn(() => false),
    renderHtml: vi.fn(() => undefined),
  },
}));

describe('patch coverage: routing/error (forced 404/500)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles /404 forced route', async () => {
    const { registerErrorRoutes } = await import('@/routes/error');

    const router = Router.createRouter();
    registerErrorRoutes(router);

    const match = Router.match(router, 'GET', '/404');
    if (match === null) throw new Error('Expected /404 route');

    const res = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      html: vi.fn().mockReturnThis(),
    } as any;

    await match.handler({} as any, res);

    expect(res.setStatus).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalled();
  });

  it('handles /500 forced route', async () => {
    const { registerErrorRoutes } = await import('@/routes/error');

    const router = Router.createRouter();
    registerErrorRoutes(router);

    const match = Router.match(router, 'GET', '/500');
    if (match === null) throw new Error('Expected /500 route');

    const res = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      html: vi.fn().mockReturnThis(),
    } as any;

    await match.handler({} as any, res);

    expect(res.setStatus).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalled();
  });
});
