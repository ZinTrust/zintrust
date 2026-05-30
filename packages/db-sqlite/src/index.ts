export { SQLiteAdapter } from '@zintrust/core/database';

export type { DatabaseConfig, IDatabaseAdapter, QueryResult } from '@zintrust/core/database';

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_DB_SQLITE_VERSION = '0.1.15';
export const _ZINTRUST_DB_SQLITE_BUILD_DATE = '__BUILD_DATE__';
