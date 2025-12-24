import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { useDatabase } from '@orm/Database';
import { registerRoutes } from '@routes/api';
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
  let router: {
    get: Mock;
    post: Mock;
    put: Mock;
    delete: Mock;
    group: Mock;
    resource: Mock;
  };
  let mockDb: { query: Mock };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup Router mock
    router = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      group: vi.fn((options: unknown, callback: (r: unknown) => void) => {
        String(options);
        callback(router);
      }),
      resource: vi.fn(),
    };

    // Setup Database mock
    mockDb = {
      query: vi.fn(),
    };
    (useDatabase as Mock).mockReturnValue(mockDb);
  });

  it('should register all routes', () => {
    registerRoutes(router);

    // Verify public routes
    expect(router.get).toHaveBeenCalledWith('/', expect.any(Function));
    expect(router.get).toHaveBeenCalledWith('/health', expect.any(Function));

    // Verify API v1 group
    expect((router as any).group).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: '/api/v1' }),
      expect.any(Function)
    );

    // Verify Admin group
    expect((router as any).group).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: '/admin' }),
      expect.any(Function)
    );
  });

  describe('Public Routes', () => {
    it('should handle root route', async () => {
      registerRoutes(router);
      const rootMatch = (router.get as Mock).mock.calls.find((call) => call[0] === '/');
      if (!rootMatch) {
        throw new Error('Expected root route handler to be registered');
      }
      const rootHandler = rootMatch[1] as (req: unknown, res: { json: Mock }) => Promise<void>;

      const req = {} as unknown as Record<string, unknown>;
      const res = {
        json: vi.fn(),
      } as unknown as { json: Mock };

      await rootHandler(req, res);

      expect(res.json).toHaveBeenCalledWith({
        framework: 'Zintrust Framework',
        version: '0.1.0',
        env: 'test',
        database: 'sqlite',
      });
    });

    it('should handle health check success', async () => {
      registerRoutes(router);
      const healthMatch = (router.get as Mock).mock.calls.find((call) => call[0] === '/health');
      if (!healthMatch) {
        throw new Error('Expected /health route handler to be registered');
      }
      const healthHandler = healthMatch[1] as (req: unknown, res: { json: Mock }) => Promise<void>;

      const req = {} as unknown as Record<string, unknown>;
      const res = {
        json: vi.fn(),
      } as unknown as { json: Mock };

      await healthHandler(req, res);

      expect(mockDb.query).toHaveBeenCalledWith('SELECT 1');
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'healthy',
          database: 'connected',
        })
      );
    });

    it('should default environment to development when Env.NODE_ENV is undefined', async () => {
      registerRoutes(router);
      const healthMatch = (router.get as Mock).mock.calls.find((call) => call[0] === '/health');
      if (!healthMatch) {
        throw new Error('Expected /health route handler to be registered');
      }
      const healthHandler = healthMatch[1] as (req: unknown, res: { json: Mock }) => Promise<void>;

      const previousEnv = Env.NODE_ENV;
      // cover the nullish-coalescing fallback branch
      (Env as unknown as { NODE_ENV?: string }).NODE_ENV = undefined;

      const req = {} as unknown as Record<string, unknown>;
      const res = {
        json: vi.fn(),
      } as unknown as { json: Mock };

      await healthHandler(req, res);

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

      registerRoutes(router);
      const healthMatch = (router.get as Mock).mock.calls.find((call) => call[0] === '/health');
      if (!healthMatch) {
        throw new Error('Expected /health route handler to be registered');
      }
      const healthHandler = healthMatch[1] as (
        req: unknown,
        res: { setStatus: Mock; json: Mock }
      ) => Promise<void>;

      const req = {} as unknown as Record<string, unknown>;
      const res = {
        setStatus: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as { setStatus: Mock; json: Mock };

      await healthHandler(req, res);

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

      registerRoutes(router);
      const healthMatch = (router.get as Mock).mock.calls.find((call) => call[0] === '/health');
      if (!healthMatch) {
        throw new Error('Expected /health route handler to be registered');
      }
      const healthHandler = healthMatch[1] as (
        req: unknown,
        res: { setStatus: Mock; json: Mock }
      ) => Promise<void>;

      const req = {} as unknown as Record<string, unknown>;
      const res = {
        setStatus: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as { setStatus: Mock; json: Mock };

      await healthHandler(req, res);

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
    });
  });

  describe('API V1 Routes', () => {
    it('should register auth routes', async () => {
      registerRoutes(router);

      const loginMatch = (router.post as Mock).mock.calls.find((call) => call[0] === '/auth/login');
      const registerMatch = (router.post as Mock).mock.calls.find(
        (call) => call[0] === '/auth/register'
      );
      if (!loginMatch || !registerMatch) {
        throw new Error('Expected auth route handlers to be registered');
      }
      const loginHandler = loginMatch[1] as (req: unknown, res: { json: Mock }) => Promise<void>;
      const registerHandler = registerMatch[1] as (
        req: unknown,
        res: { json: Mock }
      ) => Promise<void>;

      const req = {} as unknown as Record<string, unknown>;
      const res = { json: vi.fn() } as unknown as { json: Mock };

      await loginHandler(req, res);
      expect(res.json).toHaveBeenCalledWith({ message: 'Login endpoint' });

      await registerHandler(req, res);
      expect(res.json).toHaveBeenCalledWith({ message: 'Register endpoint' });
    });

    it('should register user resource', () => {
      registerRoutes(router);
      expect((router as any).resource).toHaveBeenCalledWith('users', expect.any(Object));
    });

    it('should register profile routes', async () => {
      registerRoutes(router);

      const getProfileMatch = (router.get as Mock).mock.calls.find(
        (call) => call[0] === '/profile'
      );
      const putProfileMatch = (router.put as Mock).mock.calls.find(
        (call) => call[0] === '/profile'
      );
      if (!getProfileMatch || !putProfileMatch) {
        throw new Error('Expected /profile handlers to be registered');
      }
      const getProfileHandler = getProfileMatch[1] as (
        req: unknown,
        res: { json: Mock }
      ) => Promise<void>;
      const putProfileHandler = putProfileMatch[1] as (
        req: unknown,
        res: { json: Mock }
      ) => Promise<void>;

      const req = {} as unknown as Record<string, unknown>;
      const res = { json: vi.fn() } as unknown as { json: Mock };

      await getProfileHandler(req, res);
      expect(res.json).toHaveBeenCalledWith({ message: 'Get user profile' });

      await putProfileHandler(req, res);
      expect(res.json).toHaveBeenCalledWith({ message: 'Update user profile' });
    });

    it('should register posts routes', async () => {
      registerRoutes(router);

      const getPostsMatch = (router.get as Mock).mock.calls.find((call) => call[0] === '/posts');
      const getPostMatch = (router.get as Mock).mock.calls.find((call) => call[0] === '/posts/:id');
      if (!getPostsMatch || !getPostMatch) {
        throw new Error('Expected posts route handlers to be registered');
      }
      const getPostsHandler = getPostsMatch[1] as (
        req: unknown,
        res: { json: Mock }
      ) => Promise<void>;
      const getPostHandler = getPostMatch[1] as (
        req: { getParam: Mock },
        res: { json: Mock }
      ) => Promise<void>;

      const req = { getParam: vi.fn().mockReturnValue('123') } as unknown as { getParam: Mock };
      const res = { json: vi.fn() } as unknown as { json: Mock };

      await getPostsHandler(req, res);
      expect(res.json).toHaveBeenCalledWith({ data: [] });

      await getPostHandler(req, res);
      expect(req.getParam).toHaveBeenCalledWith('id');
      expect(res.json).toHaveBeenCalledWith({ data: { id: '123' } });
    });
  });

  describe('Admin Routes', () => {
    it('should register admin routes', async () => {
      registerRoutes(router);

      const dashboardMatch = (router.get as Mock).mock.calls.find(
        (call) => call[0] === '/dashboard'
      );
      const usersMatch = (router.get as Mock).mock.calls.find((call) => call[0] === '/users');
      if (!dashboardMatch || !usersMatch) {
        throw new Error('Expected admin route handlers to be registered');
      }
      const dashboardHandler = dashboardMatch[1] as (
        req: unknown,
        res: { json: Mock }
      ) => Promise<void>;
      const usersHandler = usersMatch[1] as (req: unknown, res: { json: Mock }) => Promise<void>;

      const req = {} as unknown as Record<string, unknown>;
      const res = { json: vi.fn() } as unknown as { json: Mock };

      await dashboardHandler(req, res);
      expect(res.json).toHaveBeenCalledWith({ message: 'Admin dashboard' });

      await usersHandler(req, res);
      expect(res.json).toHaveBeenCalledWith({ data: [] });
    });
  });
});
