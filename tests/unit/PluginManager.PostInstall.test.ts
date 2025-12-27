import { PluginManager } from '@runtime/PluginManager';
import { PluginRegistry } from '@runtime/PluginRegistry';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const execMock = vi.hoisted(() => ({ execSync: vi.fn() }));
vi.mock('@node-singletons/child-process', () => ({
  execSync: execMock.execSync,
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock('@config/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('PluginManager postInstall', () => {
  let tmp: string | undefined;
  let originalCwd: string;

  beforeAll(async () => {
    originalCwd = process.cwd();
    tmp = await mkdtemp(join(tmpdir(), 'plugin-postinstall-'));
    await writeFile(join(tmp, 'package.json'), JSON.stringify({ name: 'p' }), 'utf8');
    process.chdir(tmp);
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    if (tmp) await rm(tmp, { recursive: true, force: true });
    tmp = undefined;
    delete process.env['ZINTRUST_ALLOW_POSTINSTALL'];
  });

  it('does not execute postInstall.command by default', async () => {
    const id = 'test:post';
    PluginRegistry[id] = {
      name: 'Post',
      description: 'Post plugin',
      type: 'feature',
      aliases: [],
      dependencies: [],
      devDependencies: [],
      templates: [{ source: 'features/Auth.ts.tpl', destination: 'src/features/Auth.ts' }],
      postInstall: { command: 'echo hello' },
    } as any;

    await expect(PluginManager.install(id)).resolves.toBeUndefined();
    expect(execMock.execSync).not.toHaveBeenCalled();

    Reflect.deleteProperty(PluginRegistry, id);
  });

  it('executes postInstall.command when allowed via env', async () => {
    const id = 'test:post2';
    process.env['ZINTRUST_ALLOW_POSTINSTALL'] = '1';

    PluginRegistry[id] = {
      name: 'Post2',
      description: 'Post plugin',
      type: 'feature',
      aliases: [],
      dependencies: [],
      devDependencies: [],
      templates: [{ source: 'features/Auth.ts.tpl', destination: 'src/features/Auth.ts' }],
      postInstall: { command: 'echo hello' },
    } as any;

    await expect(PluginManager.install(id)).resolves.toBeUndefined();
    expect(execMock.execSync).toHaveBeenCalled();

    Reflect.deleteProperty(PluginRegistry, id);
  });
});
