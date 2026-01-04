/* eslint-disable max-nested-callbacks */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@common/index', () => ({
  esmDirname: () => '/virtual',
  resolvePackageManager: () => 'npm',
}));

describe('PluginManager coverage edges', () => {
  const originalCwd = process.cwd;
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process as any).cwd = originalCwd;
  });

  it('covers yarn install path and list/uninstall', async () => {
    vi.resetModules();

    const spawnAndWait = vi.fn().mockResolvedValue(0);
    const execSync = vi.fn();

    const existsSync = vi.fn((p: string) => {
      // Make findPackageRoot + resolveTemplateRootOrThrow succeed.
      if (p.endsWith('package.json')) return true;
      if (p.includes('templates')) return true;
      return false;
    });

    const fsPromises = {
      mkdir: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(''),
      writeFile: vi.fn().mockResolvedValue(undefined),
      access: vi.fn().mockResolvedValue(undefined),
    };

    vi.doMock('@cli/utils/spawn', () => ({
      SpawnUtil: { spawnAndWait },
    }));

    vi.doMock('@node-singletons/child-process', () => ({
      execSync,
    }));

    vi.doMock('@node-singletons/fs', () => ({
      existsSync,
      fsPromises,
    }));

    const registry = {
      'feature:test': {
        name: 'Test Plugin',
        aliases: ['test'],
        dependencies: ['dep-a'],
        devDependencies: ['dep-dev'],
        templates: [],
        autoImports: [],
      },
    };

    vi.doMock('@runtime/PluginRegistry', () => ({
      PluginRegistry: registry,
    }));

    const { PluginManager } = await import('@runtime/PluginManager');

    expect(PluginManager.list()).toBe(registry);

    await expect(
      PluginManager.install('test', { packageManager: 'yarn' })
    ).resolves.toBeUndefined();

    // Yarn branch uses SpawnUtil, not execSync.
    expect(execSync).not.toHaveBeenCalled();
    expect(spawnAndWait).toHaveBeenCalled();

    await expect(PluginManager.uninstall('test')).resolves.toBeUndefined();
  });

  it('covers yarn non-zero exit error path (CliError) and catch/rethrow', async () => {
    vi.resetModules();

    const spawnAndWait = vi.fn().mockResolvedValue(2);

    vi.doMock('@cli/utils/spawn', () => ({
      SpawnUtil: { spawnAndWait },
    }));

    vi.doMock('@node-singletons/child-process', () => ({
      execSync: vi.fn(),
    }));

    vi.doMock('@node-singletons/fs', () => ({
      existsSync: vi.fn((p: string) => p.endsWith('package.json') || p.includes('templates')),
      fsPromises: {
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue(''),
        writeFile: vi.fn().mockResolvedValue(undefined),
        access: vi.fn().mockResolvedValue(undefined),
      },
    }));

    vi.doMock('@runtime/PluginRegistry', () => ({
      PluginRegistry: {
        'feature:test': {
          name: 'Test Plugin',
          aliases: ['test'],
          dependencies: ['dep-a'],
          devDependencies: [],
          templates: [],
          autoImports: [],
        },
      },
    }));

    const { PluginManager } = await import('@runtime/PluginManager');

    await expect(PluginManager.install('test', { packageManager: 'yarn' })).rejects.toThrow(
      'Package manager yarn failed to install dependencies'
    );
  });

  it('covers template copy error handling', async () => {
    vi.resetModules();

    const spawnAndWait = vi.fn().mockResolvedValue(0);
    const execSync = vi.fn();

    const fsPromises = {
      mkdir: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockRejectedValue(new Error('read boom')),
      writeFile: vi.fn().mockResolvedValue(undefined),
      access: vi.fn().mockResolvedValue(undefined),
    };

    vi.doMock('@cli/utils/spawn', () => ({
      SpawnUtil: { spawnAndWait },
    }));

    vi.doMock('@node-singletons/child-process', () => ({
      execSync,
    }));

    vi.doMock('@node-singletons/fs', () => ({
      existsSync: vi.fn((p: string) => p.endsWith('package.json') || p.includes('templates')),
      fsPromises,
    }));

    vi.doMock('@runtime/PluginRegistry', () => ({
      PluginRegistry: {
        'feature:test': {
          name: 'Test Plugin',
          aliases: ['test'],
          dependencies: [],
          devDependencies: [],
          templates: [{ source: 'a.txt', destination: 'src/a.txt' }],
          autoImports: [],
        },
      },
    }));

    const { PluginManager } = await import('@runtime/PluginManager');

    // Template read failure should reject.
    await expect(PluginManager.install('test', { packageManager: 'pnpm' })).rejects.toThrow(
      'read boom'
    );
  });

  it('covers post-install command catch (error swallowed)', async () => {
    vi.resetModules();

    process.env['ZINTRUST_ALLOW_POSTINSTALL'] = '1';

    const execSync = vi.fn(() => {
      throw new Error('post-install boom');
    });

    vi.doMock('@cli/utils/spawn', () => ({
      SpawnUtil: { spawnAndWait: vi.fn().mockResolvedValue(0) },
    }));

    vi.doMock('@node-singletons/child-process', () => ({
      execSync,
    }));

    vi.doMock('@node-singletons/fs', () => ({
      existsSync: vi.fn((p: string) => p.endsWith('package.json') || p.includes('templates')),
      fsPromises: {
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue(''),
        writeFile: vi.fn().mockResolvedValue(undefined),
        access: vi.fn().mockResolvedValue(undefined),
      },
    }));

    vi.doMock('@runtime/PluginRegistry', () => ({
      PluginRegistry: {
        'feature:test': {
          name: 'Test Plugin',
          aliases: ['test'],
          dependencies: [],
          devDependencies: [],
          templates: [],
          autoImports: [],
          postInstall: { command: 'echo hi', message: 'done' },
        },
      },
    }));

    const { PluginManager } = await import('@runtime/PluginManager');

    await expect(
      PluginManager.install('test', { packageManager: 'pnpm' })
    ).resolves.toBeUndefined();
    expect(execSync).toHaveBeenCalled();
  });

  it('covers isInstalled not-found throw and defensive final return false', async () => {
    vi.resetModules();

    vi.doMock('@cli/utils/spawn', () => ({
      SpawnUtil: { spawnAndWait: vi.fn().mockResolvedValue(0) },
    }));

    vi.doMock('@node-singletons/child-process', () => ({
      execSync: vi.fn(),
    }));

    vi.doMock('@node-singletons/fs', () => ({
      existsSync: vi.fn((p: string) => p.endsWith('package.json') || p.includes('templates')),
      fsPromises: {
        mkdir: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
        writeFile: vi.fn().mockResolvedValue(undefined),
        access: vi.fn().mockResolvedValue(undefined),
      },
    }));

    // templates.length = -1 hits the defensive return false at the end of isInstalled.
    vi.doMock('@runtime/PluginRegistry', () => ({
      PluginRegistry: {
        'feature:weird': {
          name: 'Weird Plugin',
          aliases: ['weird'],
          dependencies: [],
          devDependencies: [],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          templates: { length: -1 } as any,
          autoImports: [],
        },
      },
    }));

    const { PluginManager } = await import('@runtime/PluginManager');

    await expect(PluginManager.isInstalled('nope')).rejects.toThrow('Plugin nope not found');
    await expect(PluginManager.isInstalled('weird')).resolves.toBe(false);
  });
});
