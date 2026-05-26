import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  loggerInfoMock,
  loggerWarnMock,
  loggerErrorMock,
  baseCommandCreateMock,
  resolveD1DatabaseMock,
  getD1DatabaseMock,
  getDefaultD1DatabaseNameMock,
  analyzeSchemaMock,
  checkD1CompatibilityMock,
  buildD1SchemaMock,
  validateSchemaMock,
  generateReportMock,
  migrateDataMock,
} = vi.hoisted(() => ({
  loggerInfoMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  baseCommandCreateMock: vi.fn(),
  resolveD1DatabaseMock: vi.fn(),
  getD1DatabaseMock: vi.fn(),
  getDefaultD1DatabaseNameMock: vi.fn(),
  analyzeSchemaMock: vi.fn(),
  checkD1CompatibilityMock: vi.fn(),
  buildD1SchemaMock: vi.fn(),
  validateSchemaMock: vi.fn(),
  generateReportMock: vi.fn(),
  migrateDataMock: vi.fn(),
}));

vi.mock('@zintrust/core', () => ({
  ErrorFactory: {
    createValidationError: (message: string, cause?: unknown) => {
      const error = new Error(message);
      if (cause !== undefined) {
        (error as Error & { cause?: unknown }).cause = cause;
      }
      return error;
    },
  },
  Logger: {
    info: (...args: unknown[]) => loggerInfoMock(...args),
    warn: (...args: unknown[]) => loggerWarnMock(...args),
    error: (...args: unknown[]) => loggerErrorMock(...args),
  },
}));

vi.mock('@zintrust/core/cli', () => ({
  BaseCommand: {
    create: (...args: unknown[]) => baseCommandCreateMock(...args),
  },
  WranglerConfig: {
    resolveD1Database: (...args: unknown[]) => resolveD1DatabaseMock(...args),
    getD1Database: (...args: unknown[]) => getD1DatabaseMock(...args),
    getDefaultD1DatabaseName: (...args: unknown[]) => getDefaultD1DatabaseNameMock(...args),
  },
}));

vi.mock('../../src/cli/SchemaAnalyzer', () => ({
  SchemaAnalyzer: {
    analyzeSchema: (...args: unknown[]) => analyzeSchemaMock(...args),
    checkD1Compatibility: (...args: unknown[]) => checkD1CompatibilityMock(...args),
  },
}));

vi.mock('../../src/schema/SchemaBuilder', () => ({
  SchemaBuilder: {
    buildD1Schema: (...args: unknown[]) => buildD1SchemaMock(...args),
  },
}));

vi.mock('../../src/schema/Validator', () => ({
  SchemaValidator: {
    validateSchema: (...args: unknown[]) => validateSchemaMock(...args),
    generateReport: (...args: unknown[]) => generateReportMock(...args),
  },
}));

vi.mock('../../src/cli/DataMigrator', () => ({
  DataMigrator: {
    migrateData: (...args: unknown[]) => migrateDataMock(...args),
  },
}));

const createBaseCommand = () => {
  baseCommandCreateMock.mockImplementation((config: Record<string, unknown>) => ({
    ...config,
    getCommand: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }));
};

