import { beforeEach, describe, expect, test, vi } from 'vitest';

// IMPORTANT:
// `ConfigManager` imports `{ fsPromises as fs }` from `@node-singletons/fs`.
// So our mock must provide a named export `fsPromises`.
vi.mock('@node-singletons/fs', () => ({
  fsPromises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    access: vi.fn(),
  },
}));

describe('ConfigManager - extra branches', () => {
  beforeEach(() => {
    // Ensure fresh imports so `ConfigManager` picks up our mocked fs.
    vi.resetModules();
    vi.clearAllMocks();
  });

  test('load returns defaults on ENOENT and rethrows other errors', async () => {
    const { fsPromises } = await import('@node-singletons/fs');

    const enoent: any = new Error('Not found');
    enoent.code = 'ENOENT';
    vi.mocked(fsPromises.readFile).mockRejectedValueOnce(enoent);

    const { ConfigManager } = await import('@cli/config/ConfigManager');
    const mgr = ConfigManager.create('nonexistent.json');
    await expect(mgr.load()).resolves.toBeDefined();

    vi.mocked(fsPromises.readFile).mockRejectedValueOnce(new Error('boom'));
    await expect(mgr.load()).rejects.toThrow('boom');
  });

  test('save throws when there is no config to save', async () => {
    const { ConfigManager } = await import('@cli/config/ConfigManager');
    const mgr = ConfigManager.create('config.json');
    await expect(mgr.save()).rejects.toThrow('No configuration to save');
  });

  test('create writes config and ensures directory exists when needed', async () => {
    const { fsPromises } = await import('@node-singletons/fs');
    vi.mocked(fsPromises.mkdir).mockResolvedValueOnce(undefined as any);
    vi.mocked(fsPromises.writeFile).mockResolvedValueOnce(undefined as any);

    const { ConfigManager } = await import('@cli/config/ConfigManager');
    const mgr = ConfigManager.create('/tmp/someproject/config.json');
    await expect(mgr.create({})).resolves.toBeUndefined();

    expect(fsPromises.mkdir).toHaveBeenCalled();
    expect(fsPromises.writeFile).toHaveBeenCalled();
  });

  test('exists returns true when access succeeds and false when it fails', async () => {
    const { fsPromises } = await import('@node-singletons/fs');

    vi.mocked(fsPromises.access).mockResolvedValueOnce(undefined as any);
    const { ConfigManager } = await import('@cli/config/ConfigManager');
    const mgr = ConfigManager.create('whatever.json');
    await expect(mgr.exists()).resolves.toBe(true);

    vi.mocked(fsPromises.access).mockRejectedValueOnce(new Error('no access'));
    await expect(mgr.exists()).resolves.toBe(false);
  });

  test('merge/getAllKeys/export exercise key-flattening path', async () => {
    const { ConfigManager } = await import('@cli/config/ConfigManager');
    const mgr = ConfigManager.create('cfg.json');

    mgr.merge({ database: { host: '127.0.0.1', nested: { a: 1 } } } as any);
    const keys = mgr.getAllKeys();
    expect(keys).toContain('database.host');
    expect(keys).toContain('database.nested.a');

    const exported = mgr.export();
    expect(exported).toContain('database');
  });

  test('ensureGlobalConfigDir tolerates mkdir errors (does not throw)', async () => {
    const { fsPromises } = await import('@node-singletons/fs');
    vi.mocked(fsPromises.mkdir).mockRejectedValueOnce(new Error('fail mkdir'));

    const { ConfigManager } = await import('@cli/config/ConfigManager');
    await expect(ConfigManager.ensureGlobalConfigDir()).resolves.toBeUndefined();
  });
});
