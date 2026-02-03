/**
 * Register Direct MySQL Test Routes
 * These routes test packages/db-mysql adapter directly with Cloudflare Workers
 */

import type { IRouter } from '@/routes/Router';
import { Router } from '@/routes/Router';
import { testDirectMysqlConnection, testDirectMysqlCrud } from '@routes/DirectMysqlTestRoutes';

/**
 * Register direct MySQL test routes
 */
export const registerDirectMysqlTestRoutes = (router: IRouter): void => {
  console.log('registerDirectMysqlTestRoutes :', true);
  // Basic connection test
  Router.get(router, '/test/direct-mysql/connection', testDirectMysqlConnection);

  // CRUD operations test
  Router.get(router, '/test/direct-mysql/crud', testDirectMysqlCrud);
};

export default registerDirectMysqlTestRoutes;
