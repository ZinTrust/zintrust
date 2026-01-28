import { RouteRegistry } from '@core-routes/RouteRegistry';
import { Router } from '@core-routes/Router';
import { beforeEach, describe, expect, it } from 'vitest';

describe('RouteRegistry', () => {
  beforeEach(() => {
    RouteRegistry.clear();
  });

  it('records route registrations (method/path/middleware/meta)', () => {
    const router = Router.createRouter();

    Router.get(router, '/ping', async () => undefined, {
      meta: { summary: 'Ping' },
    });

    Router.post(router, '/secure', async () => undefined, {
      middleware: ['auth', 'jwt'],
      meta: { summary: 'Secure', tags: ['auth'] },
    });

    const routes = RouteRegistry.list();
    expect(routes).toHaveLength(2);

    expect(routes[0]).toEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/ping',
        middleware: undefined,
        meta: expect.objectContaining({ summary: 'Ping' }),
      })
    );

    expect(routes[1]).toEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/secure',
        middleware: ['auth', 'jwt'],
        meta: expect.objectContaining({ summary: 'Secure' }),
      })
    );
  });
});
