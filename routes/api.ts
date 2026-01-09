/**
 * Example Routes
 * Demonstrates routing patterns
 */

import { UserQueryBuilderController } from '@app/Controllers/UserQueryBuilderController';
import { Env } from '@config/env';
import { registerBroadcastRoutes } from '@routes/broadcast';
import { registerHealthRoutes } from '@routes/health';
import { registerStorageRoutes } from '@routes/storage';
import { type IRouter, Router } from '@routing/Router';

export function registerRoutes(router: IRouter): void {
  const userController = UserQueryBuilderController.create();
  registerPublicRoutes(router);
  registerApiV1Routes(router, userController);
  registerAdminRoutes(router);
}

/**
 * Register public routes
 */
function registerPublicRoutes(router: IRouter): void {
  registerRootRoute(router);
  registerHealthRoutes(router);
  registerBroadcastRoutes(router);
  registerStorageRoutes(router);
}

function registerRootRoute(router: IRouter): void {
  Router.get(router, '/', async (_req, res) => {
    res.json({
      framework: 'Zintrust Framework',
      app_name: Env.APP_NAME,
      version: '0.1.0',
      env: Env.NODE_ENV ?? 'development',
      database: Env.DB_CONNECTION ?? 'sqlite',
    });
  });
}

/**
 * Register API V1 routes
 */
function registerApiV1Routes(
  router: IRouter,
  userController: ReturnType<typeof UserQueryBuilderController.create>
): void {
  Router.group(router, '/api/v1', (r) => {
    // Auth routes
    Router.post(
      r,
      '/auth/login',
      async (_req, res) => {
        res.json({ message: 'Login endpoint' });
      },
      { middleware: ['validateLogin'] }
    );

    Router.post(
      r,
      '/auth/register',
      async (_req, res) => {
        res.json({ message: 'Register endpoint' });
      },
      { middleware: ['validateRegister'] }
    );

    // Protected routes (Router supports per-route middleware metadata)
    const pr = r;

    // User resource (REST-ish)
    Router.resource(pr, '/users', {
      index: userController.index,
      store: userController.store,
      show: userController.show,
      update: userController.update,
      destroy: userController.destroy,
    });

    Router.post(pr, '/users/fill', userController.fill, { middleware: ['fillRateLimit'] });

    // If the controller exposes create/edit, wire them explicitly.
    Router.get(pr, '/users/create', userController.create);
    Router.get(pr, '/users/:id/edit', userController.edit);

    // Custom user routes
    Router.get(
      pr,
      '/profile',
      async (_req, res) => {
        res.json({ message: 'Get user profile' });
      },
      { middleware: ['auth', 'jwt'] }
    );

    Router.put(
      pr,
      '/profile',
      async (_req, res) => {
        res.json({ message: 'Update user profile' });
      },
      { middleware: ['auth', 'jwt'] }
    );

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
