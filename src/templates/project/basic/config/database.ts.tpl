/**
 * Database Configuration (template)
 *
 * This file is intentionally kept simple and editable:
 * - Developers can add/remove connections in `connections`.
 * - Developers can edit `databaseConfigObj` to customize behavior.
 *
 * Core owns the default logic (sqlite path/name resolution, env handling, etc.).
 */

import { databaseConfig as coreDatabaseConfig } from '@zintrust/core';
import type { DatabaseConfigShape, DatabaseConnections } from '@zintrust/core';

/**
 * Editable connections map.
 *
 * Defaults are sourced from core so you inherit framework-safe behavior.
 */
export const connections = {
  sqlite: coreDatabaseConfig.connections.sqlite,
  d1: coreDatabaseConfig.connections.d1,
  'd1-remote': coreDatabaseConfig.connections['d1-remote'],
  postgresql: coreDatabaseConfig.connections.postgresql,
  mysql: coreDatabaseConfig.connections.mysql,
} satisfies DatabaseConnections;

/**
 * Editable database config object.
 *
 * You can override any top-level keys from core, while keeping core defaults.
 */
export const databaseConfigObj = {
  ...coreDatabaseConfig,
  connections,
} satisfies DatabaseConfigShape;

export const databaseConfig = databaseConfigObj;
export type DatabaseConfig = typeof databaseConfig;
