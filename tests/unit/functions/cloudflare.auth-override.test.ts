import { afterEach, describe, expect, it, vi } from 'vitest';

const deleteWorkerGlobals = (): void => {
  delete (globalThis as { __zintrustStartupConfigOverrides?: Map<string, unknown> })
    .__zintrustStartupConfigOverrides;
  delete (globalThis as { env?: unknown }).env;
};

const loadHandler = async (
  tag: 'worker-default-auth-401' | 'worker-auth-jwt-override'
): Promise<(request: Request, env: unknown, ctx: unknown) => Promise<Response>> => {
  const mod =
    tag === 'worker-default-auth-401'
      ? await import('../../../src/functions/cloudflare?worker-default-auth-401')
      : await import('../../../src/functions/cloudflare?worker-auth-jwt-override');
  return mod.default.fetch;
};

const resetRuntimeState = async (): Promise<void> => {
  const [{ __resetKernelForTests }, { StartupConfigFileRegistry }, { clearMiddlewareConfigCache }] =
    await Promise.all([
      import('@/runtime/getKernel'),
      import('@/runtime/StartupConfigFileRegistry'),
      import('@/config/middleware'),
    ]);

  __resetKernelForTests();
  StartupConfigFileRegistry.clear();
  clearMiddlewareConfigCache();
  deleteWorkerGlobals();
};

describe('functions/cloudflare auth responder overrides', () => {
  afterEach(async () => {
    vi.doUnmock('@runtime-config/middleware.ts');
    vi.unstubAllEnvs();
    await resetRuntimeState();
    vi.resetModules();
  });

  it('keeps default auth failures at 401 in the worker fetch path', async () => {
    vi.stubEnv('DB_CONNECTION', 'sqlite');
    vi.stubEnv('JWT_SECRET', 'test-jwt-secret');
    vi.stubEnv('APP_KEY', 'test-app-key');

    const fetch = await loadHandler('worker-default-auth-401');
    const response = await fetch(
      new Request('http://localhost/api/v1/users/create', { method: 'GET' }),
      {},
      {}
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'missing_authorization_header',
        message: 'Unauthorized',
      },
    });
  });

  it('allows auth and jwt responders to override status and body in the worker fetch path', async () => {
    vi.stubEnv('DB_CONNECTION', 'sqlite');
    vi.stubEnv('JWT_SECRET', 'test-jwt-secret');
    vi.stubEnv('APP_KEY', 'test-app-key');
    vi.stubEnv('CSRF_SKIP_PATHS', '/api/v1/auth/refresh');

    vi.doMock('@runtime-config/middleware.ts', () => ({
      default: {
        responders: {
          auth: async (_req: unknown, res: any, context: any) => {
            res.setStatus(418).json({
              source: 'auth-responder',
              reason: context.reason,
              message: context.message,
            });
          },
          jwt: async (_req: unknown, res: any, context: any) => {
            res.setStatus(499).json({
              source: 'jwt-responder',
              reason: context.reason,
              message: context.message,
            });
          },
        },
      },
    }));

    const fetch = await loadHandler('worker-auth-jwt-override');

    const authResponse = await fetch(
      new Request('http://localhost/api/v1/users/create', { method: 'GET' }),
      {},
      {}
    );

    expect(authResponse.status).toBe(418);
    await expect(authResponse.json()).resolves.toEqual({
      source: 'auth-responder',
      reason: 'missing_authorization_header',
      message: 'Unauthorized',
    });

    const jwtResponse = await fetch(
      new Request('http://localhost/api/v1/auth/refresh', {
        method: 'POST',
        headers: { authorization: 'Bearer bad-token' },
      }),
      {},
      {}
    );

    expect(jwtResponse.status).toBe(499);
    await expect(jwtResponse.json()).resolves.toEqual({
      source: 'jwt-responder',
      reason: 'invalid_token',
      message: 'Invalid or expired token',
    });
  });
});
