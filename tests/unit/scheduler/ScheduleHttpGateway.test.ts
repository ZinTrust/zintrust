import { Router } from '@core-routes/Router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

type EnvApi = {
  get: Mock;
  getInt: Mock;
  getBool: Mock;
  APP_KEY: string;
  APP_NAME: string;
};

const mocked = vi.hoisted(() => {
  const Env: EnvApi = {
    get: vi.fn(),
    getInt: vi.fn(),
    getBool: vi.fn(),
    APP_KEY: 'app-key',
    APP_NAME: 'ZinTrust',
  };

  return {
    Env,
    signedVerify: vi.fn(),
    listWithState: vi.fn(async () => []),
    runOnce: vi.fn(async () => undefined),
    loggerError: vi.fn(),
  };
});

vi.mock('@config/env', () => ({
  Env: mocked.Env,
}));

vi.mock('@config/logger', () => ({
  Logger: {
    error: mocked.loggerError,
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@security/SignedRequest', () => ({
  SignedRequest: {
    verify: mocked.signedVerify,
  },
}));

vi.mock('@scheduler/SchedulerRuntime', () => ({
  SchedulerRuntime: {
    listWithState: (...args: any[]) => mocked.listWithState(...args),
    runOnce: (...args: any[]) => mocked.runOnce(...args),
  },
}));

const createReqRes = (input: {
  path?: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  rawBodyText?: string;
}) => {
  const hasRawBodyText = typeof input.rawBodyText === 'string';
  const req: any = {
    getPath: () => input.path ?? '/api/_sys/schedule/rpc',
    getMethod: () => input.method ?? 'POST',
    getHeaders: () => input.headers ?? {},
    getBody: () => input.body,
    body: input.body,
    context: hasRawBodyText ? { rawBodyText: input.rawBodyText } : {},
  };

  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };

  return { req, res };
};

