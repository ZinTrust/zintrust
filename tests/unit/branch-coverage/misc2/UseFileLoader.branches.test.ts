/* eslint-disable no-await-in-loop -- deterministic sequential assertions in table-driven tests */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
  cwd: '/project',
}));

vi.mock('@node-singletons/process', () => ({
  default: { env: m.env, cwd: () => m.cwd },
}));

describe('useFileLoader remaining branches', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  let tempRoot: string | undefined;

  const resetEnv = (values: Record<string, string | undefined> = {}) => {
    for (const key of Object.keys(m.env)) Reflect.deleteProperty(m.env, key);
    Object.assign(m.env, values);
  };

  beforeEach(() => {
    vi.resetModules();
    resetEnv({ ZINTRUST_PROJECT_ROOT: '/tmp/never-used' });
    m.cwd = repoRoot;
  });

  afterEach(() => {
    resetEnv();
    for (const key of ['CF', 'caches', 'WebSocketPair'] as const) {
      Reflect.deleteProperty(globalThis, key);
    }
    if (tempRoot !== undefined) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('uses a trimmed ZINTRUST_PROJECT_ROOT and resolves existing candidates', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-loader-branches-'));
    resetEnv({ ZINTRUST_PROJECT_ROOT: `  ${tempRoot}  ` });
    fs.mkdirSync(path.join(tempRoot, 'config'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'config', 'named.mjs'), 'export default { ok: 1 };\n');

    const { useFileLoader } = await import('@/runtime/useFileLoader');
    const loader = useFileLoader('config', 'named.mjs');
    expect(loader.exists()).toBe(true);
    expect(loader.path()).toBe(path.join(tempRoot, 'config', 'named.mjs'));
    await expect(loader.get<{ ok: number }>()).resolves.toEqual({ ok: 1 });
    await expect(loader.getModule()).resolves.toHaveProperty('default');
  });

  it('detects a core repo via npm_package_name and blocks internal-root imports', async () => {
    resetEnv({ npm_package_name: '@zintrust/core', NODE_ENV: 'testing' });
    const { useFileLoader } = await import('@/runtime/useFileLoader');
    const loader = useFileLoader('config/middleware.ts');

    expect(loader.exists()).toBe(false);
    expect(loader.candidates()[0]).toBe(
      path.join(repoRoot, '.zintrust-internal-project-root', 'config', 'middleware.ts')
    );
    await expect(loader.get()).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('detects test runtime through VITEST_WORKER_ID and VITEST_POOL_ID', async () => {
    for (const key of ['VITEST_WORKER_ID', 'VITEST_POOL_ID']) {
      resetEnv({ [key]: '1' });
      const { useFileLoader } = await import('@/runtime/useFileLoader');
      const loader = useFileLoader('config/x.ts');
      expect(loader.exists()).toBe(false);
      expect(loader.candidates()[0]).toContain('.zintrust-internal-project-root');
      vi.resetModules();
    }
  });

  it('uses cwd as project root when the core repo is not in a test runtime', async () => {
    resetEnv({ NODE_ENV: 'production' });
    const { useFileLoader } = await import('@/runtime/useFileLoader');
    const loader = useFileLoader('config/foo.ts');
    expect(loader.candidates()[0]).toBe(path.join(repoRoot, 'config', 'foo.ts'));
    expect(loader.path()).toBe(loader.candidates()[0]);
    expect(loader.exists()).toBe(false);
  });

  it('generates extension variants and unique candidates', async () => {
    resetEnv({ ZINTRUST_PROJECT_ROOT: '/project-root' });
    const { useFileLoader } = await import('@/runtime/useFileLoader');

    expect(useFileLoader('config/foo').candidates()).toEqual([
      path.resolve('/project-root', 'config/foo'),
      path.resolve('/project-root', 'dist/config/foo'),
      path.resolve('/project-root', 'config/foo.ts'),
      path.resolve('/project-root', 'dist/config/foo.ts'),
      path.resolve('/project-root', 'config/foo.js'),
      path.resolve('/project-root', 'dist/config/foo.js'),
      path.resolve('/project-root', 'config/foo.mjs'),
      path.resolve('/project-root', 'dist/config/foo.mjs'),
    ]);

    const tsCandidates = useFileLoader('config/foo.ts').candidates();
    expect(tsCandidates).toContain(path.resolve('/project-root', 'config/foo.js'));
    expect(tsCandidates).toContain(path.resolve('/project-root', 'config/foo.mjs'));
    expect(useFileLoader('config/foo.js').candidates()).toContain(
      path.resolve('/project-root', 'config/foo.ts')
    );
    expect(useFileLoader('config/foo.mjs').candidates()).toContain(
      path.resolve('/project-root', 'config/foo.js')
    );
    expect(new Set(tsCandidates).size).toBe(tsCandidates.length);
  });

  it('normalizes relative paths and rejects unsafe ones', async () => {
    resetEnv({ ZINTRUST_PROJECT_ROOT: '/project-root' });
    const { useFileLoader } = await import('@/runtime/useFileLoader');

    expect(() => useFileLoader('   ')).toThrow(/requires a non-empty path/);
    expect(() => useFileLoader(undefined as never)).toThrow(/requires a non-empty path/);
    expect(() => useFileLoader('bad\u0000path')).toThrow(/null byte/);
    expect(() => useFileLoader('/etc/passwd')).toThrow(/Absolute paths are not allowed/);
    expect(() => useFileLoader('../secrets.env')).toThrow(/path traversal detected/);
    expect(() => useFileLoader('..\\..\\secrets.env')).toThrow(/path traversal detected/);

    expect(useFileLoader('.\\config\\foo.ts').candidates()[0]).toBe(
      path.resolve('/project-root', 'config/foo.ts')
    );
    expect(useFileLoader('config', 'nested', 'foo.ts').candidates()[0]).toBe(
      path.resolve('/project-root', 'config/nested/foo.ts')
    );
  });

  it('permits the project root itself and a root filesystem project root', async () => {
    resetEnv({ ZINTRUST_PROJECT_ROOT: '/project-root' });
    const { useFileLoader } = await import('@/runtime/useFileLoader');
    expect(useFileLoader('.').candidates()[0]).toBe(path.resolve('/project-root'));

    resetEnv({ ZINTRUST_PROJECT_ROOT: '/' });
    vi.resetModules();
    const { useFileLoader: loaderAtRoot } = await import('@/runtime/useFileLoader');
    expect(loaderAtRoot('config/foo.ts').candidates()[0]).toBe(path.resolve('/', 'config/foo.ts'));
  });

  it('returns an unsupported loader in Workers runtimes', async () => {
    (globalThis as unknown as { CF: unknown }).CF = {};
    const { useFileLoader } = await import('@/runtime/useFileLoader');
    const loader = useFileLoader('config/foo.ts');

    expect(loader.candidates()).toEqual([]);
    expect(loader.path()).toBe('');
    expect(loader.exists()).toBe(false);
    await expect(loader.get()).rejects.toThrow(/not supported in Workers runtime/);
    await expect(loader.getModule()).rejects.toThrow(/not supported in Workers runtime/);

    for (const key of ['CF']) Reflect.deleteProperty(globalThis, key);
    (globalThis as unknown as { caches: unknown }).caches = {};
    vi.resetModules();
    const withCaches = await import('@/runtime/useFileLoader');
    expect(withCaches.useFileLoader('x').exists()).toBe(false);

    delete (globalThis as unknown as Record<string, unknown>)['caches'];
    (globalThis as unknown as { WebSocketPair: unknown }).WebSocketPair = {};
    vi.resetModules();
    const withSocketPair = await import('@/runtime/useFileLoader');
    expect(withSocketPair.useFileLoader('x').exists()).toBe(false);
  });

  it('wraps ESM import failures and returns module namespaces without a default export', async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zintrust-loader-branches-'));
    resetEnv({ ZINTRUST_PROJECT_ROOT: tempRoot });
    fs.writeFileSync(path.join(tempRoot, 'throws.mjs'), "throw new Error('boom');\n");
    fs.writeFileSync(path.join(tempRoot, 'named.mjs'), 'export const answer = 42;\n');

    const { useFileLoader } = await import('@/runtime/useFileLoader');
    await expect(useFileLoader('throws.mjs').get()).rejects.toMatchObject({
      code: 'TRY_CATCH_ERROR',
    });
    await expect(useFileLoader('named.mjs').get<{ answer: number }>()).resolves.toMatchObject({
      answer: 42,
    });
    await expect(useFileLoader('missing.mjs').get()).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(useFileLoader('missing.mjs').getModule()).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
