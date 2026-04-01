import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorHandler } from '@cli/ErrorHandler';

const envStrings: Record<string, string> = {
  DEBUGGER_ENABLED: 'true',
  DEBUGGER_DB_CONNECTION: 'default',
  DEBUGGER_BASE_PATH: '/debugger',
  HOST: '127.0.0.1',
  PORT: '7777',
};

const resolvedStorage = {
  prune: vi.fn(),
  clear: vi.fn(),
  stats: vi.fn(),
};

vi.mock('@common/ExternalServiceUtils', () => ({
  readEnvString: vi.fn((key: string) => envStrings[key] ?? ''),
}));

vi.mock('@config/logger', () => ({
  Logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@cli/ErrorHandler', () => ({
  ErrorHandler: {
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@cli/utils/DatabaseCliUtils', () => ({
  confirmProductionRun: vi.fn().mockResolvedValue(true),
  mapConnectionToOrmConfig: vi.fn((config: unknown) => config),
  parseRollbackSteps: vi.fn(() => 1),
}));

vi.mock('@config/database', () => ({
  databaseConfig: {
    connections: {
      default: {
        driver: 'sqlite',
        database: 'db.sqlite',
      },
      analytics: {
        driver: 'sqlite',
        database: 'analytics.sqlite',
      },
    },
    migrations: { extension: 'ts' },
    getConnection: vi.fn(() => ({
      driver: 'sqlite',
      database: 'db.sqlite',
    })),
  },
}));

vi.mock('@orm/Database', () => ({
  Database: {
    create: vi.fn(() => ({
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    })),
  },
}));

vi.mock('@orm/DatabaseAdapterRegistry', () => ({
  DatabaseAdapterRegistry: {
    has: vi.fn(() => true),
  },
}));

vi.mock('@migrations/Migrator', () => ({
  Migrator: {
    create: vi.fn(),
  },
}));

vi.mock('@node-singletons/module', () => ({
  createRequire: vi.fn(() => ({
    resolve: vi.fn(() => '/tmp/node_modules/@zintrust/system-debugger/migrations/index.js'),
  })),
}));

vi.mock('@zintrust/core', () => ({
  useDatabase: vi.fn(() => ({})),
}));

vi.mock('@zintrust/system-debugger', () => ({
  DebuggerConfig: {
    merge: vi.fn(() => ({ pruneAfterHours: 24, connection: 'default' })),
  },
  DebuggerStorage: {
    resolveStorage: vi.fn(() => resolvedStorage),
  },
}));

describe('DebuggerCommands', () => {
  afterEach(() => {
    resolvedStorage.prune.mockReset();
    resolvedStorage.clear.mockReset();
    resolvedStorage.stats.mockReset();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('prints debugger status with dashboard URL and entry counts', async () => {
    resolvedStorage.stats.mockResolvedValue({ query: 2, request: 5 });

    const { DebuggerCommands } = await import('@cli/commands/DebuggerCommands');
    const cmd = DebuggerCommands.createDebuggerStatusCommand();

    await cmd.execute({});

    expect(ErrorHandler.info).toHaveBeenCalledWith('Connection: default');
    expect(ErrorHandler.info).toHaveBeenCalledWith('Dashboard: http://127.0.0.1:7777/debugger');
    expect(ErrorHandler.info).toHaveBeenCalledWith('query: 2');
    expect(ErrorHandler.info).toHaveBeenCalledWith('request: 5');
  });

  it('runs debugger migration status against an explicit connection', async () => {
    const { Migrator } = await import('@migrations/Migrator');
    (Migrator.create as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      status: vi
        .fn()
        .mockResolvedValue([
          {
            name: '001_debugger_init',
            status: 'applied',
            applied: true,
            batch: 1,
            appliedAt: 'now',
          },
        ]),
      migrate: vi.fn(),
      fresh: vi.fn(),
      resetAll: vi.fn(),
      rollbackLastBatch: vi.fn(),
    });

    const { DebuggerCommands } = await import('@cli/commands/DebuggerCommands');
    const cmd = DebuggerCommands.createDebuggerMigrateCommand();

    await cmd.execute({ status: true, connection: 'analytics' });

    expect(ErrorHandler.info).toHaveBeenCalledWith(expect.stringContaining('Adapter: sqlite'));
    expect(ErrorHandler.info).toHaveBeenCalledWith(
      expect.stringContaining('applied: 001_debugger_init')
    );
  });
});
