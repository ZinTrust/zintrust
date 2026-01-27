/* eslint-disable max-nested-callbacks */
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { registerRoutes as registerFrameworkFallbackRoutes } from '@/routes/api';
import { registerBroadcastRoutes } from '@/routes/broadcast';
import { registerStorageRoutes } from '@/routes/storage';
import { Router } from '@/routing/Router';
import { registerHealthRoutes } from '@routes/health';

vi.mock('@config/env', () => ({
  Env: {
    NODE_ENV: 'test',
    APP_NAME: 'zintrust-test',
    DB_CONNECTION: 'sqlite',
    get: vi.fn((_key: string, defaultVal?: string) => defaultVal ?? ''),
    getInt: vi.fn((_key: string, defaultVal?: number) => defaultVal ?? 0),
    getBool: vi.fn((_key: string, defaultVal?: boolean) => defaultVal ?? false),
  },
}));

vi.mock('@/config', () => ({
  appConfig: {
    environment: 'test',
  },
}));

vi.mock('@config/app', () => ({
  appConfig: {
    environment: 'test',
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@orm/Database', () => ({
  useDatabase: vi.fn(),
}));

vi.mock('@orm/QueryBuilder', () => ({
  QueryBuilder: {
    ping: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/health/RuntimeHealthProbes', () => ({
  RuntimeHealthProbes: {
    pingKvCache: vi.fn().mockResolvedValue(null),
    getCacheDriverName: vi.fn().mockReturnValue('memory'),
  },
}));

vi.mock('@broadcast/Broadcast', () => ({
  Broadcast: {
    send: vi.fn(async () => ({ ok: true })),
  },
}));

vi.mock('@storage/LocalSignedUrl', () => ({
  LocalSignedUrl: {
    verifyToken: vi.fn(),
  },
}));

vi.mock('@storage/index', () => ({
  Storage: {
    get: vi.fn(),
  },
}));

vi.mock('@app/Controllers/UserQueryBuilderController', () => {
  const controller = {
    index: vi.fn(),
    store: vi.fn(),
    show: vi.fn(),
    update: vi.fn(),
    destroy: vi.fn(),
    create: vi.fn(),
    edit: vi.fn(),
  };

  return {
    UserQueryBuilderController: {
      create: () => controller,
    },
  };
});

import { RuntimeHealthProbes } from '@/health/RuntimeHealthProbes';
import { Broadcast } from '@broadcast/Broadcast';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { useDatabase } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';
import { LocalSignedUrl } from '@storage/LocalSignedUrl';
import { Storage } from '@storage/index';

const createRes = () => {
  return {
    setStatus: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as any;
};

describe('src/routes/* patch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDatabase as unknown as Mock).mockReturnValue({});
    (QueryBuilder.ping as unknown as Mock).mockResolvedValue(undefined);
    (RuntimeHealthProbes.pingKvCache as unknown as Mock).mockResolvedValue(null);
    (RuntimeHealthProbes.getCacheDriverName as unknown as Mock).mockReturnValue('memory');
  });

  describe('health', () => {
    it('covers /health connect branch + uptime fallback', async () => {
      const originalUptime = process.uptime;
      (process as any).uptime = undefined;

      const connect = vi.fn().mockResolvedValue(undefined);
      const isConnected = vi.fn().mockReturnValue(false);
      (useDatabase as unknown as Mock).mockReturnValue({ connect, isConnected });

      try {
        const router = Router.createRouter();
        registerHealthRoutes(router);

        const match = Router.match(router, 'GET', '/health');
        if (match === null) throw new Error('Expected /health route');

        const res = createRes();
        await match.handler({} as any, res);

        expect(connect).toHaveBeenCalledTimes(1);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'healthy', uptime: 0 })
        );
      } finally {
        (process as any).uptime = originalUptime;
      }
    });

    it('handles /health success', async () => {
      const router = Router.createRouter();
      registerHealthRoutes(router);

      const match = Router.match(router, 'GET', '/health');
      if (match === null) throw new Error('Expected /health route');

      const res = createRes();
      await match.handler({} as any, res);

      expect(QueryBuilder.ping).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'healthy', database: 'connected', environment: 'test' })
      );
    });

    it('handles /health failure and hides error in prod', async () => {
      (Env as unknown as { NODE_ENV?: string }).NODE_ENV = 'production';
      (QueryBuilder.ping as unknown as Mock).mockRejectedValueOnce(new Error('DB down'));

      const router = Router.createRouter();
      registerHealthRoutes(router);

      const match = Router.match(router, 'GET', '/health');
      if (match === null) throw new Error('Expected /health route');

      const res = createRes();
      await match.handler({} as any, res);

      expect(Logger.error).toHaveBeenCalled();
      expect(res.setStatus).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Service unavailable' })
      );
    });

    it('handles /health/ready success with cache omitted when null', async () => {
      const router = Router.createRouter();
      registerHealthRoutes(router);

      const match = Router.match(router, 'GET', '/health/ready');
      if (match === null) throw new Error('Expected /health/ready route');

      const res = createRes();
      await match.handler({} as any, res);

      expect(QueryBuilder.ping).toHaveBeenCalledTimes(1);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ready',
          dependencies: expect.objectContaining({
            database: expect.objectContaining({ status: 'ready' }),
          }),
        })
      );

      const payload = res.json.mock.calls[0][0];
      expect(payload.dependencies.cache).toBeUndefined();
    });

    it('handles /health/ready success with cache included (non-null)', async () => {
      const connect = vi.fn().mockResolvedValue(undefined);
      const isConnected = vi.fn().mockReturnValue(false);
      (useDatabase as unknown as Mock).mockReturnValue({ connect, isConnected });
      (RuntimeHealthProbes.pingKvCache as unknown as Mock).mockResolvedValue(12);

      const router = Router.createRouter();
      registerHealthRoutes(router);

      const match = Router.match(router, 'GET', '/health/ready');
      if (match === null) throw new Error('Expected /health/ready route');

      const res = createRes();
      await match.handler({} as any, res);

      expect(connect).toHaveBeenCalledTimes(1);

      const payload = res.json.mock.calls[0][0];
      expect(payload.dependencies.cache).toBeDefined();
      expect(payload.dependencies.cache.responseTime).toBe(12);
    });

    it('handles /health/ready failure and includes cache when kv', async () => {
      (RuntimeHealthProbes.getCacheDriverName as unknown as Mock).mockReturnValue('kv');
      (QueryBuilder.ping as unknown as Mock).mockRejectedValueOnce(new Error('boom'));

      const router = Router.createRouter();
      registerHealthRoutes(router);

      const match = Router.match(router, 'GET', '/health/ready');
      if (match === null) throw new Error('Expected /health/ready route');

      const res = createRes();
      await match.handler({} as any, res);

      expect(res.setStatus).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'not_ready',
          dependencies: expect.objectContaining({ cache: expect.anything() }),
        })
      );
    });

    it('handles /health/live', async () => {
      const router = Router.createRouter();
      registerHealthRoutes(router);

      const match = Router.match(router, 'GET', '/health/live');
      if (match === null) throw new Error('Expected /health/live route');

      const res = createRes();
      await match.handler({} as any, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'alive', uptime: expect.any(Number) })
      );
    });
  });

  describe('broadcast', () => {
    it('handles /broadcast/health and /broadcast/send (invalid + valid)', async () => {
      const router = Router.createRouter();
      registerBroadcastRoutes(router);

      const health = Router.match(router, 'GET', '/broadcast/health');
      if (health === null) throw new Error('Expected /broadcast/health');

      const res1 = createRes();
      await health.handler({} as any, res1);
      expect(res1.json).toHaveBeenCalledWith({ ok: true });

      const send = Router.match(router, 'POST', '/broadcast/send');
      if (send === null) throw new Error('Expected /broadcast/send');

      const res2 = createRes();
      await send.handler({ body: { data: { x: 1 } } } as any, res2);
      expect(res2.setStatus).toHaveBeenCalledWith(400);

      const res3 = createRes();
      await send.handler({ body: { channel: 'c', event: 'e', data: { x: 1 } } } as any, res3);
      expect(Broadcast.send).toHaveBeenCalledWith('c', 'e', { x: 1 });
      expect(res3.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
    });
  });

  describe('storage', () => {
    it('handles /storage/download branches', async () => {
      const router = Router.createRouter();
      registerStorageRoutes(router);

      const match = Router.match(router, 'GET', '/storage/download');
      if (match === null) throw new Error('Expected /storage/download');

      const resMissing = createRes();
      await match.handler({ getQueryParam: vi.fn(() => '') } as any, resMissing);
      expect(resMissing.setStatus).toHaveBeenCalledWith(400);

      (Env.get as unknown as Mock).mockImplementation((key: string, def?: string) => {
        if (key === 'APP_KEY') return '';
        return def ?? '';
      });
      const resNoKey = createRes();
      await match.handler({ getQueryParam: vi.fn(() => 't') } as any, resNoKey);
      expect(resNoKey.setStatus).toHaveBeenCalledWith(500);

      (Env.get as unknown as Mock).mockImplementation((key: string, def?: string) => {
        if (key === 'APP_KEY') return 'k';
        return def ?? '';
      });
      (LocalSignedUrl.verifyToken as unknown as Mock).mockReturnValueOnce({
        disk: 's3',
        key: 'x',
      });
      const resBadDisk = createRes();
      await match.handler({ getQueryParam: vi.fn(() => 't') } as any, resBadDisk);
      expect(resBadDisk.setStatus).toHaveBeenCalledWith(400);

      (LocalSignedUrl.verifyToken as unknown as Mock).mockReturnValueOnce({
        disk: 'local',
        key: 'a/b.txt',
      });
      (Storage.get as unknown as Mock).mockResolvedValueOnce(Buffer.from('hello'));
      const resOk = createRes();
      await match.handler({ getQueryParam: vi.fn(() => 't') } as any, resOk);
      expect(resOk.setStatus).toHaveBeenCalledWith(200);

      (LocalSignedUrl.verifyToken as unknown as Mock).mockImplementationOnce(() => {
        throw new Error('invalid');
      });
      const resInvalid = createRes();
      await match.handler({ getQueryParam: vi.fn(() => 't') } as any, resInvalid);
      expect(resInvalid.setStatus).toHaveBeenCalledWith(403);
    });
  });

  describe('framework fallback api', () => {
    it('exercises src/routes/api handlers', async () => {
      const router = Router.createRouter();
      registerFrameworkFallbackRoutes(router);

      const root = Router.match(router, 'GET', '/');
      if (root === null) throw new Error('Expected /');
      const resRoot = createRes();
      await root.handler({} as any, resRoot);

      const login = Router.match(router, 'POST', '/api/v1/auth/login');
      if (login === null) throw new Error('Expected login');
      const resLogin = createRes();
      await login.handler({} as any, resLogin);

      const reg = Router.match(router, 'POST', '/api/v1/auth/register');
      if (reg === null) throw new Error('Expected register');
      const resReg = createRes();
      await reg.handler({} as any, resReg);

      const profileGet = Router.match(router, 'GET', '/api/v1/profile');
      if (profileGet === null) throw new Error('Expected profile get');
      const resProfileGet = createRes();
      await profileGet.handler({} as any, resProfileGet);

      const profilePut = Router.match(router, 'PUT', '/api/v1/profile');
      if (profilePut === null) throw new Error('Expected profile put');
      const resProfilePut = createRes();
      await profilePut.handler({} as any, resProfilePut);

      const posts = Router.match(router, 'GET', '/api/v1/posts');
      if (posts === null) throw new Error('Expected posts');
      const resPosts = createRes();
      await posts.handler({} as any, resPosts);

      const post = Router.match(router, 'GET', '/api/v1/posts/123');
      if (post === null) throw new Error('Expected post');
      const resPost = createRes();
      const reqPost = { getParam: vi.fn(() => '123') } as any;
      await post.handler(reqPost, resPost);

      const adminDash = Router.match(router, 'GET', '/admin/dashboard');
      if (adminDash === null) throw new Error('Expected admin dashboard');
      const resAdmin = createRes();
      await adminDash.handler({} as any, resAdmin);

      const adminUsers = Router.match(router, 'GET', '/admin/users');
      if (adminUsers === null) throw new Error('Expected admin users');
      const resAdminUsers = createRes();
      await adminUsers.handler({} as any, resAdminUsers);

      expect(resRoot.json).toHaveBeenCalled();
      expect(resLogin.json).toHaveBeenCalled();
      expect(resReg.json).toHaveBeenCalled();
      expect(resProfileGet.json).toHaveBeenCalledWith({ message: 'Get user profile' });
      expect(resProfilePut.json).toHaveBeenCalledWith({ message: 'Update user profile' });
      expect(resPosts.json).toHaveBeenCalledWith({ data: [] });
      expect(resPost.json).toHaveBeenCalledWith({ data: { id: '123' } });
      expect(resAdmin.json).toHaveBeenCalledWith({ message: 'Admin dashboard' });
      expect(resAdminUsers.json).toHaveBeenCalledWith({ data: [] });
    });
  });
});
