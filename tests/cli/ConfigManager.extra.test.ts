/* eslint-disable no-empty */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_CONFIG_PATH = `${process.cwd()}/tests/tmp/test-config-manager-extra.json`;

describe('ConfigManager Error and edge branches', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
    // ensure no leftover file
    try {
      const { fsPromises: fs } = await import('@node-singletons/fs');
      await fs.unlink(TEST_CONFIG_PATH);
    } catch {}
  });

  afterEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
    try {
      const { fsPromises: fs } = await import('@node-singletons/fs');
      await fs.unlink(TEST_CONFIG_PATH);
    } catch {}
  });

  it.skip('load throws when readFile errors with non-ENOENT', async () => {
    // Mock fsPromises before importing the module
    vi.mock('@node-singletons/fs', () => ({
      fsPromises: {
        readFile: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error('permission denied'), { code: 'EACCES' })),
        writeFile: vi.fn(),
        access: vi.fn(),
        mkdir: vi.fn(),
        unlink: vi.fn(),
      },
    }));

    const { ConfigManager } = await import('@cli/config/ConfigManager');
    const mgr = ConfigManager.create(TEST_CONFIG_PATH);

    await expect(mgr.load()).rejects.toThrow('permission denied');
  });

  it('save throws when there is no current config and no argument', async () => {
    vi.mock('@node-singletons/fs', () => ({
      fsPromises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        access: vi.fn(),
        mkdir: vi.fn(),
        unlink: vi.fn(),
      },
    }));

    const { ConfigManager } = await import('@cli/config/ConfigManager');
    const manager = ConfigManager.create(TEST_CONFIG_PATH);
    // Without load() the internal state.config is null
    await expect(manager.save()).rejects.toThrow();
  });

  it.skip('save propagates write errors', async () => {
    vi.mock('@node-singletons/fs', () => ({
      fsPromises: {
        readFile: vi.fn().mockResolvedValue(JSON.stringify({ name: 'x' })),
        writeFile: vi.fn().mockRejectedValue(new Error('disk full')),
        access: vi.fn(),
        mkdir: vi.fn(),
        unlink: vi.fn(),
      },
    }));

    const { ConfigManager } = await import('@cli/config/ConfigManager');

    const manager = ConfigManager.create(TEST_CONFIG_PATH);
    await manager.load();

    await expect(manager.save()).rejects.toThrow('disk full');
  });

  it.skip('exists returns false when access fails', async () => {
    vi.mock('@node-singletons/fs', () => ({
      fsPromises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        access: vi.fn().mockRejectedValue(new Error('no access')),
        mkdir: vi.fn(),
        unlink: vi.fn(),
      },
    }));

    const { ConfigManager } = await import('@cli/config/ConfigManager');
    const manager = ConfigManager.create(TEST_CONFIG_PATH);

    const exists = await manager.exists();
    expect(exists).toBe(false);
  });

  it.skip('ensureGlobalConfigDir handles mkdir errors and logs debug', async () => {
    vi.mock('@node-singletons/fs', () => ({
      fsPromises: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
        access: vi.fn(),
        mkdir: vi.fn().mockRejectedValue(new Error('mkdir failed')),
        unlink: vi.fn(),
      },
    }));

    // import logger dynamically to spy
    const loggerMod = await import('@config/logger');
    const spyLog = vi.spyOn(loggerMod.Logger, 'debug');

    const { ConfigManager } = await import('@cli/config/ConfigManager');

    // call the static ensureGlobalConfigDir
    await expect((ConfigManager as any).ensureGlobalConfigDir()).resolves.toBeUndefined();
    expect(spyLog).toHaveBeenCalled();
  });

  it('getGlobalConfig returns a manager even when mkdir fails', async () => {
    vi.mock('@node-singletons/fs', () => ({
      fsPromises: {
        readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
        writeFile: vi.fn(),
        access: vi.fn(),
        mkdir: vi.fn().mockRejectedValue(new Error('fail')),
        unlink: vi.fn(),
      },
    }));

    const { ConfigManager } = await import('@cli/config/ConfigManager');

    const m = await (ConfigManager as any).getGlobalConfig();
    expect(m).toBeDefined();
    expect(typeof m.load).toBe('function');
  });
});
