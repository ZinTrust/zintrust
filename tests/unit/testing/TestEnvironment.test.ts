import { Router } from '@/routing/Router';
import { ServiceContainer } from '@container/ServiceContainer';
import { describe, expect, it } from 'vitest';

import { TestEnvironment } from '@/testing/TestEnvironment';

describe('TestEnvironment (src/testing)', () => {
  it('lowercases incoming headers and parses JSON response body', async () => {
    const env = TestEnvironment.create({
      registerRoutes(router) {
        Router.get(router, '/ping', async (req, res) => {
          // Verify request header lookup is lowercased by our test harness
          expect(req.getHeader('x-custom')).toBe('abc');
          res.json({ ok: true });
        });
      },
    });

    const r = await env.request({
      method: 'GET',
      path: '/ping',
      headers: { 'X-Custom': 'abc' },
    });

    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true });
  });

  it('returns raw body when response is not JSON', async () => {
    const env = TestEnvironment.create({
      registerRoutes(router) {
        Router.get(router, '/text', async (_req, res) => {
          res.text('hello');
        });
      },
    });

    const r = await env.request({ method: 'GET', path: '/text' });

    expect(r.bodyText).toBe('hello');
    expect(r.json).toBe('hello');
  });

  it('parses cookies from Set-Cookie (string and array forms)', async () => {
    const env = TestEnvironment.create({
      registerRoutes(router) {
        Router.get(router, '/cookies', async (_req, res) => {
          res.setHeader('Set-Cookie', [
            'A=1; Path=/; HttpOnly',
            'B=two; Path=/; Secure',
            'badcookie; Path=/',
          ]);
          res.json({ ok: true });
        });
      },
    });

    const r = await env.request({ method: 'GET', path: '/cookies' });

    expect(r.cookies).toEqual({ A: '1', B: 'two' });
  });

  it('supports swapping services via the overridable container', () => {
    const base = ServiceContainer.create();
    base.singleton('value', () => 'base');

    const env = TestEnvironment.create({ container: base });

    expect(env.container.get('value')).toBe('base');

    const restore = env.swapSingleton('value', 'override');
    expect(env.container.get('value')).toBe('override');

    restore();
    expect(env.container.get('value')).toBe('base');

    const restoreFactory = env.swapFactory('value', () => 'factory');
    expect(env.container.get('value')).toBe('factory');

    restoreFactory();
    expect(env.container.get('value')).toBe('base');
  });
});