describe('ScheduleHttpGateway', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocked.Env.APP_KEY = 'app-key';
    mocked.Env.APP_NAME = 'ZinTrust';

    mocked.Env.get.mockImplementation((_key: string, defaultVal?: string) => defaultVal ?? '');
    mocked.Env.getInt.mockImplementation((_key: string, defaultVal?: number) => defaultVal ?? 0);
    mocked.Env.getBool.mockImplementation(
      (_key: string, defaultVal?: boolean) => defaultVal ?? false
    );

    mocked.listWithState.mockResolvedValue([]);
    mocked.runOnce.mockResolvedValue(undefined);

    mocked.signedVerify.mockImplementation(async (args: any) => {
      const keyId = String(args.headers?.['x-zt-key-id'] ?? '');
      const nonce = String(args.headers?.['x-zt-nonce'] ?? '');

      const okNonce = await args.verifyNonce(keyId, nonce);
      if (okNonce === false) return { ok: false, code: 'REPLAYED', message: 'Replay detected' };

      const secret = args.getSecretForKeyId(keyId);
      if (typeof secret !== 'string') {
        return { ok: false, code: 'UNKNOWN_KEY', message: 'Unknown key' };
      }

      return { ok: true };
    });
  });

  it('registers the route using normalized basePath and optional middleware', async () => {
    mocked.Env.get.mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'SCHEDULE_HTTP_PROXY_PATH') return 'internal/schedule/rpc';
      if (key === 'SCHEDULE_HTTP_PROXY_MIDDLEWARE') return 'auth,jwt';
      return defaultVal ?? '';
    });

    const { ScheduleHttpGateway } = await import('@/scheduler/ScheduleHttpGateway');
    const router = Router.createRouter();
    ScheduleHttpGateway.create().registerRoutes(router);

    const match = Router.match(router, 'POST', '/internal/schedule/rpc');
    expect(match).not.toBeNull();
    expect(match?.middleware).toEqual(['auth', 'jwt']);
  });

  it('returns 500 CONFIG_ERROR when signing credentials are missing', async () => {
    mocked.Env.APP_KEY = '';
    mocked.Env.APP_NAME = '';
    mocked.Env.get.mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'SCHEDULE_HTTP_PROXY_KEY_ID') return '';
      if (key === 'SCHEDULE_HTTP_PROXY_KEY') return '';
      return defaultVal ?? '';
    });

    const { ScheduleHttpGateway } = await import('@/scheduler/ScheduleHttpGateway');
    const router = Router.createRouter();
    ScheduleHttpGateway.create().registerRoutes(router);

    const match = Router.match(router, 'POST', '/api/_sys/schedule/rpc');
    if (match === null) throw new Error('Expected route to be registered');

    const { req, res } = createReqRes({
      headers: {
        'x-zt-key-id': 'k',
        'x-zt-nonce': 'n',
        'x-zt-timestamp': '1',
      },
      body: { action: 'list', requestId: 'r1' },
    });

    await match.handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        requestId: 'r1',
        error: expect.objectContaining({ code: 'CONFIG_ERROR' }),
      })
    );
  });

  it('prevents nonce replay and returns 401 on REPLAYED', async () => {
    mocked.Env.get.mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'SCHEDULE_HTTP_PROXY_KEY_ID') return 'key-1';
      if (key === 'SCHEDULE_HTTP_PROXY_KEY') return 'secret-1';
      return defaultVal ?? '';
    });

    const { ScheduleHttpGateway } = await import('@/scheduler/ScheduleHttpGateway');
    const router = Router.createRouter();
    ScheduleHttpGateway.create().registerRoutes(router);
    const match = Router.match(router, 'POST', '/api/_sys/schedule/rpc');
    if (match === null) throw new Error('Expected route to be registered');

    const reqInput = {
      headers: {
        'x-zt-key-id': 'key-1',
        'x-zt-nonce': 'nonce-1',
        'x-zt-timestamp': '1',
      },
      body: { action: 'list', requestId: 'r1' },
    };

    const first = createReqRes(reqInput);
    await match.handler(first.req, first.res);
    expect(first.res.status).not.toHaveBeenCalledWith(401);

    const second = createReqRes(reqInput);
    await match.handler(second.req, second.res);

    expect(second.res.status).toHaveBeenCalledWith(401);
    expect(second.res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        requestId: 'r1',
        error: expect.objectContaining({ code: 'REPLAYED' }),
      })
    );
  });

  it('handles list and run actions and returns structured failures', async () => {
    mocked.Env.get.mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'SCHEDULE_HTTP_PROXY_KEY_ID') return 'key-1';
      if (key === 'SCHEDULE_HTTP_PROXY_KEY') return 'secret-1';
      return defaultVal ?? '';
    });

    mocked.listWithState.mockResolvedValue([
      { schedule: { name: 'a', enabled: true } as any, state: { lastRunAt: 1 } as any },
    ]);

    const { ScheduleHttpGateway } = await import('@/scheduler/ScheduleHttpGateway');
    const router = Router.createRouter();
    ScheduleHttpGateway.create().registerRoutes(router);
    const match = Router.match(router, 'POST', '/api/_sys/schedule/rpc');
    if (match === null) throw new Error('Expected route to be registered');

    // list
    {
      const { req, res } = createReqRes({
        headers: {
          'x-zt-key-id': 'key-1',
          'x-zt-nonce': 'nonce-2',
          'x-zt-timestamp': '1',
        },
        body: { action: 'list', requestId: 'r1' },
      });
      await match.handler(req, res);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true, requestId: 'r1', result: expect.any(Array) })
      );
    }

    // run missing payload.name
    {
      const { req, res } = createReqRes({
        headers: {
          'x-zt-key-id': 'key-1',
          'x-zt-nonce': 'nonce-3',
          'x-zt-timestamp': '1',
        },
        body: { action: 'run', requestId: 'r2', payload: { name: '   ' } },
      });
      await match.handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          requestId: 'r2',
          error: expect.objectContaining({ code: 'VALIDATION_ERROR' }),
        })
      );
    }

    // run internal error
    {
      mocked.runOnce.mockRejectedValueOnce(new Error('boom'));
      const { req, res } = createReqRes({
        headers: {
          'x-zt-key-id': 'key-1',
          'x-zt-nonce': 'nonce-4',
          'x-zt-timestamp': '1',
        },
        body: { action: 'run', requestId: 'r3', payload: { name: 'x' } },
      });
      await match.handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          requestId: 'r3',
          error: expect.objectContaining({ code: 'INTERNAL_ERROR' }),
        })
      );
    }
  });
});
