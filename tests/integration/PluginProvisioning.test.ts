import { SpawnUtil } from '@cli/utils/spawn';
import { mkdtemp, readFile, realpath, rm, writeFile } from '@node-singletons/fs';
import { tmpdir } from '@node-singletons/os';
import { join } from '@node-singletons/path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const loggerState = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@node-singletons/child-process', () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: { spawnAndWait: vi.fn() },
}));

vi.mock('@config/logger', () => ({
  Logger: loggerState,
}));

describe.sequential('Plugin provisioning integration', () => {
  let PluginManager: typeof import('@runtime/PluginManager').PluginManager;
  let tempDir: string | undefined;
  let originalCwd: string;

  beforeAll(async () => {
    ({ PluginManager } = await import('@runtime/PluginManager'));

    originalCwd = process.cwd();
    tempDir = await mkdtemp(join(tmpdir(), 'zintrust-plugin-provision-'));
    tempDir = await realpath(tempDir);

    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'zintrust-plugin-provision-test',
          version: '0.0.0',
          private: true,
          dependencies: {},
          devDependencies: {},
        },
        null,
        2
      ),
      'utf-8'
    );

    process.chdir(tempDir);
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    if (tempDir !== undefined) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('installs a plugin into the current project root', async () => {
    if (tempDir === undefined) throw new Error('tempDir missing');

    vi.mocked(SpawnUtil.spawnAndWait).mockClear();
    vi.mocked(SpawnUtil.spawnAndWait).mockResolvedValue(0);

    await PluginManager.install('feature:auth');

    expect(SpawnUtil.spawnAndWait).toHaveBeenCalledTimes(2);
    expect(SpawnUtil.spawnAndWait).toHaveBeenNthCalledWith(1, {
      command: 'npm',
      args: ['install', 'jsonwebtoken', 'bcrypt'],
      cwd: tempDir,
    });
    expect(SpawnUtil.spawnAndWait).toHaveBeenNthCalledWith(2, {
      command: 'npm',
      args: ['install', '--save-dev', '@types/jsonwebtoken', '@types/bcrypt'],
      cwd: tempDir,
    });

    const authPath = join(tempDir, 'src/auth/Auth.ts');
    const authText = await readFile(authPath, 'utf-8');
    expect(authText).toContain('export const Auth');
  });

  it('reports installed only when file + deps exist', async () => {
    if (tempDir === undefined) throw new Error('tempDir missing');

    const before = await PluginManager.isInstalled('feature:auth');
    expect(before).toBe(false);

    await writeFile(
      join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'zintrust-plugin-provision-test',
          version: '0.0.0',
          private: true,
          dependencies: {
            jsonwebtoken: '^0.0.0',
            bcrypt: '^0.0.0',
          },
          devDependencies: {
            '@types/jsonwebtoken': '^0.0.0',
            '@types/bcrypt': '^0.0.0',
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const after = await PluginManager.isInstalled('feature:auth');
    expect(after).toBe(true);
  });
});
