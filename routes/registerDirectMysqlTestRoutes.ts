/**
 * Register Direct MySQL Test Routes
 * These routes test packages/db-mysql adapter directly with Cloudflare Workers
 */

import type { IRouter } from '@core-routes/Router';
import { Router } from '@core-routes/Router';
import { testRedisDurableObject, testRedisProxy } from '@routes/DirectMysqlTestRoutes';

/**
 * Register direct MySQL test routes
 */
export const registerDirectMysqlTestRoutes = (router: IRouter): void => {
  // Basic connection test
  Router.get(router, '/test/wg-do', testRedisDurableObject);

  // CRUD operations test
  Router.get(router, '/test/wg-pr', testRedisProxy);
};

export default registerDirectMysqlTestRoutes;
