import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const execState = vi.hoisted(() => ({
  execSync: vi.fn(),
}));

const loggerState = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@node-singletons/child-process', () => ({
  execSync: execState.execSync,
  execFileSync: vi.fn(),
  spawn: vi.fn(),
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

    execState.execSync.mockClear();

    await PluginManager.install('feature:auth');

    expect(execState.execSync).toHaveBeenCalledTimes(2);
    expect(execState.execSync).toHaveBeenNthCalledWith(
      1,
      'npm install jsonwebtoken bcrypt',
      expect.objectContaining({ cwd: tempDir, stdio: 'inherit' })
    );
    expect(execState.execSync).toHaveBeenNthCalledWith(
      2,
      'npm install -D @types/jsonwebtoken @types/bcrypt',
      expect.objectContaining({ cwd: tempDir, stdio: 'inherit' })
    );

    const authPath = join(tempDir, 'src/features/Auth.ts');
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
