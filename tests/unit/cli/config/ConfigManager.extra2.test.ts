import { afterEach, describe, expect, test, vi } from 'vitest';

type FsPromisesStub = {
  readFile: (path: string, encoding: string) => Promise<string>;
  writeFile: (path: string, data: string) => Promise<void>;
  mkdir: (path: string, opts: { recursive: boolean }) => Promise<void>;
  access: (path: string) => Promise<void>;
};

const makeFsStub = (overrides: Partial<FsPromisesStub> = {}): FsPromisesStub => {
  return {
    readFile: vi.fn(async () => '{"app": {"name": "ZinTrust"}}'),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    access: vi.fn(async () => undefined),
    ...overrides,
  };
};

const mockFsModule = async (fsPromises: Partial<FsPromisesStub>): Promise<void> => {
  vi.resetModules();
  vi.doUnmock('@node-singletons/fs');
  vi.doMock('@node-singletons/fs', () => ({
    fsPromises: makeFsStub(fsPromises),
  }));
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConfigManager - error and helper branches', () => {
  test('save throws config error when there is nothing to save', async () => {
    await mockFsModule({});

    const { ConfigManager } = await import('@cli/config/ConfigManager');
    const mgr = ConfigManager.create('/tmp/zintrust/config.json');

    await expect(mgr.save()).rejects.toThrow('No configuration to save');
  });

  test('save rethrows write errors (covers saveConfig catch)', async () => {
    await mockFsModule({
      writeFile: async () => {
        throw new Error('write fail');
      },
    });

    const { ConfigManager } = await import('@cli/config/ConfigManager');
    const mgr = ConfigManager.create('/tmp/zintrust/config.json');

    await expect(mgr.save({} as any)).rejects.toThrow('write fail');
  });

  test('create surfaces mkdir errors', async () => {
    await mockFsModule({
      mkdir: async () => {
        throw new Error('mkdir fail');
      },
    });

    const { ConfigManager } = await import('@cli/config/ConfigManager');
    const mgr = ConfigManager.create('/tmp/another/config.json');

    await expect(mgr.create({})).rejects.toThrow('mkdir fail');
  });

  test('load uses defaults when file missing (ENOENT)', async () => {
    const enoent: NodeJS.ErrnoException = new globalThis.Error('Not found');
    enoent.code = 'ENOENT';

    await mockFsModule({
      readFile: async () => {
        throw enoent;
      },
    });

    const { ConfigManager } = await import('@cli/config/ConfigManager');
    const mgr = await ConfigManager.getProjectConfig();

    expect(mgr.getConfig()).toBeDefined();
    expect(typeof mgr.getConfig()).toBe('object');
  });

  test('load rethrows non-ENOENT read errors (covers loadConfig catch)', async () => {
    const eacces: NodeJS.ErrnoException = new globalThis.Error('read denied');
    eacces.code = 'EACCES';

    await mockFsModule({
      readFile: async () => {
        throw eacces;
      },
    });

    const { ConfigManager } = await import('@cli/config/ConfigManager');
    const mgr = ConfigManager.create('/tmp/project/config.json');

    await expect(mgr.load()).rejects.toThrow('read denied');
  });

  test('exists returns false when access check fails', async () => {
    await mockFsModule({
      access: async () => {
        throw new Error('no access');
      },
    });

    const { ConfigManager } = await import('@cli/config/ConfigManager');
    const mgr = ConfigManager.create('/tmp/project/config.json');

    await expect(mgr.exists()).resolves.toBe(false);
  });

  test('ensureGlobalConfigDir tolerates mkdir errors', async () => {
    await mockFsModule({
      mkdir: async () => {
        throw new Error('global mkdir fail');
      },
    });

    const { ConfigManager } = await import('@cli/config/ConfigManager');
    await expect(ConfigManager.ensureGlobalConfigDir()).resolves.toBeUndefined();
  });
});
