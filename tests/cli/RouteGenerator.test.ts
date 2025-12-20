/**
 * RouteGenerator Tests
 * Tests for HTTP route generation
 */

import {
  RouteGenerator,
  type RouteDefinition,
  type RouteOptions,
} from '@cli/scaffolding/RouteGenerator';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('RouteGenerator', () => {
  const testRoutesDir = path.join(process.cwd(), 'tests', 'tmp', 'routes');

  beforeEach(async () => {
    // Create directory before each test
    try {
      await fs.mkdir(testRoutesDir, { recursive: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await fs.rm(testRoutesDir, { recursive: true, force: true });
      // eslint-disable-next-line no-empty
    } catch {}
  });

  describe('validateOptions', () => {
    it('should validate correct route options', () => {
      const routes: RouteDefinition[] = [
        {
          method: 'get',
          path: '/users',
          controller: 'UserController',
          action: 'index',
        },
      ];

      const options: RouteOptions = {
        routesPath: testRoutesDir,
        routes,
      };

      const result = RouteGenerator.validateOptions(options);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty route list', () => {
      const options: RouteOptions = {
        routesPath: testRoutesDir,
        routes: [],
      };

      const result = RouteGenerator.validateOptions(options);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/No routes provided/);
    });

    it('should reject non-existent routes path', () => {
      const routes: RouteDefinition[] = [
        {
          method: 'get',
          path: '/users',
          controller: 'UserController',
        },
      ];

      const options: RouteOptions = {
        routesPath: '/nonexistent/path',
        routes,
      };

      const result = RouteGenerator.validateOptions(options);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/does not exist/);
    });

    it('should reject invalid HTTP methods', () => {
      const routes: RouteDefinition[] = [
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          method: 'invalid' as any,
          path: '/users',
          controller: 'UserController',
        },
      ];

      const options: RouteOptions = {
        routesPath: testRoutesDir,
        routes,
      };

      const result = RouteGenerator.validateOptions(options);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toMatch(/Invalid route methods/);
    });
  });

  describe('generateRoutes', () => {
    it('should generate basic routes', async () => {
      const routes: RouteDefinition[] = [
        {
          method: 'get',
          path: '/users',
          controller: 'UserController',
          action: 'index',
        },
        {
          method: 'post',
          path: '/users',
          controller: 'UserController',
          action: 'store',
        },
      ];

      const options: RouteOptions = {
        routesPath: testRoutesDir,
        groupName: 'api',
        routes,
      };

      const result = await RouteGenerator.generateRoutes(options);

      expect(result.success).toBe(true);
      expect(result.routeCount).toBe(2);
      expect(result.routeFile).toContain('api.ts');
    });

    it('should generate routes with prefix', async () => {
      const routes: RouteDefinition[] = [
        {
          method: 'get',
          path: '/users',
          controller: 'UserController',
          action: 'index',
        },
      ];

      const options: RouteOptions = {
        routesPath: testRoutesDir,
        groupName: 'api_v1',
        prefix: '/api/v1',
        routes,
      };

      const result = await RouteGenerator.generateRoutes(options);

      expect(result.success).toBe(true);
    });

    it('should generate routes with middleware', async () => {
      const routes: RouteDefinition[] = [
        {
          method: 'get',
          path: '/profile',
          controller: 'UserController',
          action: 'profile',
          middleware: ['auth'],
        },
      ];

      const options: RouteOptions = {
        routesPath: testRoutesDir,
        groupName: 'protected_routes',
        middleware: ['auth'],
        routes,
      };

      const result = await RouteGenerator.generateRoutes(options);

      expect(result.success).toBe(true);
    });

    it('should generate resource routes', async () => {
      const routes: RouteDefinition[] = [
        {
          method: 'resource',
          path: '/users',
          controller: 'UserController',
        },
      ];

      const options: RouteOptions = {
        routesPath: testRoutesDir,
        groupName: 'resource_routes',
        routes,
      };

      const result = await RouteGenerator.generateRoutes(options);

      expect(result.success).toBe(true);
    });

    it('should include imports for all controllers', async () => {
      const routes: RouteDefinition[] = [
        {
          method: 'get',
          path: '/users',
          controller: 'UserController',
          action: 'index',
        },
        {
          method: 'get',
          path: '/posts',
          controller: 'PostController',
          action: 'index',
        },
      ];

      const options: RouteOptions = {
        routesPath: testRoutesDir,
        groupName: 'multi_controller_routes',
        routes,
      };

      const result = await RouteGenerator.generateRoutes(options);

      expect(result.success).toBe(true);
    });

    it('should generate routes with parameters', async () => {
      const routes: RouteDefinition[] = [
        {
          method: 'get',
          path: '/users/:id',
          controller: 'UserController',
          action: 'show',
          params: ['id'],
        },
      ];

      const options: RouteOptions = {
        routesPath: testRoutesDir,
        groupName: 'param_routes',
        routes,
      };

      const result = await RouteGenerator.generateRoutes(options);

      expect(result.success).toBe(true);
    });
  });

  describe('commonRoutes', () => {
    it('should get user API routes', () => {
      const routes = RouteGenerator.getUserApiRoutes();
      expect(routes).toHaveLength(5);
      expect(routes[0].method).toBe('get');
      expect(routes[1].method).toBe('post');
      expect(routes[4].method).toBe('delete');
    });

    it('should get auth routes', () => {
      const routes = RouteGenerator.getAuthRoutes();
      expect(routes).toHaveLength(4);
      expect(routes.some((r: RouteDefinition) => r.path === '/auth/login')).toBe(true);
      expect(routes.some((r: RouteDefinition) => r.path === '/auth/register')).toBe(true);
      expect(routes.some((r: RouteDefinition) => r.path === '/auth/logout')).toBe(true);
    });

    it('should get admin routes', () => {
      const routes = RouteGenerator.getAdminRoutes();
      expect(routes).toHaveLength(4);
      expect(routes.every((r: RouteDefinition) => r.middleware?.includes('admin'))).toBe(true);
    });

    it('should list common HTTP methods', () => {
      const methods = RouteGenerator.getCommonMethods();
      expect(methods).toContain('get');
      expect(methods).toContain('post');
      expect(methods).toContain('put');
      expect(methods).toContain('patch');
      expect(methods).toContain('delete');
      expect(methods).toContain('resource');
    });
  });

  describe('edge cases', () => {
    it('should generate routes without group prefix', async () => {
      const routes: RouteDefinition[] = [
        {
          method: 'get',
          path: '/',
          controller: 'HomeController',
          action: 'index',
        },
      ];

      const options: RouteOptions = {
        routesPath: testRoutesDir,
        groupName: 'web',
        // No prefix
        routes,
      };

      const result = await RouteGenerator.generateRoutes(options);

      expect(result.success).toBe(true);
    });

    it('should handle routes with nested paths', async () => {
      const routes: RouteDefinition[] = [
        {
          method: 'get',
          path: '/users/:id/posts/:postId',
          controller: 'PostController',
          action: 'show',
        },
      ];

      const options: RouteOptions = {
        routesPath: testRoutesDir,
        groupName: 'nested_routes',
        routes,
      };

      const result = await RouteGenerator.generateRoutes(options);

      expect(result.success).toBe(true);
    });
  });
});
