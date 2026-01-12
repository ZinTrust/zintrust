/**
 * Example Routes
 * Demonstrates routing patterns
 */

import { Env, type IRouter, Router } from '@zintrust/core';

import { UserController } from '@app/Controllers/UserController';
import { registerBroadcastRoutes } from '@routes/broadcast';
import { registerHealthRoutes } from '@routes/health';
import { registerMetricsRoutes } from '@routes/metrics';
import { registerStorageRoutes } from '@routes/storage';

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
  registerRootRoute(router);
  registerHealthRoutes(router);
  registerMetricsRoutes(router);
  registerBroadcastRoutes(router);
  registerStorageRoutes(router);
}

function registerRootRoute(router: IRouter): void {
  Router.get(
    router,
    '/',
    async (_req, res) => {
      res.json({
        framework: 'Zintrust Framework',
        app_name: Env.APP_NAME,
        version: '0.1.0',
        env: Env.NODE_ENV ?? 'development',
        database: Env.DB_CONNECTION ?? 'sqlite',
      });
    },
    {
      meta: {
        summary: 'Service root',
        tags: ['Public'],
        responseStatus: 200,
      },
    }
  );
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
    Router.post(
      r,
      '/auth/login',
      async (_req, res) => {
        res.json({ message: 'Login endpoint' });
      },
      {
        meta: {
          summary: 'Login',
          tags: ['Auth'],
          responseStatus: 200,
        },
      }
    );

    Router.post(
      r,
      '/auth/register',
      async (_req, res) => {
        res.json({ message: 'Register endpoint' });
      },
      {
        meta: {
          summary: 'Register',
          tags: ['Auth'],
          responseStatus: 200,
        },
      }
    );

    // Protected routes
    const pr = r;
    const protectedRoute = { middleware: ['auth'], meta: { tags: ['Users'] } };

    // User resource (REST-ish)
    Router.resource(
      pr,
      '/users',
      {
        index: userController.index,
        store: userController.store,
        show: userController.show,
        update: userController.update,
        destroy: userController.destroy,
      },
      {
        middleware: ['auth'],
        index: { meta: { summary: 'List users', tags: ['Users'], responseStatus: 200 } },
        store: { meta: { summary: 'Create user', tags: ['Users'], responseStatus: 201 } },
        show: { meta: { summary: 'Get user', tags: ['Users'], responseStatus: 200 } },
        update: { meta: { summary: 'Update user', tags: ['Users'], responseStatus: 200 } },
        destroy: { meta: { summary: 'Delete user', tags: ['Users'], responseStatus: 204 } },
      }
    );

    // If the controller exposes create/edit, wire them explicitly.
    Router.get(pr, '/users/create', userController.create, {
      ...protectedRoute,
      meta: { summary: 'User create form', tags: ['Users'], responseStatus: 200 },
    });
    Router.get(pr, '/users/:id/edit', userController.edit, {
      ...protectedRoute,
      meta: { summary: 'User edit form', tags: ['Users'], responseStatus: 200 },
    });

    // Custom user routes
    Router.get(
      pr,
      '/profile',
      async (_req, res) => {
        res.json({ message: 'Get user profile' });
      },
      {
        middleware: ['auth'],
        meta: {
          summary: 'Get user profile',
          tags: ['Users'],
          responseStatus: 200,
        },
      }
    );

    Router.put(
      pr,
      '/profile',
      async (_req, res) => {
        res.json({ message: 'Update user profile' });
      },
      {
        middleware: ['auth'],
        meta: {
          summary: 'Update user profile',
          tags: ['Users'],
          responseStatus: 200,
        },
      }
    );

    // Posts resource
    Router.get(r, '/posts', async (_req, res) => {
      res.json({ data: [] });
    }, {
      meta: {
        summary: 'List posts',
        tags: ['Posts'],
        responseStatus: 200,
      },
    });

    Router.get(r, '/posts/:id', async (req, res) => {
      const id = req.getParam('id');
      res.json({ data: { id } });
    }, {
      meta: {
        summary: 'Get post',
        tags: ['Posts'],
        responseStatus: 200,
      },
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
