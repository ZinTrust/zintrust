/**
 * Database Exports
 * Provides database adapters, query builder, and migration utilities
 */

export { Database, resetDatabase, useDatabase, useEnsureDbConnected } from '@orm/Database';
export type { IDatabase } from '@orm/Database';

export { BaseAdapter } from '@orm/DatabaseAdapter';
export type { DatabaseConfig, IDatabaseAdapter, QueryResult } from '@orm/DatabaseAdapter';
export { DatabaseAdapterRegistry } from '@orm/DatabaseAdapterRegistry';

export { QueryBuilder } from '@orm/QueryBuilder';
export type {
  IJoinOnBuilder,
  InsertResult,
  IQueryBuilder,
  JoinOnInput,
  LatestPerOptions,
  PaginationOptions,
} from '@orm/QueryBuilder';

export { Schema as MigrationSchema } from '@migrations/schema';
export type { Blueprint } from '@migrations/schema';

export { MySQLAdapter } from '@orm/adapters/MySQLAdapter';
export { PostgreSQLAdapter } from '@orm/adapters/PostgreSQLAdapter';
export { SQLiteAdapter } from '@orm/adapters/SQLiteAdapter';
export { SQLServerAdapter } from '@orm/adapters/SQLServerAdapter';
