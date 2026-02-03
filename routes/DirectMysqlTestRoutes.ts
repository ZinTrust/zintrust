/**
 * Direct MySQL Test Route
 * Tests packages/db-mysql adapter directly with Cloudflare Workers TCP sockets
 */

import type { IResponse } from '@/http/Response';
import { Database } from '@/orm/Database';
import type { IRequest } from '@http/Request';

/**
 * Test direct MySQL connection using packages/db-mysql adapter
 */
export const testDirectMysqlConnection = async (_req: IRequest, res: IResponse): Promise<void> => {
  try {
    // Use Database with MySQL adapter directly
    const db = Database.create({ driver: 'mysql' });

    // Test basic query
    const result = await db.query('SELECT 1 as test_value, NOW() as current_time');

    res.json({
      success: true,
      message: 'Direct MySQL connection test successful',
      data: result,
      adapter: 'packages/db-mysql',
      runtime: 'Cloudflare Workers',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Direct MySQL connection failed',
      details: String(error),
      adapter: 'packages/db-mysql',
      runtime: 'Cloudflare Workers',
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Test direct MySQL CRUD operations
 */
export const testDirectMysqlCrud = async (_req: IRequest, res: IResponse): Promise<void> => {
  try {
    const db = Database.create({ driver: 'mysql' });
    const tableName = `test_direct_${Date.now()}`;

    // Create table
    await db.execute(
      `CREATE TEMPORARY TABLE ${tableName} (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
    );

    // Insert data
    await db.execute(`INSERT INTO ${tableName} (name) VALUES (?)`, ['direct_test']);

    // Query data
    const result = await db.query(`SELECT * FROM ${tableName} WHERE name = ?`, ['direct_test']);

    res.json({
      success: true,
      message: 'Direct MySQL CRUD test successful',
      data: {
        created: true,
        inserted: true,
        queried: result,
        tableName,
      },
      adapter: 'packages/db-mysql',
      runtime: 'Cloudflare Workers',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Direct MySQL CRUD test failed',
      details: String(error),
      adapter: 'packages/db-mysql',
      runtime: 'Cloudflare Workers',
      timestamp: new Date().toISOString(),
    });
  }
};
