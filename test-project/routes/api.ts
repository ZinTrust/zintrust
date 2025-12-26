/**
 * Example Routes
 * Demonstrates routing patterns
 */

import { UserController } from '@app/Controllers/UserController';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { useDatabase, type IRouter, Router } from '@zintrust/core';

export function registerRoutes(router: IRouter): void {
  const userController = UserController.create();
  registerPublicRoutes(router);
  registerApiV1Routes(router, userController);
  registerAdminRoutes(router);
}

/**
 * Register public routes
 */
function registerPublicRoutes(router: IRouter): void {
  Router.get(router, '/', async (_req, res) => {
    res.json({
      framework: 'Zintrust Framework',
      app_name: Env.APP_NAME,
      version: '0.1.0',
      env: Env.NODE_ENV ?? 'development',
      database: Env.DB_CONNECTION ?? 'sqlite',
    });
  });

  Router.get(router, '/health', async (_req, res) => {
    try {
      const db = useDatabase();
      await db.query('SELECT 1');

      const uptime =
        typeof process !== 'undefined' && typeof process.uptime === 'function'
          ? process.uptime()
          : 0;

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime,
        database: 'connected',
        environment: Env.NODE_ENV ?? 'development',
      });
    } catch (error) {
      Logger.error('Health check failed:', error);

      const isProd =
        typeof process !== 'undefined' &&
        typeof process.env === 'object' &&
        process.env !== null &&
        process.env['NODE_ENV'] === 'production';

      res.setStatus(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: isProd ? 'Service unavailable' : (error as Error).message,
      });
    }
  });
}

/**
 * Register API V1 routes
 */
function registerApiV1Routes(
  router: IRouter,
  userController: ReturnType<typeof UserController.create>
): void {
  Router.group(router, '/api/v1', (r) => {
    // Auth routes
    Router.post(r, '/auth/login', async (_req, res) => {
      res.json({ message: 'Login endpoint' });
    });

    Router.post(r, '/auth/register', async (_req, res) => {
      res.json({ message: 'Register endpoint' });
    });

    // Protected routes (middleware is not modeled in Router.ts yet)
    const pr = r;

    // User resource (REST-ish)
    Router.resource(pr, '/users', {
      index: userController.index,
      store: userController.store,
      show: userController.show,
      update: userController.update,
      destroy: userController.destroy,
    });

    // If the controller exposes create/edit, wire them explicitly.
    Router.get(pr, '/users/create', userController.create);
    Router.get(pr, '/users/:id/edit', userController.edit);

    // Custom user routes
    Router.get(pr, '/profile', async (_req, res) => {
      res.json({ message: 'Get user profile' });
    });

    Router.put(pr, '/profile', async (_req, res) => {
      res.json({ message: 'Update user profile' });
    });

    // Posts resource
    Router.get(r, '/posts', async (_req, res) => {
      res.json({ data: [] });
    });

    Router.get(r, '/posts/:id', async (req, res) => {
      const id = req.getParam('id');
      res.json({ data: { id } });
    });
  });
}

/**
 * Register admin routes
 */
function registerAdminRoutes(router: IRouter): void {
  Router.group(router, '/admin', (r) => {
    Router.get(r, '/dashboard', async (_req, res) => {
      res.json({ message: 'Admin dashboard' });
    });

    Router.get(r, '/users', async (_req, res) => {
      res.json({ data: [] });
    });
  });
}
