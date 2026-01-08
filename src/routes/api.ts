/**
 * Framework Fallback Routes
 *
 * These routes are used when an app does not provide its own `routes/api.*` module.
 */

import { UserController } from '@app/Controllers/UserController';
import { Env } from '@config/env';
import { registerBroadcastRoutes } from '@routes/broadcast';
import { registerHealthRoutes } from '@routes/health';
import { registerStorageRoutes } from '@routes/storage';
import { type IRouter, Router } from '@routing/Router';

export function registerRoutes(router: IRouter): void {
  const userController = UserController.create();
  registerPublicRoutes(router);
  registerApiV1Routes(router, userController);
  registerAdminRoutes(router);
}

function registerPublicRoutes(router: IRouter): void {
  registerRootRoute(router);
  registerHealthRoutes(router);
  registerBroadcastRoutes(router);
  registerStorageRoutes(router);
}

function registerRootRoute(router: IRouter): void {
  Router.get(router, '/', (_req, res) => {
    res.json({
      framework: 'Zintrust Framework',
      app_name: Env.APP_NAME,
      version: '0.1.0',
      env: Env.NODE_ENV ?? 'development',
      database: Env.DB_CONNECTION ?? 'sqlite',
    });
  });
}

function registerApiV1Routes(
  router: IRouter,
  userController: ReturnType<typeof UserController.create>
): void {
  Router.group(router, '/api/v1', (r) => {
    Router.post(r, '/auth/login', (_req, res) => {
      res.json({ message: 'Login endpoint' });
    });

    Router.post(r, '/auth/register', (_req, res) => {
      res.json({ message: 'Register endpoint' });
    });

    const pr = r;

    Router.resource(pr, '/users', {
      index: userController.index,
      store: userController.store,
      show: userController.show,
      update: userController.update,
      destroy: userController.destroy,
    });

    Router.get(pr, '/users/create', userController.create);
    Router.get(pr, '/users/:id/edit', userController.edit);

    Router.get(pr, '/profile', (_req, res) => {
      res.json({ message: 'Get user profile' });
    });

    Router.put(pr, '/profile', (_req, res) => {
      res.json({ message: 'Update user profile' });
    });

    Router.get(r, '/posts', (_req, res) => {
      res.json({ data: [] });
    });

    Router.get(r, '/posts/:id', (req, res) => {
      const id = req.getParam('id');
      res.json({ data: { id } });
    });
  });
}

function registerAdminRoutes(router: IRouter): void {
  Router.group(router, '/admin', (r) => {
    Router.get(r, '/dashboard', (_req, res) => {
      res.json({ message: 'Admin dashboard' });
    });

    Router.get(r, '/users', (_req, res) => {
      res.json({ data: [] });
    });
  });
}
