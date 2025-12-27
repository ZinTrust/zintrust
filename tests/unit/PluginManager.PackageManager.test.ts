import { SpawnUtil } from '@cli/utils/spawn';
import { PluginManager } from '@runtime/PluginManager';
import { PluginRegistry } from '@runtime/PluginRegistry';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Mock spawn util and execSync
const execMock = vi.hoisted(() => ({ execSync: vi.fn() }));
vi.mock('@node-singletons/child-process', () => ({
  execSync: execMock.execSync,
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: { spawnAndWait: vi.fn() },
}));
vi.mock('@config/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('PluginManager package manager support', () => {
  let tmp: string | undefined;
  let originalCwd: string;

  beforeAll(async () => {
    originalCwd = process.cwd();
    tmp = await mkdtemp(join(tmpdir(), 'plugin-pm-'));
    await (
      await import('node:fs/promises')
    ).writeFile(join(tmp, 'package.json'), JSON.stringify({ name: 'p' }), 'utf8');
    process.chdir(tmp);
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    if (tmp) await rm(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it('uses pnpm when specified', async () => {
    const id = 'pm:test';
    PluginRegistry[id] = {
      name: 'PMTest',
      description: 'PM plugin',
      type: 'feature',
      aliases: [],
      dependencies: ['a', 'b'],
      devDependencies: ['d'],
      templates: [],
    } as any;

    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await PluginManager.install(id, { packageManager: 'pnpm' });

    expect(SpawnUtil.spawnAndWait).toHaveBeenCalled();
    const calls = vi
      .mocked(SpawnUtil.spawnAndWait)
      .mock.calls.map((c) => ({ cmd: c[0].command, args: c[0].args }));

    // Should install dependencies then dev dependencies
    expect(
      calls.some(
        (c) =>
          c.cmd === 'pnpm' && c.args.includes('add') && c.args.includes('a') && c.args.includes('b')
      )
    ).toBe(true);
    expect(
      calls.some(
        (c) =>
          c.cmd === 'pnpm' &&
          c.args.includes('add') &&
          c.args.includes('d') &&
          c.args.includes('-D')
      )
    ).toBe(true);

    Reflect.deleteProperty(PluginRegistry, id);
  });

  it('uses explicit npm when provided', async () => {
    const id = 'pm:test2';
    PluginRegistry[id] = {
      name: 'PMTest2',
      description: 'PM plugin2',
      type: 'feature',
      aliases: [],
      dependencies: ['x'],
      devDependencies: [],
      templates: [],
    } as any;

    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await PluginManager.install(id, { packageManager: 'npm' });

    // npm uses execSync (legacy behavior) - verify execSync was invoked
    expect(execMock.execSync).toHaveBeenCalled();
    expect(execMock.execSync).toHaveBeenCalledWith('npm install x', expect.any(Object));
    const execOpts = vi.mocked(execMock.execSync).mock.calls[0][1] as Record<string, unknown>;
    expect(String(execOpts['cwd'])).toContain('plugin-pm-');

    Reflect.deleteProperty(PluginRegistry, id);
  });
});
