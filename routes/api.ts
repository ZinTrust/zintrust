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

  // Public routes
  router.get('/', async (req, res) => {
    res.json({ message: 'Welcome to Zintrust API' });
  });

  router.get('/health', async (req, res) => {
    try {
      // Check database connectivity
      const db = useDatabase();

      // Try a simple query to verify database is working
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

  // API routes with versioning
  router.group({ prefix: '/api/v1', middleware: ['cors', 'json'] }, () => {
    // Auth routes
    router.post('/auth/login', async (req, res) => {
      res.json({ message: 'Login endpoint' });
    });

    router.post('/auth/register', async (req, res) => {
      res.json({ message: 'Register endpoint' });
    });

    // Protected routes
    router.group({ middleware: ['auth'] }, () => {
      // User resource (CRUD)
      r.resource('users', {
        index: userController.index.bind(userController),
        create: userController.create.bind(userController),
        store: userController.store.bind(userController),
        show: userController.show.bind(userController),
        edit: userController.edit.bind(userController),
        update: userController.update.bind(userController),
        destroy: userController.destroy.bind(userController),
      });

      // Custom user routes
      r.get('/profile', async (req, res) => {
        res.json({ message: 'Get user profile' });
      });

      r.put('/profile', async (req, res) => {
        res.json({ message: 'Update user profile' });
      });
    });

    // Posts resource
    router.get('/posts', async (req, res) => {
      res.json({ data: [] });
    });

    router.get('/posts/:id', async (req, res) => {
      const id = req.getParam('id');
      res.json({ data: { id } });
    });
  });

  // Admin routes (requires admin role)
  router.group({ prefix: '/admin', middleware: ['auth', 'admin'] }, (r) => {
    r.get('/dashboard', async (req, res) => {
      res.json({ message: 'Admin dashboard' });
    });

    r.get('/users', async (req, res) => {
      res.json({ data: [] });
    });
  });
}
