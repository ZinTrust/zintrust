import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { writeFile } from '@/node-singletons/fs';
import { CLI } from '@cli/CLI';
import { SpawnUtil } from '@cli/utils/spawn';
import { PluginRegistry } from '@runtime/PluginRegistry';

// Mock execSync to avoid actually running npm in CI
const execMock = vi.hoisted(() => ({ execSync: vi.fn() }));
vi.mock('@node-singletons/child-process', () => ({
  execSync: execMock.execSync,
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('@config/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@cli/utils/spawn', () => ({ SpawnUtil: { spawnAndWait: vi.fn() } }));

describe('CLI → Plugin install with package manager', () => {
  let tmp: string | undefined;
  let originalCwd: string;

  beforeAll(async () => {
    originalCwd = process.cwd();
    tmp = await mkdtemp(join(tmpdir(), 'plugin-cli-pm-'));
    await writeFile(join(tmp, 'package.json'), JSON.stringify({ name: 'p' }), 'utf8');
    process.chdir(tmp);
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    if (tmp) await rm(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('runs pnpm when --package-manager pnpm is provided', async () => {
    const id = 'pm:cli:test';
    PluginRegistry[id] = {
      name: 'PMCLITest',
      description: 'PM CLI plugin',
      type: 'feature',
      aliases: [],
      dependencies: ['a', 'b'],
      devDependencies: ['d'],
      templates: [],
    } as any;

    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    const cli = CLI.create();
    await cli.run(['plugin', 'install', id, '--package-manager', 'pnpm']);

    expect(SpawnUtil.spawnAndWait).toHaveBeenCalled();
    const calls = vi
      .mocked(SpawnUtil.spawnAndWait)
      .mock.calls.map((c) => ({ cmd: c[0].command, args: c[0].args }));

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

  it('falls back to npm and uses execSync when --package-manager npm is provided', async () => {
    const id = 'pm:cli:test2';
    PluginRegistry[id] = {
      name: 'PMCLITest2',
      description: 'PM CLI plugin 2',
      type: 'feature',
      aliases: [],
      dependencies: ['x'],
      devDependencies: [],
      templates: [],
    } as any;

    const cli = CLI.create();
    await cli.run(['plugin', 'install', id, '--package-manager', 'npm']);

    expect(execMock.execSync).toHaveBeenCalled();
    expect(vi.mocked(execMock.execSync).mock.calls[0][0]).toContain('npm install x');
    const execOpts = vi.mocked(execMock.execSync).mock.calls[0][1] as Record<string, unknown>;
    expect(String(execOpts['cwd'])).toContain('plugin-cli-pm-');

    Reflect.deleteProperty(PluginRegistry, id);
  });
});
