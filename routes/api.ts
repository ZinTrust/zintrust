/**
 * Example Routes
 * Demonstrates routing patterns
 */

import { AuthController } from '@app/Controllers/AuthController';
import { UserQueryBuilderController } from '@app/Controllers/UserQueryBuilderController';
import { Env } from '@config/env';
import type { MiddlewareKey } from '@config/middleware';
import { type IRouter, Router } from '@core-routes/Router';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { registerDevRoutes } from '@routes/apiDev';
import { registerBroadcastRoutes } from '@routes/broadcast';
import { registerStorageRoutes } from '@routes/storage';
import { ErrorFactory } from '@zintrust/core';

export function registerRoutes(router: IRouter): void {
  try {
    const authController = AuthController.create();
    const userController = UserQueryBuilderController.create();
    registerPublicRoutes(router);
    registerApiV1Routes(router, authController, userController);
    registerAdminRoutes(router);
    registerDevRoutes(router);
  } catch (error: unknown) {
    throw ErrorFactory.createConfigError(
      `Failed to register routes: ${(error as Error).message}`,
      error as Error
    );
  }
}

/**
 * Register public routes
 */
function registerPublicRoutes(router: IRouter): void {
  registerRootRoute(router);
  registerHealthRoute(router);
  registerBroadcastRoutes(router);
  registerStorageRoutes(router);
}

function registerHealthRoute(router: IRouter): void {
  Router.get(router, '/health', async (_req: IRequest, res: IResponse) => {
    res.json({
      status: 'ok',
      mode: Env.get('RUNTIME_MODE', 'unknown'),
      worker: Env.get('WORKER_ENABLED', 'false') === 'true',
      timestamp: new Date().toISOString(),
    });
  });
}

function registerRootRoute(router: IRouter): void {
  Router.get(router, '/', async (_req: IRequest, res: IResponse) => {
    res.json({
      framework: 'ZinTrust Framework',
      app_name: Env.APP_NAME,
      version: '0.1.41',
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
  authController: ReturnType<typeof AuthController.create>,
  userController: ReturnType<typeof UserQueryBuilderController.create>
): void {
  Router.group(router, '/api/v1', (r: IRouter) => {
    // Auth routes
    Router.post<MiddlewareKey>(r, '/auth/login', authController.login, {
      middleware: ['authRateLimit', 'validateLogin'],
    });

    Router.post<MiddlewareKey>(r, '/auth/register', authController.register, {
      middleware: ['authRateLimit', 'validateRegister'],
    });

    Router.post<MiddlewareKey>(r, '/auth/logout', authController.logout, {
      middleware: ['auth', 'jwt'],
    });
    Router.post<MiddlewareKey>(r, '/auth/refresh', authController.refresh, {
      middleware: ['auth', 'jwt'],
    });

    // Protected routes (Router supports per-route middleware metadata)
    const pr = r;

    // User resource (REST-ish)
    Router.resource<MiddlewareKey>(
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
        middleware: ['auth', 'jwt'],
        store: { middleware: ['auth', 'jwt', 'userMutationRateLimit', 'validateUserStore'] },
        update: { middleware: ['auth', 'jwt', 'userMutationRateLimit', 'validateUserUpdate'] },
        destroy: { middleware: ['auth', 'jwt', 'userMutationRateLimit'] },
      }
    );

    Router.post<MiddlewareKey>(pr, '/users/fill', userController.fill, {
      middleware: ['auth', 'jwt', 'fillRateLimit', 'validateUserFill'],
    });

    // If the controller exposes create/edit, wire them explicitly.
    Router.get<MiddlewareKey>(pr, '/users/create', userController.create, {
      middleware: ['auth', 'jwt'],
    });
    Router.get<MiddlewareKey>(pr, '/users/:id/edit', userController.edit, {
      middleware: ['auth', 'jwt'],
    });

    // Custom user routes
    Router.get<MiddlewareKey>(
      pr,
      '/profile',
      async (__req: IRequest, res: IResponse) => {
        res.json({ message: 'Get user profile' });
      },
      { middleware: ['auth', 'jwt'] }
    );

    Router.put<MiddlewareKey>(
      pr,
      '/profile',
      async (__req: IRequest, res: IResponse) => {
        res.json({ message: 'Update user profile' });
      },
      { middleware: ['auth', 'jwt'] }
    );

    // Posts resource
    Router.get(r, '/posts', async (_req: IRequest, res: IResponse) => {
      res.json({ data: [] });
    });

    Router.get(r, '/posts/:id', async (req: IRequest, res: IResponse) => {
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
    Router.get(r, '/dashboard', async (__req: IRequest, res: IResponse) => {
      res.json({ message: 'Admin dashboard' });
    });

    Router.get(r, '/users', async (__req: IRequest, res: IResponse) => {
      res.json({ data: [] });
    });
  });
}
