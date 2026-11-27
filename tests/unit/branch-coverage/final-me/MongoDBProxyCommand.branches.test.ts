import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  action: undefined as unknown as (options: Record<string, unknown>) => Promise<void>,
  spawn: vi.fn(),
  watch: vi.fn(),
  envGet: vi.fn(),
  envInt: vi.fn(),
  envBool: vi.fn(),
  ensureEnv: vi.fn(),
  startProxy: vi.fn(),
}));

vi.mock('commander', () => ({
  Command: class {
    constructor(public name: string) {}
    description() {
      return this;
    }
    option() {
      return this;
    }
    action(fn: (options: Record<string, unknown>) => Promise<void>) {
      mocks.action = fn;
      return this;
    }
  },
}));
vi.mock('@config/env', () => ({
  Env: { get: mocks.envGet, getInt: mocks.envInt, getBool: mocks.envBool },
}));
vi.mock('@config/logger', () => ({ Logger: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@cli/commands/ProxyCommandUtils', () => ({
  ensureProxyEnvLoadedForCwd: mocks.ensureEnv,
}));
vi.mock('@proxy/mongodb/MongoDBProxyServer', () => ({
  MongoDBProxyServer: { start: mocks.startProxy },
}));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('node:fs', () => ({ watch: mocks.watch }));

import { MongoDBProxyCommand } from '@cli/commands/MongoDBProxyCommand';

describe('MongoDBProxyCommand branches', () => {
  let watchCallback: ((event: string, filename: string | null) => void) | undefined;
  let sigintCallback: (() => void) | undefined;
  const watcher = { close: vi.fn() };
  const child = { kill: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    mocks.envGet.mockImplementation((_k: string, fallback: string) => fallback);
    mocks.envInt.mockImplementation((_k: string, fallback: number) => fallback);
    mocks.envBool.mockImplementation((_k: string, fallback: boolean) => fallback);
    mocks.spawn.mockReturnValue(child);
    watchCallback = undefined;
    sigintCallback = undefined;
    mocks.watch.mockImplementation((_path: string, _opts: unknown, cb: any) => {
      watchCallback = cb;
      return watcher;
    });
    vi.spyOn(process, 'on').mockImplementation(((event: string, cb: () => void) => {
      if (event === 'SIGINT') sigintCallback = cb;
      return process;
    }) as any);
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
    const cmd = MongoDBProxyCommand.create();
    expect(cmd.name).toBe('proxy:mongodb');
    expect(mocks.ensureEnv).toHaveBeenCalled();
  });

  it('watch mode builds flags for booleans, values and unknown keys', async () => {
    await mocks.action({
      watch: true,
      port: 9000,
      requireSigning: true,
      strict: false,
      mongoUri: 'uri',
      mongoDb: 'db',
      extra: 42,
      nil: undefined,
      nothing: null,
    });
    expect(mocks.spawn).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining([
        'run',
        'cli',
        'proxy:mongodb',
        '--port',
        '9000',
        '--require-signing',
        '--mongo-uri',
        'uri',
        '--mongo-db',
        'db',
        '--extra',
        '42',
      ]),
      { stdio: 'inherit' }
    );
    expect(mocks.watch).toHaveBeenCalled();

    watchCallback?.('change', 'file.ts');
    expect(mocks.spawn).toHaveBeenCalledTimes(2);
    watchCallback?.('change', 'file.js');
    expect(mocks.spawn).toHaveBeenCalledTimes(3);
    watchCallback?.('change', 'file.txt');
    watchCallback?.('change', null);
    expect(mocks.spawn).toHaveBeenCalledTimes(3);

    sigintCallback?.();
    expect(watcher.close).toHaveBeenCalled();
    expect(child.kill).toHaveBeenCalledTimes(3);
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('normal mode requires uri and db and otherwise starts with built config', async () => {
    await expect(mocks.action({ host: 'h', port: '1234' })).rejects.toThrow(
      /MongoDB URI and database name are required/
    );
    await mocks.action({
      host: 'h',
      port: '1234',
      mongoUri: 'mongodb://x',
      mongoDb: 'db',
      keyId: 'kid',
      secret: 'sec',
      requireSigning: true,
      signingWindowMs: '5000',
    });
    expect(mocks.startProxy).toHaveBeenCalledWith({
      host: 'h',
      port: 1234,
      mongoUri: 'mongodb://x',
      mongoDb: 'db',
      keyId: 'kid',
      secret: 'sec',
      requireSigning: true,
      signingWindowMs: 5000,
    });
  });
});
