import { mkdtemp, readFile, rm, writeFile } from '@node-singletons/fs';
import { tmpdir } from '@node-singletons/os';
import { join } from '@node-singletons/path';
import { PluginManager } from '@runtime/PluginManager';
import { PluginRegistry } from '@runtime/PluginRegistry';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => ({ Logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const execMock = vi.hoisted(() => ({ execSync: vi.fn() }));
vi.mock('@node-singletons/child-process', () => ({
  execSync: execMock.execSync,
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('@cli/utils/spawn', () => ({
  SpawnUtil: { spawnAndWait: vi.fn() },
}));

describe('PluginManager autoImports', () => {
  let tmp: string | undefined;
  let originalCwd: string;
  const originalRoot = process.env['ZINTRUST_PROJECT_ROOT'];

  beforeAll(async () => {
    originalCwd = process.cwd();
    tmp = await mkdtemp(join(tmpdir(), 'plugin-autoimports-'));
    await writeFile(join(tmp, 'package.json'), JSON.stringify({ name: 'p' }), 'utf8');

    process.env['ZINTRUST_PROJECT_ROOT'] = tmp;
    process.chdir(tmp);
  });

  afterAll(async () => {
    process.chdir(originalCwd);
    if (originalRoot === undefined) delete process.env['ZINTRUST_PROJECT_ROOT'];
    else process.env['ZINTRUST_PROJECT_ROOT'] = originalRoot;

    if (tmp) await rm(tmp, { recursive: true, force: true });
    tmp = undefined;
  });

  it('creates src/zintrust.plugins.ts and appends imports idempotently', async () => {
    if (!tmp) throw new Error('tmp missing');

    const id = 'auto:test';
    PluginRegistry[id] = {
      name: 'AutoImports',
      description: 'Auto imports plugin',
      type: 'feature',
      aliases: [],
      dependencies: [],
      devDependencies: [],
      templates: [],
      autoImports: ['@zintrust/cache-redis/register', '@zintrust/mail-nodemailer/register'],
    } as any;

    const pluginFile = join(tmp, 'src', 'zintrust.plugins.ts');

    await expect(PluginManager.install(id, { packageManager: 'npm' })).resolves.toBeUndefined();

    const first = await readFile(pluginFile, 'utf8');
    expect(first).toContain('Zintrust plugin auto-imports');
    expect(first).toContain("import '@zintrust/cache-redis/register';");
    expect(first).toContain("import '@zintrust/mail-nodemailer/register';");

    await expect(PluginManager.install(id, { packageManager: 'npm' })).resolves.toBeUndefined();

    const second = await readFile(pluginFile, 'utf8');
    expect(second).toBe(first);

    Reflect.deleteProperty(PluginRegistry, id);
  });
});
