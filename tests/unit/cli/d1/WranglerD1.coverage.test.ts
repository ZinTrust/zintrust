import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveNpmPathMock = vi.fn(() => 'npm');
const execFileSyncMock = vi.fn(() => 'ok');
const loggerDebugMock = vi.fn();

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
      'Executing: npm exec --yes -- wrangler d1 migrations apply db-one --local'
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
      '[WranglerD1] Executing: npm exec --yes -- wrangler d1 execute db-two --remote --command SELECT 1'
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
        '--command',
        'SELECT 1',
      ],
      expect.any(Object)
    );
  });
});