describe('MigrateToD1Command target selection', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    createBaseCommand();

    process.env['DB_CONNECTION'] = 'mysql';
    process.env['DB_READ_HOSTS'] = '127.0.0.1';
    process.env['DB_PORT'] = '3306';
    process.env['DB_DATABASE'] = 'zupago';
    process.env['DB_USERNAME'] = 'root';
    process.env['DB_PASSWORD'] = 'secret';
    delete process.env['DB_SSL'];
    delete process.env['D1_TARGET_DB'];
    delete process.env['D1_DATABASE'];
    delete process.env['D1_DATABASE_ID'];
    delete process.env['MIGRATE_TO_D1_TARGET_DATABASE'];
    delete process.env['D1_MIGRATOR_TARGET_DATABASE'];
    delete process.env['MIGRATE_TO_D1_SOURCE_CONNECTION'];
    delete process.env['D1_MIGRATOR_SOURCE_CONNECTION'];
    delete process.env['SOURCE_DATABASE_URL'];
    delete process.env['DATABASE_URL'];
    delete process.env['DB_URL'];

    resolveD1DatabaseMock.mockReturnValue({
      status: 'resolved',
      matchedBy: 'single-configured',
      config: { database_name: 'app-dev', binding: 'zintrust_db' },
      configured: [{ database_name: 'app-dev', binding: 'zintrust_db' }],
      matches: [{ database_name: 'app-dev', binding: 'zintrust_db' }],
    });
    getD1DatabaseMock.mockReturnValue({ database_name: 'app-dev', binding: 'zintrust_db' });
    getDefaultD1DatabaseNameMock.mockReturnValue('app-dev');
    analyzeSchemaMock.mockResolvedValue({ tables: [] });
    checkD1CompatibilityMock.mockReturnValue({ compatible: true, issues: [], warnings: [] });
    buildD1SchemaMock.mockReturnValue([]);
    validateSchemaMock.mockReturnValue({ valid: true, errors: [] });
    generateReportMock.mockReturnValue('ok');
    migrateDataMock.mockResolvedValue({ processedRows: 0, totalTables: 0, status: 'completed' });
  });

  afterEach(() => {
    delete process.env['DB_CONNECTION'];
    delete process.env['DB_READ_HOSTS'];
    delete process.env['DB_PORT'];
    delete process.env['DB_DATABASE'];
    delete process.env['DB_USERNAME'];
    delete process.env['DB_PASSWORD'];
    delete process.env['DB_SSL'];
    delete process.env['D1_TARGET_DB'];
    delete process.env['D1_DATABASE'];
    delete process.env['D1_DATABASE_ID'];
    delete process.env['MIGRATE_TO_D1_TARGET_DATABASE'];
    delete process.env['D1_MIGRATOR_TARGET_DATABASE'];
    delete process.env['MIGRATE_TO_D1_SOURCE_CONNECTION'];
    delete process.env['D1_MIGRATOR_SOURCE_CONNECTION'];
    delete process.env['SOURCE_DATABASE_URL'];
    delete process.env['DATABASE_URL'];
    delete process.env['DB_URL'];
  });

  it('uses the unique Wrangler target when D1_TARGET_DB is not set', async () => {
    const { MigrateToD1Command } = await import('../../src/cli/MigrateToD1Command');

    await MigrateToD1Command.execute({});

    expect(resolveD1DatabaseMock).toHaveBeenCalledWith(process.cwd());
    expect(migrateDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceDriver: 'mysql',
        targetDatabase: 'app-dev',
      })
    );
  });

  it('encodes special characters in DB_PASSWORD when building the source connection', async () => {
    process.env['DB_PASSWORD'] = 'test-value!bang';

    const { MigrateToD1Command } = await import('../../src/cli/MigrateToD1Command');

    await MigrateToD1Command.execute({});

    const [{ sourceConnection }] = migrateDataMock.mock.calls.at(-1) as [
      { sourceConnection: string },
    ];

    expect(sourceConnection).toContain('mysql://root:');
    expect(sourceConnection).toContain('%21');
    expect(sourceConnection).not.toContain('test-value!bang@');
  });

  it('encodes &, !, $, and # in DB_PASSWORD when building the source connection', async () => {
    const passwordSegments = ['test-va', '&', 'lue', '!', 'ba', '$', 'ng', '#'];
    process.env['DB_PASSWORD'] = passwordSegments.join('');

    const { MigrateToD1Command } = await import('../../src/cli/MigrateToD1Command');

    await MigrateToD1Command.execute({});

    const [{ sourceConnection }] = migrateDataMock.mock.calls.at(-1) as [
      { sourceConnection: string },
    ];

    expect(sourceConnection).toContain('%26');
    expect(sourceConnection).toContain('%21');
    expect(sourceConnection).toContain('%24');
    expect(sourceConnection).toContain('%23');
    expect(sourceConnection).not.toContain('test-va&lue!ba$ng#@');
  });

  it('propagates DB_SSL to the MySQL migration config', async () => {
    process.env['DB_SSL'] = 'true';

    const { MigrateToD1Command } = await import('../../src/cli/MigrateToD1Command');

    await MigrateToD1Command.execute({});

    expect(migrateDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceDriver: 'mysql',
        sourceSsl: true,
      })
    );
  });

  it('uses d1-remote when the --remote flag is set', async () => {
    const { MigrateToD1Command } = await import('../../src/cli/MigrateToD1Command');

    await MigrateToD1Command.execute({ remote: true });

    expect(migrateDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDatabase: 'app-dev',
        targetType: 'd1-remote',
      })
    );
  });

  it('defaults to d1-remote when the resolved Wrangler target is marked remote', async () => {
    getD1DatabaseMock.mockReturnValue({
      database_name: 'app-dev',
      binding: 'zintrust_db',
      remote: true,
    });

    const { MigrateToD1Command } = await import('../../src/cli/MigrateToD1Command');

    await MigrateToD1Command.execute({});

    expect(getD1DatabaseMock).toHaveBeenCalledWith(process.cwd(), 'app-dev');
    expect(migrateDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetDatabase: 'app-dev',
        targetType: 'd1-remote',
      })
    );
  });

  it('preserves direct source-connection option values exactly as provided', async () => {
    const { MigrateToD1Command } = await import('../../src/cli/MigrateToD1Command');
    const encodedPasswordSegments = ['aafe', '%26', 'cfe269d57790fD3', '%21', 'dba8bcd0'];
    const sourceConnectionInput = `mysql://root:${encodedPasswordSegments.join('')}@127.0.0.1:3306/zupago`;

    await MigrateToD1Command.execute({
      from: 'mysql',
      to: 'd1',
      'target-database': 'app-dev',
      'source-connection': sourceConnectionInput,
    });

    const [{ sourceConnection, sourceConnectionOrigin }] = migrateDataMock.mock.calls.at(-1) as [
      { sourceConnection: string; sourceConnectionOrigin: string },
    ];

    expect(sourceConnection).toBe(sourceConnectionInput);
    expect(sourceConnectionOrigin).toBe('option');
  });

  it('preserves direct source-connection option values for encoded &, !, $, and # exactly as provided', async () => {
    const { MigrateToD1Command } = await import('../../src/cli/MigrateToD1Command');
    const encodedPasswordSegments = ['test-va', '%26', 'lue', '%21', 'ba', '%24', 'ng', '%23'];
    const sourceConnectionInput = `mysql://root:${encodedPasswordSegments.join('')}@127.0.0.1:3306/zupago`;

    await MigrateToD1Command.execute({
      from: 'mysql',
      to: 'd1',
      'target-database': 'app-dev',
      'source-connection': sourceConnectionInput,
    });

    const [{ sourceConnection, sourceConnectionOrigin }] = migrateDataMock.mock.calls.at(-1) as [
      { sourceConnection: string; sourceConnectionOrigin: string },
    ];

    expect(sourceConnection).toBe(sourceConnectionInput);
    expect(sourceConnectionOrigin).toBe('option');
  });

  it('preserves exported source-connection values exactly as provided', async () => {
    const encodedPasswordSegments = ['aafe', '%26', 'cfe269d57790fD3', '%21', 'dba8bcd0'];
    const sourceConnectionInput = `mysql://root:${encodedPasswordSegments.join('')}@127.0.0.1:3306/zupago`;
    process.env['MIGRATE_TO_D1_SOURCE_CONNECTION'] = sourceConnectionInput;

    const { MigrateToD1Command } = await import('../../src/cli/MigrateToD1Command');

    await MigrateToD1Command.execute({});

    const [{ sourceConnection, sourceConnectionOrigin }] = migrateDataMock.mock.calls.at(-1) as [
      { sourceConnection: string; sourceConnectionOrigin: string },
    ];

    expect(sourceConnection).toBe(sourceConnectionInput);
    expect(sourceConnectionOrigin).toBe('env');
  });

  it('does not fall back to DB_DATABASE when multiple Wrangler targets are configured', async () => {
    resolveD1DatabaseMock.mockReturnValueOnce({
      status: 'ambiguous',
      matchedBy: 'multiple-configured',
      configured: [
        { database_name: 'app-dev', binding: 'zintrust_db' },
        { database_name: 'app-preview', binding: 'preview_db' },
      ],
      matches: [
        { database_name: 'app-dev', binding: 'zintrust_db' },
        { database_name: 'app-preview', binding: 'preview_db' },
      ],
    });

    const { MigrateToD1Command } = await import('../../src/cli/MigrateToD1Command');

    await expect(MigrateToD1Command.execute({})).rejects.toThrow(
      /Target D1 database is required because multiple Wrangler D1 targets are configured/
    );
    expect(migrateDataMock).not.toHaveBeenCalled();
  });

  it('fails when the data migrator reports a failed status', async () => {
    migrateDataMock.mockResolvedValueOnce({
      processedRows: 12,
      totalTables: 3,
      status: 'failed',
      errors: {
        users: 'Chunk insert mismatch on users',
      },
    });

    const { MigrateToD1Command } = await import('../../src/cli/MigrateToD1Command');

    await expect(MigrateToD1Command.execute({})).rejects.toThrow(
      /Migration failed after migrating 12 rows/
    );
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Migration finished with failures: 12 rows migrated'
    );
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Migration error details: Chunk insert mismatch on users'
    );
  });

  it('fails clearly when an explicit database_name target is ambiguous', async () => {
    process.env['D1_TARGET_DB'] = 'app-dev';
    resolveD1DatabaseMock.mockReturnValueOnce({
      status: 'ambiguous',
      target: 'app-dev',
      matchedBy: 'database_name',
      configured: [
        { database_name: 'app-dev', binding: 'zintrust_db' },
        { database_name: 'app-dev', binding: 'shadow_db' },
      ],
      matches: [
        { database_name: 'app-dev', binding: 'zintrust_db' },
        { database_name: 'app-dev', binding: 'shadow_db' },
      ],
    });

    const { MigrateToD1Command } = await import('../../src/cli/MigrateToD1Command');

    await expect(MigrateToD1Command.execute({})).rejects.toThrow(
      /Target D1 database "app-dev" is ambiguous by database_name/
    );
    expect(migrateDataMock).not.toHaveBeenCalled();
  });
});
