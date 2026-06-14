import { Env, Router } from '@zintrust/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createMockResponse = () => {
  return {
    statusCode: 200,
    payload: undefined as unknown,
    setStatus(code: number) {
      this.statusCode = code;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
    },
  };
};

describe('@zintrust/socket', () => {
  beforeEach(() => {
    Env.setSource({
      SOCKET_ENABLED: 'true',
      SOCKET_PATH: '/app',
      PUSHER_APP_ID: 'app-1',
      PUSHER_APP_KEY: 'demo-key',
      PUSHER_APP_SECRET: 'demo-secret',
      BROADCAST_ACTIVITY_TIMEOUT: '45',
    });
  });

  afterEach(async () => {
    const { clearBroadcastConfigCache } = await import('@config/broadcast');
    const { StartupConfigFileRegistry } = await import('@runtime/StartupConfigFileRegistry');
    clearBroadcastConfigCache();
    StartupConfigFileRegistry.clear();
    Env.setSource(null);
    delete (globalThis as { __zintrustSocketState?: unknown }).__zintrustSocketState;
    delete (globalThis as { env?: unknown }).env;
    delete (
      globalThis as {
        __zintrustStartupConfigOverrides?: Map<string, unknown>;
      }
    ).__zintrustStartupConfigOverrides;
  });

  const preloadSocketBroadcastOverride = async (socketOverride: Record<string, unknown>) => {
    const { clearBroadcastConfigCache } = await import('@config/broadcast');
    const { StartupConfigFile, StartupConfigFileRegistry } =
      await import('@runtime/StartupConfigFileRegistry');

    (
      globalThis as {
        __zintrustStartupConfigOverrides?: Map<string, unknown>;
      }
    ).__zintrustStartupConfigOverrides = new Map([
      [StartupConfigFile.Broadcast, { socket: socketOverride }],
    ]);

    await StartupConfigFileRegistry.preload([StartupConfigFile.Broadcast]);
    clearBroadcastConfigCache();
  };

  it('registers compatibility routes with the configured socket path', async () => {
    const { registerSocketRoutes } = await import('@zintrust/socket');
    const router = Router.createRouter();

    registerSocketRoutes(router);

    expect(Router.match(router, 'GET', '/app/demo-key')?.routePath).toBe('/app/:appKey');
    expect(Router.match(router, 'POST', '/broadcasting/auth')?.routePath).toBe(
      '/broadcasting/auth'
    );
    expect(Router.match(router, 'POST', '/broadcasting/auth')?.middleware).toEqual(['auth']);
    expect(Router.match(router, 'POST', '/apps/app-1/events')?.routePath).toBe(
      '/apps/:appId/events'
    );
  });

  it('denies private-channel auth requests when no authenticated user is present', async () => {
    const { registerSocketRoutes } = await import('@zintrust/socket');
    const router = Router.createRouter();
    registerSocketRoutes(router);

    const match = Router.match(router, 'POST', '/broadcasting/auth');
    expect(match).not.toBeNull();
    const response = createMockResponse();

    await match!.handler(
      {
        getBody: () => ({
          socket_id: '123.456',
          channel_name: 'private-orders',
        }),
        user: undefined,
      } as any,
      response as any
    );

    expect(response.statusCode).toBe(403);
    expect(response.payload).toMatchObject({ message: 'Forbidden' });
  });

  it('creates pusher-compatible auth responses for authenticated private-channel requests', async () => {
    const { registerSocketRoutes } = await import('@zintrust/socket');
    const router = Router.createRouter();
    registerSocketRoutes(router);

    const match = Router.match(router, 'POST', '/broadcasting/auth');
    expect(match).not.toBeNull();
    const response = createMockResponse();

    await match!.handler(
      {
        getBody: () => ({
          socket_id: '123.456',
          channel_name: 'private-orders',
          channel_data: '{"user_id":"7"}',
        }),
        user: { sub: '7' },
      } as any,
      response as any
    );

    expect(response.statusCode).toBe(200);
    expect(response.payload).toMatchObject({
      auth: expect.stringMatching(/^demo-key:/),
      channel_data: '{"user_id":"7"}',
    });
  });

  it('uses configured socket auth middleware when provided by env', async () => {
    Env.setSource({
      SOCKET_ENABLED: 'true',
      SOCKET_PATH: '/app',
      PUSHER_APP_ID: 'app-1',
      PUSHER_APP_KEY: 'demo-key',
      PUSHER_APP_SECRET: 'demo-secret',
      SOCKET_AUTH_MIDDLEWARE: 'auth,jwt',
    });

    const { registerSocketRoutes } = await import('@zintrust/socket');
    const router = Router.createRouter();
    registerSocketRoutes(router);

    expect(Router.match(router, 'POST', '/broadcasting/auth')?.middleware).toEqual(['auth', 'jwt']);
  });

  it('preserves an application-owned auth route by default', async () => {
    const { registerSocketRoutes } = await import('@zintrust/socket');
    const router = Router.createRouter();
    const appOwnedAuthRoute = vi.fn(() => undefined);

    Router.post(router, '/broadcasting/auth', appOwnedAuthRoute);

    expect(() => registerSocketRoutes(router)).not.toThrow();
    expect(Router.match(router, 'POST', '/broadcasting/auth')?.handler).toBe(appOwnedAuthRoute);
  });

  it('allows application-owned auth routes when explicit override is enabled', async () => {
    Env.setSource({
      SOCKET_ENABLED: 'true',
      SOCKET_PATH: '/app',
      PUSHER_APP_ID: 'app-1',
      PUSHER_APP_KEY: 'demo-key',
      PUSHER_APP_SECRET: 'demo-secret',
      SOCKET_ALLOW_AUTH_ROUTE_OVERRIDE: 'true',
    });

    const { registerSocketRoutes } = await import('@zintrust/socket');
    const router = Router.createRouter();

    Router.post(router, '/broadcasting/auth', () => undefined);

    expect(() => registerSocketRoutes(router)).not.toThrow();
    expect(
      router.routes.filter(
        (route) => route.method === 'POST' && route.path === '/broadcasting/auth'
      ).length
    ).toBe(1);
  });

  it('requires the configured publish secret for event publishing', async () => {
    const { registerSocketRoutes } = await import('@zintrust/socket');
    const router = Router.createRouter();
    registerSocketRoutes(router);

    const match = Router.match(router, 'POST', '/apps/app-1/events');
    expect(match).not.toBeNull();
    const forbidden = createMockResponse();

    await match!.handler(
      {
        getParam: (key: string) => (key === 'appId' ? 'app-1' : undefined),
        getHeader: () => undefined,
        getBody: () => ({ event: 'server-message', channel: 'public-chat', data: { ok: true } }),
      } as any,
      forbidden as any
    );

    expect(forbidden.statusCode).toBe(403);

    const accepted = createMockResponse();
    await match!.handler(
      {
        getParam: (key: string) => (key === 'appId' ? 'app-1' : undefined),
        getHeader: (name: string) =>
          name === 'x-zintrust-socket-secret' ? 'demo-secret' : undefined,
        getBody: () => ({ event: 'server-message', channel: 'public-chat', data: { ok: true } }),
      } as any,
      accepted as any
    );

    expect(accepted.statusCode).toBe(202);
    expect(accepted.payload).toMatchObject({ ok: true, event: 'server-message' });
  });

  it('applies configured socket publish policies before fan-out', async () => {
    await preloadSocketBroadcastOverride({
      async publish(_request: unknown, context: { event: string }) {
        return {
          allowed: context.event !== 'admin.secret',
          statusCode: 451,
          message: 'Blocked by publish policy.',
        };
      },
    });

    const { registerSocketRoutes } = await import('@zintrust/socket');
    const router = Router.createRouter();
    registerSocketRoutes(router);

    const match = Router.match(router, 'POST', '/apps/app-1/events');
    expect(match).not.toBeNull();
    const response = createMockResponse();

    await match!.handler(
      {
        getParam: (key: string) => (key === 'appId' ? 'app-1' : undefined),
        getHeader: (name: string) =>
          name === 'x-zintrust-socket-secret' ? 'demo-secret' : undefined,
        getBody: () => ({ event: 'admin.secret', channel: 'public-chat', data: { ok: true } }),
        user: { sub: '7' },
      } as any,
      response as any
    );

    expect(response.statusCode).toBe(451);
    expect(response.payload).toMatchObject({ message: 'Blocked by publish policy.' });
  });

  it('allows publish policies to rewrite outgoing publish payloads', async () => {
    await preloadSocketBroadcastOverride({
      async publish() {
        return {
          allowed: true,
          channels: ['public-renamed'],
          event: 'server-message.rewritten',
          data: { rewritten: true },
        };
      },
    });

    const { registerSocketRoutes } = await import('@zintrust/socket');
    const router = Router.createRouter();
    registerSocketRoutes(router);

    const match = Router.match(router, 'POST', '/apps/app-1/events');
    expect(match).not.toBeNull();
    const response = createMockResponse();

    await match!.handler(
      {
        getParam: (key: string) => (key === 'appId' ? 'app-1' : undefined),
        getHeader: (name: string) =>
          name === 'x-zintrust-socket-secret' ? 'demo-secret' : undefined,
        getBody: () => ({ event: 'server-message', channel: 'public-chat', data: { ok: true } }),
        user: { sub: '7' },
      } as any,
      response as any
    );

    expect(response.statusCode).toBe(202);
    expect(response.payload).toMatchObject({
      ok: true,
      channels: ['public-renamed'],
      event: 'server-message.rewritten',
    });
  });

  it('forwards cloudflare publish requests into the durable object hub', async () => {
    const hubFetch = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true, deliveries: 3, event: 'server-message' }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      });
    });

    (globalThis as { env?: unknown }).env = {
      SOCKET_ENABLED: 'true',
      SOCKET_TRANSPORT: 'cloudflare',
      SOCKET_PATH: '/app',
      PUSHER_APP_ID: 'app-1',
      PUSHER_APP_KEY: 'demo-key',
      PUSHER_APP_SECRET: 'demo-secret',
      ZT_SOCKET_HUB: {
        getByName: () => ({ fetch: hubFetch }),
      },
    };

    const { registerSocketRoutes } = await import('@zintrust/socket');
    const router = Router.createRouter();
    registerSocketRoutes(router);

    const match = Router.match(router, 'POST', '/apps/app-1/events');
    expect(match).not.toBeNull();
    const response = createMockResponse();

    await match!.handler(
      {
        getParam: (key: string) => (key === 'appId' ? 'app-1' : undefined),
        getHeader: (name: string) =>
          name === 'x-zintrust-socket-secret' ? 'demo-secret' : undefined,
        getBody: () => ({ event: 'server-message', channel: 'public-chat', data: { ok: true } }),
      } as any,
      response as any
    );

    expect(hubFetch).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(202);
    expect(response.payload).toMatchObject({ ok: true, deliveries: 3, event: 'server-message' });
  });

  it('publishes from a server context when globalThis.env lacks socket config', async () => {
    // Worker-runtime job context: globalThis.env is non-null but does not carry
    // SOCKET_ENABLED / PUSHER_APP_KEY. Settings must fall back to the process-level
    // Env (set in beforeEach) instead of reporting the socket runtime disabled.
    (globalThis as { env?: unknown }).env = {
      WORKER_ENABLED: 'true',
      REDIS_RPC_URL: 'https://rpc.internal',
    };

    const { publishSocketEventFromServer } = await import('@zintrust/socket');

    const result = await publishSocketEventFromServer({
      channels: ['public-chat'],
      event: 'server-message',
      data: { ok: true },
    });

    expect(result).toMatchObject({
      ok: true,
      transport: 'node',
      channels: ['public-chat'],
      event: 'server-message',
    });
  });

  it('reports the socket runtime disabled when env source explicitly disables it', async () => {
    // An env source that explicitly sets SOCKET_ENABLED=false is authoritative and
    // must be respected (not treated as a "missing config" fallback case).
    (globalThis as { env?: unknown }).env = {
      SOCKET_ENABLED: 'false',
    };

    const { publishSocketEventFromServer } = await import('@zintrust/socket');

    await expect(
      publishSocketEventFromServer({
        channels: ['public-chat'],
        event: 'server-message',
        data: { ok: true },
      })
    ).rejects.toThrow(/Socket runtime is not enabled/);
  });

  it('matches websocket upgrade paths for node runtime handling', async () => {
    const { socketRuntime } = await import('@zintrust/socket');

    expect(
      socketRuntime.canHandleNodeUpgrade({
        request: {
          url: '/app/demo-key',
          headers: { upgrade: 'websocket' },
        },
        socket: {} as any,
        head: Buffer.alloc(0),
      })
    ).toBe(true);

    expect(
      socketRuntime.canHandleNodeUpgrade({
        request: {
          url: '/other/demo-key',
          headers: { upgrade: 'websocket' },
        },
        socket: {} as any,
        head: Buffer.alloc(0),
      })
    ).toBe(false);
  });

  it('forwards cloudflare websocket upgrades into the durable object hub', async () => {
    const hubResponse = new Response('socket-runtime', { status: 200 });
    const hubFetch = vi.fn(async () => hubResponse);
    const { socketRuntime } = await import('@zintrust/socket');

    const response = await socketRuntime.handleWorkerRequest(
      new Request('https://example.test/app/demo-key', {
        headers: { upgrade: 'websocket' },
      }),
      {
        env: {
          SOCKET_ENABLED: 'true',
          SOCKET_TRANSPORT: 'cloudflare',
          SOCKET_PATH: '/app',
          PUSHER_APP_ID: 'app-1',
          PUSHER_APP_KEY: 'demo-key',
          PUSHER_APP_SECRET: 'demo-secret',
          ZT_SOCKET_HUB: {
            getByName: () => ({ fetch: hubFetch }),
          },
        },
      }
    );

    expect(hubFetch).toHaveBeenCalledTimes(1);
    expect(response).toBe(hubResponse);
  });
});
