import type { IDatabase } from '@orm/Database';

export type ColumnType =
  | 'STRING'
  | 'INTEGER'
  | 'BIGINT'
  | 'UUID'
  | 'REAL'
  | 'BOOLEAN'
  | 'TEXT'
  | 'JSON'
  | 'TIMESTAMP'
  | 'BLOB';

export type IndexType = 'INDEX' | 'UNIQUE';

export type ForeignKeyAction = 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION' | 'SET DEFAULT';

export type ColumnDefinition = {
  name: string;
  type: ColumnType;
  length?: number;
  nullable: boolean;
  defaultValue?: unknown;
  primary: boolean;
  unique: boolean;
  autoIncrement: boolean;
  unsigned: boolean;
};

export type IndexDefinition = {
  name: string;
  columns: string[];
  type: IndexType;
};

export type ForeignKeyDefinition = {
  name: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete?: ForeignKeyAction;
  onUpdate?: ForeignKeyAction;
};

export type TableDefinition = {
  name: string;
  columns: ColumnDefinition[];
  indexes: IndexDefinition[];
  foreignKeys: ForeignKeyDefinition[];
};

export type BlueprintCallback<TBlueprint> = (table: TBlueprint) => void | Promise<void>;

export type ColumnBuilder = {
  nullable(): ColumnBuilder;
  notNullable(): ColumnBuilder;
  default(value: unknown): ColumnBuilder;
  unique(): ColumnBuilder;
  primary(): ColumnBuilder;
  autoIncrement(): ColumnBuilder;
  unsigned(): ColumnBuilder;
  getDefinition(): ColumnDefinition;
};

export type ForeignKeyBuilder = {
  references(columns: string | string[]): ForeignKeyBuilder;
  on(table: string): ForeignKeyBuilder;
  onDelete(action: ForeignKeyAction): ForeignKeyBuilder;
  onUpdate(action: ForeignKeyAction): ForeignKeyBuilder;
  getDefinition(): ForeignKeyDefinition;
};

export type Blueprint = {
  uuid(arg0: string): unknown;
  string(name: string, length?: number): ColumnBuilder;
  integer(name: string): ColumnBuilder;
  bigInteger(name: string): ColumnBuilder;
  real(name: string): ColumnBuilder;
  boolean(name: string): ColumnBuilder;
  text(name: string): ColumnBuilder;
  json(name: string): ColumnBuilder;
  timestamp(name: string): ColumnBuilder;
  blob(name: string): ColumnBuilder;

  id(name?: string): ColumnBuilder;
  timestamps(createdAt?: string, updatedAt?: string): void;

  index(columns: string | string[], name?: string): void;
  unique(columns: string | string[], name?: string): void;

  foreign(columns: string | string[], name?: string): ForeignKeyBuilder;

  dropColumn(name: string): void;
  dropIndex(name: string): void;
  dropForeign(name: string): void;

  getDefinition(): TableDefinition;
  getDropColumns(): string[];
  getDropIndexes(): string[];
  getDropForeignKeys(): string[];
};

export type SchemaBuilder = {
  create(tableName: string, callback: BlueprintCallback<Blueprint>): Promise<void>;
  table(tableName: string, callback: BlueprintCallback<Blueprint>): Promise<void>;
  drop(tableName: string): Promise<void>;
  dropIfExists(tableName: string): Promise<void>;
  hasTable(tableName: string): Promise<boolean>;
  hasColumn(tableName: string, columnName: string): Promise<boolean>;
  getAllTables(): Promise<string[]>;
  getDb(): IDatabase;
};
