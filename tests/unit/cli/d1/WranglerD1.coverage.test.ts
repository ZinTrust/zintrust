import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveNpmPathMock = vi.fn(() => 'npm');
const execFileSyncMock = vi.fn<(...args: unknown[]) => string>(() => 'ok');
const loggerDebugMock = vi.fn<(...args: unknown[]) => void>();

vi.mock('@common/index', () => ({
  resolveNpmPath: () => resolveNpmPathMock(),
}));

vi.mock('@config/app', () => ({
  appConfig: { getSafeEnv: () => ({ TEST: '1' }) },
}));

vi.mock('@config/logger', () => ({
  Logger: { debug: (...args: unknown[]) => loggerDebugMock(...args) },
}));

vi.mock('@node-singletons/child-process', () => ({
  execFileSync: (...args: unknown[]) => execFileSyncMock(...args),
}));

import { WranglerD1 } from '../../../../src/cli/d1/WranglerD1';

describe('cli/d1/WranglerD1 (coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execFileSyncMock.mockReturnValue('ok');
  });

  it('logs through the command object when applying migrations', () => {
    const cmd = { debug: vi.fn() } as any;

    const result = WranglerD1.applyMigrations({ cmd, dbName: 'db-one', isLocal: true });

    expect(result).toBe('ok');
    expect(cmd.debug).toHaveBeenCalledWith(
      '[WranglerD1] Executing d1 migrations apply for db-one (local)'
    );
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'npm',
      ['exec', '--yes', '--', 'wrangler', 'd1', 'migrations', 'apply', 'db-one', '--local'],
      expect.objectContaining({ encoding: 'utf8', stdio: 'pipe', env: { TEST: '1' } })
    );
  });

  it('uses Logger.debug and executes SQL when no command object is provided', () => {
    const result = WranglerD1.executeSql({
      dbName: 'db-two',
      isLocal: false,
      sql: 'SELECT 1',
    });

    expect(result).toBe('ok');
    expect(loggerDebugMock).toHaveBeenCalledWith(
      '[WranglerD1] Executing d1 execute db-two for --remote (remote)'
    );
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'npm',
      [
        'exec',
        '--yes',
        '--',
        'wrangler',
        'd1',
        'execute',
        'db-two',
        '--remote',
        '--json',
        '--command',
        'SELECT 1',
      ],
      expect.any(Object)
    );
  });

  it('executes SQL from file when file option is provided', () => {
    const result = WranglerD1.executeSql({
      dbName: 'db-three',
      isLocal: true,
      file: '/path/to/file.sql',
    });

    expect(result).toBe('ok');
    expect(loggerDebugMock).toHaveBeenCalledWith(
      '[WranglerD1] Executing d1 execute db-three for --local (local)'
    );
    expect(execFileSyncMock).toHaveBeenCalledWith(
      'npm',
      [
        'exec',
        '--yes',
        '--',
        'wrangler',
        'd1',
        'execute',
        'db-three',
        '--local',
        '--json',
        '--file',
        '/path/to/file.sql',
      ],
      expect.any(Object)
    );
  });

  it('throws validation error when neither sql nor file is provided', () => {
    expect(() =>
      WranglerD1.executeSql({
        dbName: 'db-four',
        isLocal: false,
      } as any)
    ).toThrow('Must provide either sql command or file for D1 execution');
  });
});
