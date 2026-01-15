export const ColumnType = {
  STRING: 'STRING',
  INTEGER: 'INTEGER',
  BIGINT: 'BIGINT',
  UUID: 'UUID',
  REAL: 'REAL',
  BOOLEAN: 'BOOLEAN',
  TEXT: 'TEXT',
  JSON: 'JSON',
  TIMESTAMP: 'TIMESTAMP',
  BLOB: 'BLOB',
  VARCHAR: 'VARCHAR',
  INT: 'INT',
  FLOAT: 'FLOAT',
  TINYINT_1: 'TINYINT(1)',
  TINYINT: 'TINYINT',
  JSONB: 'JSONB',
  DATETIME: 'DATETIME',
  BYTEA: 'BYTEA',
  FOREIGN_KEY: 'FOREIGN_KEY',
  NORMAL: 'NORMAL',
  UNIQUE: 'UNIQUE',
  NON_UNIQUE: 'NON_UNIQUE',

  ADD_COLUMN: 'ADD_COLUMN',
  DROP_COLUMN: 'DROP_COLUMN',
  CREATE_INDEX: 'CREATE_INDEX',
  DROP_INDEX: 'DROP_INDEX',
  ADD_FOREIGN_KEY: 'ADD_FOREIGN_KEY',
  DROP_FOREIGN_KEY: 'DROP_FOREIGN_KEY',
  SERIAL: 'SERIAL',
  IDENTITY: 'IDENTITY',
  AUTOINCREMENT: 'AUTOINCREMENT',

  CURRENT_TIMESTAMP: 'CURRENT_TIMESTAMP',
  NULLABLE: 'NULLABLE',
  NOT_NULLABLE: 'NOT_NULLABLE',

  SQL: 'SQL',

  UNSIGNED: 'UNSIGNED',

  CASCADE: 'CASCADE',
  SETNULL: 'SET NULL',
  RESTRICT: 'RESTRICT',
  NOACTION: 'NO ACTION',
  SETDEFAULT: 'SET DEFAULT',

  BIGSERIAL: 'BIGSERIAL',
  AUTO_INCREMENT: 'AUTO_INCREMENT',
  IDENTITY_1_1: 'IDENTITY(1,1)',
  NOT_NULL: 'NOT NULL',
  PRIMARY_KEY: 'PRIMARY KEY',
  DEFAULT_NULL: 'DEFAULT NULL',
  INDEX: 'INDEX',
  IF_EXISTS: 'IF EXISTS',
  IF_NOT_EXISTS: 'IF NOT EXISTS',
  CONSTRAINT: 'CONSTRAINT',
  FOREIGN_KEY_S: 'FOREIGN KEY',
  DROP_COLUMN_S: 'DROP COLUMN',
  ADD_COLUMN_S: 'ADD COLUMN',
  DROP_INDEX_S: 'DROP INDEX',
  DROP_TABLE_S: 'DROP TABLE',
  ALTER_TABLE_S: 'ALTER TABLE',
  CREATE_INDEX_S: 'CREATE INDEX',
  CREATE_TABLE_S: 'CREATE TABLE',
  REFERENCES: 'REFERENCES',
  ON_DELETE: 'ON DELETE',
  ON_UPDATE: 'ON UPDATE',
  ON: 'ON',
  ADD: 'ADD',
  DROP: 'DROP',
} as const;

export const AdaptersEnum = {
  mysql: 'mysql',
  postgresql: 'postgresql',
  sqlite: 'sqlite',
  d1: 'd1',
  d1Remote: 'd1-remote',
  sqlserver: 'sqlserver',
  auroraDataApi: 'aurora-data-api',
} as const;

export const SchOther = {
  TYPE: 'type',
  NUMBER: 'number',
  TABLE: 'table',
  COLUMN: 'column',
  FOREIGN_KEY: 'foreign key',
  REFERENCED_TABLE: 'referenced table',
  REFERENCED_COLUMN: 'referenced column',
  INDEX: 'index',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
  ID: 'id',
} as const;

export type SupportedDriverK = keyof typeof AdaptersEnum;

export type SupportedDriver =
  | typeof AdaptersEnum.sqlite
  | typeof AdaptersEnum.d1
  | typeof AdaptersEnum.d1Remote
  | typeof AdaptersEnum.postgresql
  | typeof AdaptersEnum.mysql
  | typeof AdaptersEnum.sqlserver
  | typeof AdaptersEnum.auroraDataApi;

export function isSqliteFamily(driver: SupportedDriver): boolean {
  return (
    driver === AdaptersEnum.sqlite || driver === AdaptersEnum.d1 || driver === AdaptersEnum.d1Remote
  );
}
