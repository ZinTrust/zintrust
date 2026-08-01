/**
 * ZinTrust ORM - Database runtime primitives
 * Contains database adapters and ORM functionality
 */

export { Database, resetDatabase, useDatabase, useEnsureDbConnected } from '@orm/Database';
export type { IDatabase } from '@orm/Database';
export { DatabaseConnectionRegistry } from '@orm/DatabaseConnectionRegistry';
export { Model } from '@orm/Model';
export type { DefinedModel, IModel, ModelConfig, ModelStatic } from '@orm/Model';
export { QueryBuilder } from '@orm/QueryBuilder';
export type {
  IJoinOnBuilder,
  InsertResult,
  IQueryBuilder,
  JoinOnInput,
  LatestPerOptions,
  PaginationOptions,
} from '@orm/QueryBuilder';
export type { IRelationship } from '@orm/Relationships';
export { DatabaseAdapterRegistry } from '@orm/DatabaseAdapterRegistry';
export { BaseAdapter } from '@orm/DatabaseAdapter';
export type {
  DatabaseConfig,
  ID1Database,
  IDatabaseAdapter,
  QueryResult,
} from '@orm/DatabaseAdapter';
export { registerDatabasesFromRuntimeConfig } from '@orm/DatabaseRuntimeRegistration';

// Adapters
export { MySQLAdapter } from '@orm/adapters/MySQLAdapter';
export { PostgreSQLAdapter } from '@orm/adapters/PostgreSQLAdapter';
export { SQLiteAdapter } from '@orm/adapters/SQLiteAdapter';
export { SQLServerAdapter } from '@orm/adapters/SQLServerAdapter';

// Pagination
export { createPaginator, getNextPageUrl, getPrevPageUrl, Paginator } from '@database/Paginator';
export type {
  CreatePaginatorInput,
  PaginationLinks,
  PaginationQuery,
  Paginator as PaginatorType,
} from '@database/Paginator';
