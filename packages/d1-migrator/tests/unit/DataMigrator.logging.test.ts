import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  loggerInfoMock,
  loggerErrorMock,
  loggerWarnMock,
  loggerDebugMock,
  resolveD1BindingMock,
  resolveLocalD1SqlitePathMock,
  wranglerExecuteSqlMock,
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
  wranglerExecuteSqlMock: vi.fn(),
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
    WranglerD1: {
      executeSql: (...args: unknown[]) => wranglerExecuteSqlMock(...args),
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
    assertValidSchema: vi.fn(),
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
        if (!sql.startsWith('SELECT * FROM `users`')) {
          return Promise.resolve({ rows: [] });
        }

        const limitMatch = sql.match(/LIMIT (\d+)/i);
        const offsetMatch = sql.match(/OFFSET (\d+)/i);
        const limit = limitMatch ? Number.parseInt(limitMatch[1], 10) : sourceRows.length;
        const offset = offsetMatch ? Number.parseInt(offsetMatch[1], 10) : 0;
        return Promise.resolve({ rows: sourceRows.slice(offset, offset + limit) });
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

  it('passes the decoded MySQL password to the adapter for encoded source URLs', async () => {
    const sourceAdapter = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    const targetAdapter = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    mysqlCreateMock.mockReturnValue(sourceAdapter);
    sqliteCreateMock.mockReturnValue(targetAdapter);
    analyzeSchemaMock.mockResolvedValue({ tables: [] });

    const { DataMigrator } = await import('../../src/cli/DataMigrator');
    const encodedPasswordSegments = ['afe', '%26', 'cfe269d57790fD3', '%21', 'dba8b'];
    const sourceConnection = `mysql://root:${encodedPasswordSegments.join('')}@127.0.0.1:3306/app`;

    await DataMigrator.migrateData({
      migrationId: 'migration-encoded-password',
      sourceDriver: 'mysql',
      sourceConnection,
      sourceConnectionOrigin: 'option',
      targetType: 'd1',
      targetDatabase: 'app-dev',
      batchSize: 10,
    });

    expect(mysqlCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        driver: 'mysql',
        username: 'root',
        password: 'afe&cfe269d57790fD3!dba8b',
      })
    );
  });

  it('passes ssl to the MySQL adapter when sourceSsl is enabled', async () => {
    const sourceAdapter = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    const targetAdapter = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    mysqlCreateMock.mockReturnValue(sourceAdapter);
    sqliteCreateMock.mockReturnValue(targetAdapter);
    analyzeSchemaMock.mockResolvedValue({ tables: [] });

    const { DataMigrator } = await import('../../src/cli/DataMigrator');

    await DataMigrator.migrateData({
      migrationId: 'migration-ssl',
      sourceDriver: 'mysql',
      sourceConnection: 'mysql://root:secret@127.0.0.1:3306/app',
      sourceSsl: true,
      targetType: 'd1',
      targetDatabase: 'app-dev',
      batchSize: 10,
    });

    expect(mysqlCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        driver: 'mysql',
        ssl: true,
      })
    );
  });

  it('uses Wrangler remote D1 execution when targetType is d1-remote', async () => {
    const sourceRows = [
      { id: 1, email: 'one@example.com' },
      { id: 2, email: 'two@example.com' },
      { id: 3, email: 'three@example.com' },
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

    mysqlCreateMock.mockReturnValue(sourceAdapter);
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
    buildD1SchemaMock.mockReturnValue([
      {
        name: 'users',
        columns: [],
        indexes: [],
      },
    ]);

    const { SchemaBuilder } = await import('../../src/schema/SchemaBuilder');
    vi.mocked(SchemaBuilder.generateCreateTableSQL).mockReturnValue(
      'CREATE TABLE users (id INTEGER)'
    );
    vi.mocked(SchemaBuilder.generateIndexSQL).mockReturnValue([]);

    wranglerExecuteSqlMock.mockImplementation(({ sql }: { sql: string }) => {
      if (sql.includes('SELECT COUNT(*) as count FROM `users`')) {
        return JSON.stringify([{ results: [{ count: 0 }] }]);
      }

      return JSON.stringify([{ results: [], meta: { changes: 3 } }]);
    });

    const { DataMigrator } = await import('../../src/cli/DataMigrator');

    const progress = await DataMigrator.migrateData({
      migrationId: 'migration-remote',
      sourceDriver: 'mysql',
      sourceConnection: 'mysql://root:secret@127.0.0.1:3306/app',
      targetType: 'd1-remote',
      targetDatabase: 'app-dev',
      batchSize: 10,
    });

    expect(progress.processedRows).toBe(3);
    expect(wranglerExecuteSqlMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dbName: 'app-dev',
        isLocal: false,
      })
    );
    expect(
      wranglerExecuteSqlMock.mock.calls.filter(
        ([arg]) => !(arg as { sql: string }).sql.includes('SELECT COUNT(*) as count FROM `users`')
      )
    ).toHaveLength(2);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      '[DataMigrator] Using Wrangler remote D1 target: app-dev'
    );
    expect(
      loggerInfoMock.mock.calls.some(
        ([message]) =>
          typeof message === 'string' &&
          message.includes('[DataMigrator] Chunk users offset=0 rows=3 duration=')
      )
    ).toBe(true);
    expect(
      loggerInfoMock.mock.calls.some(
        ([message]) =>
          typeof message === 'string' &&
          message.includes('[DataMigrator] Table users completed rows=3/3 duration=')
      )
    ).toBe(true);
  });

  it('groups remote tables into dependency-safe migration levels', async () => {
    const sourceAdapter = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.startsWith('SELECT * FROM `accounts`')) {
          return Promise.resolve({ rows: [{ id: 1, name: 'Acme' }] });
        }

        if (sql.startsWith('SELECT * FROM `users`')) {
          return Promise.resolve({ rows: [{ id: 1, account_id: 1 }] });
        }

        return Promise.resolve({ rows: [] });
      }),
    };

    mysqlCreateMock.mockReturnValue(sourceAdapter);
    analyzeSchemaMock.mockResolvedValue({
      tables: [
        {
          name: 'accounts',
          primaryKey: 'id',
          columns: [],
          indexes: [],
          foreignKeys: [],
          primaryKeys: ['id'],
          rowCount: 1,
        },
        {
          name: 'users',
          primaryKey: 'id',
          columns: [],
          indexes: [],
          foreignKeys: [
            {
              name: 'users_account_id_foreign',
              column: 'account_id',
              referencedTable: 'accounts',
              referencedColumn: 'id',
            },
          ],
          primaryKeys: ['id'],
          rowCount: 1,
        },
      ],
    });
    buildD1SchemaMock.mockReturnValue([]);

    wranglerExecuteSqlMock.mockImplementation(({ sql }: { sql: string }) => {
      if (sql.includes('SELECT COUNT(*) as count FROM `accounts`')) {
        return JSON.stringify([{ results: [{ count: 0 }] }]);
      }

      if (sql.includes('SELECT COUNT(*) as count FROM `users`')) {
        return JSON.stringify([{ results: [{ count: 0 }] }]);
      }

      return JSON.stringify([{ results: [], meta: { changes: 1 } }]);
    });

    const { DataMigrator } = await import('../../src/cli/DataMigrator');

    const progress = await DataMigrator.migrateData({
      migrationId: 'migration-remote-dependency-levels',
      sourceDriver: 'mysql',
      sourceConnection: 'mysql://root:secret@127.0.0.1:3306/app',
      targetType: 'd1-remote',
      targetDatabase: 'app-dev',
      batchSize: 10,
    });

    expect(progress.processedRows).toBe(2);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      '[DataMigrator] Starting table level 1/2: accounts'
    );
    expect(loggerInfoMock).toHaveBeenCalledWith('[DataMigrator] Starting table level 2/2: users');
  });

  it('adapts remote batch sizing upward after a fast large remote insert', async () => {
    const sourceRows = Array.from({ length: 1000 }, (_, index) => ({
      id: index + 1,
      email: `user-${index + 1}@example.com`,
    }));
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

    mysqlCreateMock.mockReturnValue(sourceAdapter);
    analyzeSchemaMock.mockResolvedValue({
      tables: [
        {
          name: 'users',
          primaryKey: 'id',
          columns: [],
          indexes: [],
          foreignKeys: [],
          primaryKeys: ['id'],
          rowCount: 1000,
        },
      ],
    });
    buildD1SchemaMock.mockReturnValue([]);

    wranglerExecuteSqlMock.mockImplementation(({ sql }: { sql: string }) => {
      if (sql.includes('SELECT COUNT(*) as count FROM `users`')) {
        return JSON.stringify([{ results: [{ count: 0 }] }]);
      }

      const statementCount = (sql.match(/INSERT INTO /g) ?? []).length;
      const tupleSeparators = (sql.match(/\),\s*\(/g) ?? []).length;
      const changes = statementCount + tupleSeparators;

      return JSON.stringify([{ results: [], meta: { changes } }]);
    });

    const { DataMigrator } = await import('../../src/cli/DataMigrator');

    const progress = await DataMigrator.migrateData({
      migrationId: 'migration-remote-adaptive-batching',
      sourceDriver: 'mysql',
      sourceConnection: 'mysql://root:secret@127.0.0.1:3306/app',
      targetType: 'd1-remote',
      targetDatabase: 'app-dev',
      batchSize: 1000,
    });

    expect(progress.processedRows).toBeGreaterThanOrEqual(1000);
    expect(
      loggerInfoMock.mock.calls.some(
        ([message]) =>
          typeof message === 'string' &&
          message.includes(
            '[DataMigrator] Adaptive remote batching: rows_per_statement 1000 -> 1300'
          )
      )
    ).toBe(true);
  });

  it('falls back to parsing Wrangler table output for remote D1 count queries', async () => {
    const sourceAdapter = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };

    mysqlCreateMock.mockReturnValue(sourceAdapter);
    analyzeSchemaMock.mockResolvedValue({
      tables: [
        {
          name: 'users',
          primaryKey: 'id',
          columns: [],
          indexes: [],
          foreignKeys: [],
          primaryKeys: ['id'],
          rowCount: 1,
        },
      ],
    });
    buildD1SchemaMock.mockReturnValue([]);

    wranglerExecuteSqlMock.mockImplementation(({ sql }: { sql: string }) => {
      if (sql.includes('SELECT COUNT(*) as count FROM `users`')) {
        return ['│ count │', '│ 1 │'].join('\n');
      }

      return '';
    });

    const { DataMigrator } = await import('../../src/cli/DataMigrator');

    const progress = await DataMigrator.migrateData({
      migrationId: 'migration-remote-table-output',
      sourceDriver: 'mysql',
      sourceConnection: 'mysql://root:secret@127.0.0.1:3306/app',
      targetType: 'd1-remote',
      targetDatabase: 'app-dev',
      batchSize: 10,
    });

    expect(progress.processedRows).toBe(0);
    expect(loggerInfoMock).toHaveBeenCalledWith('Table users already synced: 1/1 rows, skipping');
  });

  it('logs chunk read failures as warnings without leaking sql text', async () => {
    const sourceAdapter = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockRejectedValue(new Error('upstream read failed')),
    };

    mysqlCreateMock.mockReturnValue(sourceAdapter);
    analyzeSchemaMock.mockResolvedValue({
      tables: [],
    });
    buildD1SchemaMock.mockReturnValue([]);

    const { DataMigrator } = await import('../../src/cli/DataMigrator');

    await expect(
      DataMigrator.readDataChunk(
        {
          driver: 'mysql',
          connectionString: 'mysql://root:secret@127.0.0.1:3306/app',
          connected: true,
          adapter: sourceAdapter,
        },
        'users',
        0,
        100
      )
    ).rejects.toThrow('upstream read failed');

    expect(loggerWarnMock).toHaveBeenCalledWith('Chunk read failed: upstream read failed');
    expect(loggerErrorMock).not.toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM `users`')
    );
  });
});
