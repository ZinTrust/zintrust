import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureProxyEnvLoadedForCwd: vi.fn(),
  info: vi.fn(),
  watch: vi.fn(),
  spawn: vi.fn(),
  start: vi.fn(async () => undefined),
  watchCallback: undefined as
    | ((eventType: string, filename: string | null) => void)
    | undefined,
  watcherClose: vi.fn(),
  childKill: vi.fn(),
  sigintHandlers: [] as Array<() => void>,
}));

vi.mock('@cli/commands/ProxyCommandUtils', () => ({
  ensureProxyEnvLoadedForCwd: mocks.ensureProxyEnvLoadedForCwd,
}));

vi.mock('@config/logger', () => ({
  Logger: { info: mocks.info, error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@config/env', () => ({
  Env: {
    get: (_key: string, fallback: unknown) => fallback,
    getInt: (_key: string, fallback: number) => fallback,
    getBool: (_key: string, fallback: boolean) => fallback,
  },
}));

vi.mock('commander', () => ({
  Command: class {
    description = vi.fn();
    option = vi.fn();
    action = vi.fn();
  },
}));

vi.mock('node:fs', () => ({
  watch: (...args: unknown[]) => {
    mocks.watch(...args);
    mocks.watchCallback = args[2] as typeof mocks.watchCallback;
    return { close: mocks.watcherClose };
  },
}));

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => {
    mocks.spawn(...args);
    return { kill: mocks.childKill };
  },
}));

vi.mock('@proxy/sqlserver/SqlServerProxyServer', () => ({
  SqlServerProxyServer: { start: (...args: unknown[]) => (mocks.start as (...a: any[]) => any)(...args) },
}));

import { SqlServerProxyCommand } from '@cli/commands/SqlServerProxyCommand';

const getExecute = () => {
  const command = SqlServerProxyCommand.create() as unknown as {
    action: { mock: { calls: Array<[(options: Record<string, unknown>) => Promise<void>]> } };
  };
  return command.action.mock.calls[0]![0]!;
};

describe('SqlServerProxyCommand uncovered branches', () => {
  let sigintSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.watchCallback = undefined;
    mocks.sigintHandlers = [];

    sigintSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, handler: () => void) => {
      if (event === 'SIGINT') mocks.sigintHandlers.push(handler);
      return process;
    }) as never);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    sigintSpy.mockRestore();
    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('starts normal mode with converted configuration when watch is not requested', async () => {
    await getExecute()({
      host: '0.0.0.0',
      port: '8793',
      dbHost: 'db.local',
      dbPort: '1433',
      dbName: 'zintrust',
      dbUser: 'sa',
      dbPass: 'secret',
      connectionLimit: '5',
      keyId: 'key-1',
      secret: 'signing-secret',
      requireSigning: true,
      signingWindowMs: '1000',
    });

    expect(mocks.start).toHaveBeenCalledWith({
      host: '0.0.0.0',
      port: 8793,
      dbHost: 'db.local',
      dbPort: 1433,
      dbName: 'zintrust',
      dbUser: 'sa',
      dbPass: 'secret',
      connectionLimit: 5,
      keyId: 'key-1',
      secret: 'signing-secret',
      requireSigning: true,
      signingWindowMs: 1000,
    });
    expect(mocks.watch).not.toHaveBeenCalled();
  });

  it('skips watch values and undefined values when building restart arguments', async () => {
    await getExecute()({
      watch: true,
      host: 'localhost',
      route: undefined,
      verbose: false,
    });

    expect(mocks.spawn).toHaveBeenCalledWith(
      'npm',
      ['run', 'cli', 'proxy:sqlserver', '--host', 'localhost', '--verbose', 'false'],
      { stdio: 'inherit' }
    );
    expect(mocks.watch).toHaveBeenCalledWith('./src', { recursive: true }, expect.any(Function));
  });

  it('ignores file events without a usable filename and restarts on JS/TS changes', async () => {
    await getExecute()({ watch: true, host: 'localhost' });
    const onChange = mocks.watchCallback!;

    mocks.childKill.mockClear();
    mocks.spawn.mockClear();
    onChange('change', null);
    onChange('change', '');
    onChange('change', 'notes.txt');

    expect(mocks.spawn).not.toHaveBeenCalled();

    onChange('change', 'src/server.ts');
    expect(mocks.childKill).toHaveBeenCalledTimes(1);
    expect(mocks.spawn).toHaveBeenCalledTimes(1);

    mocks.childKill.mockClear();
    mocks.spawn.mockClear();
    onChange('change', 'dist/server.js');
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
  });

  it('closes the watcher and kills the child on SIGINT', async () => {
    await getExecute()({ watch: true });
    expect(mocks.sigintHandlers).toHaveLength(1);

    mocks.sigintHandlers[0]!();

    expect(mocks.watcherClose).toHaveBeenCalledTimes(1);
    expect(mocks.childKill).toHaveBeenCalledTimes(1);
  });
});
