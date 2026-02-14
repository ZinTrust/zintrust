import { OpenApiGenerator } from '@/openapi/OpenApiGenerator';
import { Router } from '@core-routes/Router';
import { RouteRegistry } from '@core-routes/RouteRegistry';
import { registerRoutes } from '@routes/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zintrust/workers', () => ({
  createQueueWorker: () => ({
    processOne: async () => true,
    processAll: async () => true,
    startWorker: async () => true,
  }),
  registerWorkerRoutes: vi.fn(),
}));

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
    APP_NAME: 'ZinTrust Framework',
    NODE_ENV: 'test',
    HOST: 'localhost',
    PORT: 3000,
    BASE_URL: '',
  },
}));

vi.mock('@config/logger');
vi.mock('@orm/Database', () => ({
  useDatabase: vi.fn(() => ({ query: vi.fn() })),
}));

describe('OpenAPI spec snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    RouteRegistry.clear();
  });

  it('matches a stable snapshot for routes/api.ts', () => {
    // Reset modules to ensure clean state
    vi.resetModules();

    const router = Router.createRouter();
    registerRoutes(router);

    const doc = OpenApiGenerator.generate([...RouteRegistry.list()], {
      title: 'ZinTrust Framework',
      version: '0.0.0',
      excludePaths: ['/openapi.json', '/docs'],
    });

    // Health endpoints moved to core routes; exclude them from this app-level snapshot
    if (doc.paths) {
      delete (doc.paths as Record<string, unknown>)['/health'];
      delete (doc.paths as Record<string, unknown>)['/health/live'];
      delete (doc.paths as Record<string, unknown>)['/health/ready'];
    }

    expect(JSON.stringify(doc, null, 2)).toMatchSnapshot();
  });
});
