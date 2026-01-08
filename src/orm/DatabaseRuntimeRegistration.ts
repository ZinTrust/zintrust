/**
 * Runtime database registration
 *
 * Bridges config-layer database connection definitions into ORM connection
 * instances that can be selected via `useDatabase(undefined, name)`.
 */

import type {
  DatabaseConfigShape,
  DatabaseConnectionConfig,
  DatabaseConnections,
} from '@config/type';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { useDatabase } from '@orm/Database';
import type { DatabaseConfig as OrmDatabaseConfig } from '@orm/DatabaseAdapter';

const toOrmConfig = (cfg: DatabaseConnectionConfig): OrmDatabaseConfig => {
  switch (cfg.driver) {
    case 'sqlite':
      return { driver: 'sqlite', database: cfg.database };
    case 'd1':
      return { driver: 'd1' };
    case 'd1-remote':
      return { driver: 'd1-remote' };
    case 'postgresql':
      return {
        driver: 'postgresql',
        host: cfg.host,
        port: cfg.port,
        database: cfg.database,
        username: cfg.username,
        password: cfg.password,
      };
    case 'mysql':
      return {
        driver: 'mysql',
        host: cfg.host,
        port: cfg.port,
        database: cfg.database,
        username: cfg.username,
        password: cfg.password,
      };
    default:
      // Exhaustive check (kept for future driver additions)
      return cfg satisfies never;
  }
};

const registerConnections = (connections: DatabaseConnections): void => {
  for (const [name, runtimeCfg] of Object.entries(connections)) {
    // Register instance by name; a later call without config may now resolve.
    useDatabase(toOrmConfig(runtimeCfg), name);
  }
};

/**
 * Register all connections from runtime config.
 *
 * Behavior:
 * - Every entry in `config.connections` is registered under its key.
 * - The connection named by `config.default` is ALSO registered as 'default'
 *   (so callers can keep using `useDatabase()` / models without explicit connection).
 */
export function registerDatabasesFromRuntimeConfig(config: DatabaseConfigShape): void {
  registerConnections(config.connections);

  const defaultCfg = config.connections[config.default];
  if (defaultCfg === undefined) {
    throw ErrorFactory.createConfigError(
      `Database default connection not configured: ${String(config.default ?? '')}`
    );
  }

  useDatabase(toOrmConfig(defaultCfg), 'default');
}
