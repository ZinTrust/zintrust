import { Router } from '@core-routes/Router';
import { registerRoutes } from '@routes/api';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Mock dependencies
vi.mock('@app/Controllers/UserQueryBuilderController', () => {
  const createMockUserController = () => ({
    index: vi.fn(),
    create: vi.fn(),
    store: vi.fn(),
    fill: vi.fn(),
    show: vi.fn(),
    edit: vi.fn(),
    update: vi.fn(),
    destroy: vi.fn(),
  });

  return {
    UserQueryBuilderController: {
      create: () => createMockUserController(),
    },
  };
});
vi.mock('@config/env', () => ({
  Env: {
    get: vi.fn((_key: string, defaultVal?: string) => defaultVal ?? ''),
    getInt: vi.fn((_key: string, defaultVal?: number) => defaultVal ?? 0),
    getBool: vi.fn((_key: string, defaultVal?: boolean) => defaultVal ?? false),
    NODE_ENV: 'test',
    PORT: 3000,
  },
}));
vi.mock('@config/logger');

describe('Routes API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register all routes', () => {
    const router = Router.createRouter();
    registerRoutes(router);

    expect(Router.match(router, 'GET', '/')).not.toBeNull();
    expect(Router.match(router, 'GET', '/broadcast/health')).not.toBeNull();
    expect(Router.match(router, 'POST', '/broadcast/send')).not.toBeNull();
    expect(Router.match(router, 'POST', '/api/v1/auth/login')).not.toBeNull();
    expect(Router.match(router, 'GET', '/admin/dashboard')).not.toBeNull();

    const fillMatch = Router.match(router, 'POST', '/api/v1/users/fill');
    expect(fillMatch).not.toBeNull();
    expect(fillMatch?.middleware).toEqual(['auth', 'jwt', 'fillRateLimit', 'validateUserFill']);
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
          framework: 'ZinTrust Framework',
          version: expect.any(String),
          env: 'test',
          database: 'sqlite',
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
