import { MiddlewareKeys } from '@config/middleware';
import { registerRoutes } from '@routes/api';
import { Router } from '@routing/Router';
import { RouteRegistry } from '@routing/RouteRegistry';
import { beforeEach, describe, expect, it } from 'vitest';

describe('Architecture: route middleware registry', () => {
  beforeEach(() => {
    RouteRegistry.clear();
  });

  it('ensures all route middleware names exist in MiddlewareKeys', () => {
    const router = Router.createRouter();
    registerRoutes(router);

    const allowed = new Set(Object.keys(MiddlewareKeys));
    const unknown: Array<{ method: string; path: string; middleware: string }> = [];

    for (const route of RouteRegistry.list()) {
      for (const name of route.middleware ?? []) {
        if (!allowed.has(name)) {
          unknown.push({ method: route.method, path: route.path, middleware: name });
        }
      }
    }

    expect(unknown).toEqual([]);
  });
});
