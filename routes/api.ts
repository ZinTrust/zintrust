// @ts-nocheck - Example routes - WIP
/**
 * Example Routes
 * Demonstrates routing patterns
 */

import { UserController } from '@app/Controllers/UserController';
import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { useDatabase } from '@orm/Database';
import { Router } from '@routing/EnhancedRouter';

export function registerRoutes(router: Router): void {
  const userController = new UserController();

  registerPublicRoutes(router);
  registerApiV1Routes(router, userController);
  registerAdminRoutes(router);
}

/**
 * Register public routes
 */
function registerPublicRoutes(router: Router): void {
  router.get('/', async (req, res) => {
    res.json({
      framework: 'Zintrust Framework',
      version: '0.1.0',
      env: Env.NODE_ENV ?? 'development',
      database: Env.DB_CONNECTION ?? 'sqlite',
    });
  });

  router.get('/health', async (req, res) => {
    try {
      const db = useDatabase();
      await db.query('SELECT 1');

      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: 'connected',
        environment: Env.NODE_ENV ?? 'development',
      });
    } catch (error) {
      Logger.error('Health check failed:', error);
      res.setStatus(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error:
          process.env.NODE_ENV === 'production' ? 'Service unavailable' : (error as Error).message,
      });
    }
  });
}

/**
 * Register API V1 routes
 */
function registerApiV1Routes(router: Router, userController: UserController): void {
  router.group({ prefix: '/api/v1', middleware: ['cors', 'json'] }, (r) => {
    // Auth routes
    r.post('/auth/login', async (req, res) => {
      res.json({ message: 'Login endpoint' });
    });

    r.post('/auth/register', async (req, res) => {
      res.json({ message: 'Register endpoint' });
    });

    // Protected routes
    r.group({ middleware: ['auth'] }, (pr) => {
      // User resource (CRUD)
      pr.resource('users', {
        index: userController.index.bind(userController),
        create: userController.create.bind(userController),
        store: userController.store.bind(userController),
        show: userController.show.bind(userController),
        edit: userController.edit.bind(userController),
        update: userController.update.bind(userController),
        destroy: userController.destroy.bind(userController),
      });

      // Custom user routes
      pr.get('/profile', async (req, res) => {
        res.json({ message: 'Get user profile' });
      });

      pr.put('/profile', async (req, res) => {
        res.json({ message: 'Update user profile' });
      });
    });

    // Posts resource
    r.get('/posts', async (req, res) => {
      res.json({ data: [] });
    });

    r.get('/posts/:id', async (req, res) => {
      const id = req.getParam('id');
      res.json({ data: { id } });
    });
  });
}

/**
 * Register admin routes
 */
function registerAdminRoutes(router: Router): void {
  router.group({ prefix: '/admin', middleware: ['auth', 'admin'] }, (r) => {
    r.get('/dashboard', async (req, res) => {
      res.json({ message: 'Admin dashboard' });
    });

    r.get('/users', async (req, res) => {
      res.json({ data: [] });
    });
  });
}
