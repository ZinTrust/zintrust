import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  loggerInfoMock,
  loggerErrorMock,
  loggerWarnMock,
  loggerDebugMock,
  resolveD1BindingMock,
  resolveLocalD1SqlitePathMock,
  sqliteCreateMock,
  mysqlCreateMock,
  postgresCreateMock,
  sqlServerCreateMock,
  analyzeSchemaMock,
  buildD1SchemaMock,
} = vi.hoisted(() => ({
  loggerInfoMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  resolveD1BindingMock: vi.fn(),
  resolveLocalD1SqlitePathMock: vi.fn(),
  sqliteCreateMock: vi.fn(),
  mysqlCreateMock: vi.fn(),
  postgresCreateMock: vi.fn(),
  sqlServerCreateMock: vi.fn(),
  analyzeSchemaMock: vi.fn(),
  buildD1SchemaMock: vi.fn(),
}));

vi.mock('@zintrust/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@zintrust/core')>();

  return {
    ...actual,
    ErrorFactory: {
      createValidationError: (message: string, cause?: unknown) => {
        const error = new Error(message);
        if (cause !== undefined) {
          (error as Error & { cause?: unknown }).cause = cause;
        }
        return error;
      },
      createConnectionError: (message: string, cause?: unknown) => {
        const error = new Error(message);
        if (cause !== undefined) {
          (error as Error & { cause?: unknown }).cause = cause;
        }
        return error;
      },
    },
    LocalD1Resolver: {
      resolveD1Binding: (...args: unknown[]) => resolveD1BindingMock(...args),
      resolveLocalD1SqlitePath: (...args: unknown[]) => resolveLocalD1SqlitePathMock(...args),
    },
    Logger: {
      info: (...args: unknown[]) => loggerInfoMock(...args),
      error: (...args: unknown[]) => loggerErrorMock(...args),
      warn: (...args: unknown[]) => loggerWarnMock(...args),
      debug: (...args: unknown[]) => loggerDebugMock(...args),
    },
  };
});

vi.mock('@zintrust/db-mysql', () => ({
  MySQLAdapter: {
    create: (...args: unknown[]) => mysqlCreateMock(...args),
  },
}));

vi.mock('@zintrust/db-postgres', () => ({
  PostgreSQLAdapter: {
    create: (...args: unknown[]) => postgresCreateMock(...args),
  },
}));

vi.mock('@zintrust/db-sqlite', () => ({
  SQLiteAdapter: {
    create: (...args: unknown[]) => sqliteCreateMock(...args),
  },
}));

vi.mock('@zintrust/db-sqlserver', () => ({
  SQLServerAdapter: {
    create: (...args: unknown[]) => sqlServerCreateMock(...args),
  },
}));

vi.mock('../../src/cli/SchemaAnalyzer', () => ({
  SchemaAnalyzer: {
    analyzeSchema: (...args: unknown[]) => analyzeSchemaMock(...args),
  },
}));

vi.mock('../../src/schema/SchemaBuilder', () => ({
  SchemaBuilder: {
    buildD1Schema: (...args: unknown[]) => buildD1SchemaMock(...args),
    generateCreateTableSQL: vi.fn(),
    generateIndexSQL: vi.fn(() => []),
  },
}));

describe('DataMigrator logging and totals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveD1BindingMock.mockReturnValue({
      matchedBy: 'database_name',
      databaseName: 'app-dev',
      config: {
        database_name: 'app-dev',
        binding: 'PRIMARY_DB',
      },
    });
    resolveLocalD1SqlitePathMock.mockResolvedValue('/tmp/.wrangler/app-dev.sqlite');
    buildD1SchemaMock.mockReturnValue([]);
    analyzeSchemaMock.mockResolvedValue({
      tables: [
        {
          name: 'users',
          primaryKey: 'id',
          columns: [],
          indexes: [],
          foreignKeys: [],
          primaryKeys: ['id'],
          rowCount: 3,
        },
      ],
    });
  });

  it('logs the resolved D1 target and normalizes final migrated totals', async () => {
    const sourceRows = [
      { id: 1, email: 'one@example.com' },
      { id: 2, email: 'two@example.com' },
      { id: 3, email: 'three@example.com' },
      { id: 4, email: 'four@example.com' },
      { id: 5, email: 'five@example.com' },
    ];

    const sourceAdapter = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.startsWith('SELECT * FROM `users`')) {
          return Promise.resolve({ rows: sourceRows });
        }

        return Promise.resolve({ rows: [] });
      }),
    };

    const targetAdapter = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    mysqlCreateMock.mockReturnValue(sourceAdapter);
    sqliteCreateMock.mockReturnValue(targetAdapter);

    const { DataMigrator } = await import('../../src/cli/DataMigrator');

    const progress = await DataMigrator.migrateData({
      migrationId: 'migration-1',
      sourceDriver: 'mysql',
      sourceConnection: 'mysql://root:secret@127.0.0.1:3306/app',
      targetType: 'd1',
      targetDatabase: 'app-dev',
      batchSize: 10,
    });

    expect(progress.processedRows).toBe(5);
    expect(progress.totalRows).toBe(5);
    expect(progress.percentage).toBe(100);
    expect(progress.status).toBe('completed');

    expect(loggerInfoMock).toHaveBeenCalledWith(
      '[DataMigrator] Using resolved local D1 target (database_name): database_name=app-dev, binding=PRIMARY_DB'
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      '[DataMigrator] Using resolved local D1 SQLite path: /tmp/.wrangler/app-dev.sqlite'
    );
    expect(loggerInfoMock).toHaveBeenCalledWith('Migration completed: 5/5 rows migrated');

    const migrationTableLogs = loggerInfoMock.mock.calls.filter(
      ([message]) => message === 'Migrating table: users'
    );
    expect(migrationTableLogs).toHaveLength(1);
  });
});
