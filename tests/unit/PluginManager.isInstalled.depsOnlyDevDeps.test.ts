import { mkdtemp, rm, writeFile } from '@node-singletons/fs';
import { tmpdir } from '@node-singletons/os';
import { join } from '@node-singletons/path';
import { PluginManager } from '@runtime/PluginManager';
import { PluginRegistry } from '@runtime/PluginRegistry';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('PluginManager.isInstalled dependency-only plugins', () => {
  let tmp: string | undefined;
  let originalCwd: string;

  beforeAll(async () => {
    originalCwd = process.cwd();
    tmp = await mkdtemp(join(tmpdir(), 'plugin-installed-'));
    process.chdir(tmp);
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    if (tmp) await rm(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it('checks devDependencies for dependency-only plugins with devDependencies', async () => {
    const id = 'test:deps-only-devdeps';

    PluginRegistry[id] = {
      name: 'Deps-only + devDeps',
      description: 'Test plugin',
      type: 'driver',
      aliases: [],
      dependencies: ['left-pad'],
      devDependencies: ['typescript'],
      templates: [],
    } as any;

    await writeFile(
      join(process.cwd(), 'package.json'),
      JSON.stringify({ name: 'p', version: '0.0.0', dependencies: {}, devDependencies: {} }),
      'utf8'
    );

    await expect(PluginManager.isInstalled(id)).resolves.toBe(false);

    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (PluginRegistry as any)[id];
  });

  it('returns false when reading/parsing package.json fails', async () => {
    const id = 'test:deps-only-no-package-json';

    PluginRegistry[id] = {
      name: 'Deps-only no package.json',
      description: 'Test plugin',
      type: 'driver',
      aliases: [],
      dependencies: ['left-pad'],
      devDependencies: ['typescript'],
      templates: [],
    } as any;

    // Write invalid JSON to force the dependency-only branch to hit the catch.
    await writeFile(join(process.cwd(), 'package.json'), '{', 'utf8');

    await expect(PluginManager.isInstalled(id)).resolves.toBe(false);

    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (PluginRegistry as any)[id];
  });
});
