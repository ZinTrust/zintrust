import { Application, type IApplication } from '@boot/Application';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasRoute = (
  router: { routes: Array<{ method: string; path: string }> },
  method: string,
  path: string
): boolean => {
  for (const r of router.routes) {
    if (r.method === method && r.path === path) {
      return true;
    }
  }
  return false;
};

describe.sequential('Application Boot and Health Check Integration', () => {
  let app: IApplication;
  let tempDir: string | undefined;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'zintrust-app-boot-health-'));
    app = Application.create(tempDir);
    await app.boot();
  });

  afterAll(async () => {
    await app.shutdown();
    if (tempDir !== undefined) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  describe('Application Lifecycle', () => {
    it('should boot successfully', () => {
      expect(app.isBooted()).toBe(true);
    });

    it('should detect environment correctly', () => {
      expect(['test', 'testing']).toContain(app.getEnvironment());
      expect(app.isTesting()).toBe(true);
    });

    it('should provide router instance', () => {
      const router = app.getRouter();
      expect(router).toBeDefined();
      expect(Array.isArray(router.routes)).toBe(true);
    });

    it('should provide container instance', () => {
      const container = app.getContainer();
      expect(container).toBeDefined();
    });

    it('should provide middleware stack', () => {
      const middleware = app.getMiddlewareStack();
      expect(middleware).toBeDefined();
    });
  });

  describe('Health Endpoints', () => {
    it('/health endpoint exists', () => {
      const router = app.getRouter();
      const exists = hasRoute(router, 'GET', '/health');
      expect(exists).toBe(true);
    });

    it('/health/live endpoint exists', () => {
      const router = app.getRouter();
      const exists = hasRoute(router, 'GET', '/health/live');
      expect(exists).toBe(true);
    });

    it('/health/ready endpoint exists', () => {
      const router = app.getRouter();
      const exists = hasRoute(router, 'GET', '/health/ready');
      expect(exists).toBe(true);
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      await app.shutdown();
      expect(app.isBooted()).toBe(false);

      await app.boot();
      expect(app.isBooted()).toBe(true);
    });
  });
});
