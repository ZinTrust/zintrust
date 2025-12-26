import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { useDatabase } from '@orm/Database';
import { registerRoutes } from '@routes/api';
import { Router } from '@routing/Router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Mock dependencies
vi.mock('@app/Controllers/UserController', () => {
  const createMockUserController = () => ({
    index: vi.fn(),
    create: vi.fn(),
    store: vi.fn(),
    show: vi.fn(),
    edit: vi.fn(),
    update: vi.fn(),
    destroy: vi.fn(),
  });

  return {
    UserController: {
      create: () => createMockUserController(),
    },
  };
});
vi.mock('@config/env', () => ({
  Env: {
    NODE_ENV: 'test',
  },
}));
vi.mock('@config/logger');
vi.mock('@orm/Database');

describe('Routes API', () => {
  let mockDb: { query: Mock };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup Database mock
    mockDb = {
      query: vi.fn(),
    };
    (useDatabase as Mock).mockReturnValue(mockDb);
  });

  it('should register all routes', () => {
    const router = Router.createRouter();
    registerRoutes(router);

    expect(Router.match(router, 'GET', '/')).not.toBeNull();
    expect(Router.match(router, 'GET', '/health')).not.toBeNull();
    expect(Router.match(router, 'GET', '/health/live')).not.toBeNull();
    expect(Router.match(router, 'GET', '/health/ready')).not.toBeNull();
    expect(Router.match(router, 'POST', '/api/v1/auth/login')).not.toBeNull();
    expect(Router.match(router, 'GET', '/admin/dashboard')).not.toBeNull();
  });

  describe('Public Routes', () => {
    it('should handle root route', async () => {
      const router = Router.createRouter();
      registerRoutes(router);

      const rootMatch = Router.match(router, 'GET', '/');
      if (rootMatch === null) throw new Error('Expected root route handler to be registered');

      const req = {} as unknown as Record<string, unknown>;
      const res = {
        json: vi.fn(),
      } as unknown as { json: Mock };

      await rootMatch.handler(req as any, res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          framework: 'Zintrust Framework',
          version: '0.1.0',
          env: 'test',
          database: 'sqlite',
        })
      );
    });

    it('should handle health check success', async () => {
      const router = Router.createRouter();
      registerRoutes(router);
      const healthMatch = Router.match(router, 'GET', '/health');
      if (healthMatch === null) throw new Error('Expected /health route handler to be registered');

      const req = {} as unknown as Record<string, unknown>;
      const res = {
        json: vi.fn(),
      } as unknown as { json: Mock };

      await healthMatch.handler(req as any, res as any);

      expect(mockDb.query).toHaveBeenCalledWith('SELECT 1', [], true);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          database: 'connected',
        })
      );
    });

    it('should default environment to development when Env.NODE_ENV is undefined', async () => {
      const router = Router.createRouter();
      registerRoutes(router);
      const healthMatch = Router.match(router, 'GET', '/health');
      if (healthMatch === null) throw new Error('Expected /health route handler to be registered');

      const previousEnv = Env.NODE_ENV;
      // cover the nullish-coalescing fallback branch
      (Env as unknown as { NODE_ENV?: string }).NODE_ENV = undefined;

      const req = {} as unknown as Record<string, unknown>;
      const res = {
        json: vi.fn(),
      } as unknown as { json: Mock };

      await healthMatch.handler(req as any, res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: 'development',
        })
      );

      (Env as unknown as { NODE_ENV?: string }).NODE_ENV = previousEnv;
    });

    it('should handle health check failure', async () => {
      const error = new Error('DB Error');
      mockDb.query.mockRejectedValue(error);

      const router = Router.createRouter();
      registerRoutes(router);
      const healthMatch = Router.match(router, 'GET', '/health');
      if (healthMatch === null) throw new Error('Expected /health route handler to be registered');

      const req = {} as unknown as Record<string, unknown>;
      const res = {
        setStatus: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as { setStatus: Mock; json: Mock };

      await healthMatch.handler(req as any, res as any);

      expect(Logger.error).toHaveBeenCalledWith('Health check failed:', error);
      expect(res.setStatus).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'unhealthy',
          database: 'disconnected',
          error: 'DB Error',
        })
      );
    });

    it('should hide error details in production mode', async () => {
      const error = new Error('DB Error');
      mockDb.query.mockRejectedValue(error);

      const previousNodeEnv = process.env['NODE_ENV'];
      process.env['NODE_ENV'] = 'production';

      const previousEnvNodeEnv = Env.NODE_ENV;
      (Env as unknown as { NODE_ENV?: string }).NODE_ENV = 'production';

      const router = Router.createRouter();
      registerRoutes(router);
      const healthMatch = Router.match(router, 'GET', '/health');
      if (healthMatch === null) throw new Error('Expected /health route handler to be registered');

      const req = {} as unknown as Record<string, unknown>;
      const res = {
        setStatus: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as { setStatus: Mock; json: Mock };

      await healthMatch.handler(req as any, res as any);

      expect(res.setStatus).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Service unavailable',
        })
      );

      if (previousNodeEnv === undefined) {
        delete process.env['NODE_ENV'];
      } else {
        process.env['NODE_ENV'] = previousNodeEnv;
      }

      (Env as unknown as { NODE_ENV?: string }).NODE_ENV = previousEnvNodeEnv;
    });

    it('should handle liveness check', async () => {
      const router = Router.createRouter();
      registerRoutes(router);

      const liveMatch = Router.match(router, 'GET', '/health/live');
      if (liveMatch === null)
        throw new Error('Expected /health/live route handler to be registered');

      const res = {
        json: vi.fn(),
      } as unknown as { json: Mock };

      await liveMatch.handler({} as any, res as any);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'alive',
        })
      );
    });

    it('should handle readiness check success', async () => {
      const router = Router.createRouter();
      registerRoutes(router);

      const readyMatch = Router.match(router, 'GET', '/health/ready');
      if (readyMatch === null)
        throw new Error('Expected /health/ready route handler to be registered');

      const res = {
        json: vi.fn(),
      } as unknown as { json: Mock };

      await readyMatch.handler({} as any, res as any);

      expect(mockDb.query).toHaveBeenCalledWith('SELECT 1', [], true);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'ready',
          dependencies: expect.objectContaining({
            database: expect.objectContaining({
              status: 'ready',
            }),
          }),
        })
      );
    });

    it('should handle readiness check failure', async () => {
      const error = new Error('DB Error');
      mockDb.query.mockRejectedValue(error);

      const router = Router.createRouter();
      registerRoutes(router);

      const readyMatch = Router.match(router, 'GET', '/health/ready');
      if (readyMatch === null)
        throw new Error('Expected /health/ready route handler to be registered');

      const res = {
        setStatus: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as { setStatus: Mock; json: Mock };

      await readyMatch.handler({} as any, res as any);

      expect(Logger.error).toHaveBeenCalledWith('Readiness check failed:', error);
      expect(res.setStatus).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'not_ready',
          error: 'DB Error',
        })
      );
    });
  });

  describe('API V1 Routes', () => {
    it('should expose route params via Router.match result', async () => {
      const router = Router.createRouter();
      registerRoutes(router);

      const match = Router.match(router, 'GET', '/api/v1/posts/123');
      expect(match).not.toBeNull();
      expect(match?.params).toEqual({ id: '123' });

      let params: Record<string, string> = {};
      const req = {
        setParams(p: Record<string, string>): void {
          params = p;
        },
        getParam(key: string): string | undefined {
          return params[key];
        },
      } as unknown as {
        setParams: (p: Record<string, string>) => void;
        getParam: (k: string) => string | undefined;
      };

      req.setParams(match?.params ?? {});

      const res = { json: vi.fn() } as unknown as { json: Mock };
      await match?.handler(req as any, res as any);

      expect(res.json).toHaveBeenCalledWith({ data: { id: '123' } });
    });
  });
});
