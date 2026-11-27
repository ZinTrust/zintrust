import * as realFs from 'node:fs';
import * as nodePath from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  autoImports: [] as string[],
  exists: new Set<string>(),
  files: new Map<string, string>(),
  readErrors: new Map<string, unknown>(),
  urlThrows: false,
  loggerThrow: undefined as unknown,
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: (candidate: string) => mocks.exists.has(candidate),
  readFile: vi.fn(async (filePath: string) => {
    if (mocks.readErrors.has(filePath)) throw mocks.readErrors.get(filePath);
    const content = mocks.files.get(filePath);
    if (content === undefined) throw new Error(`ENOENT: ${filePath}`);
    return content;
  }),
}));

vi.mock('@node-singletons/url', () => ({
  pathToFileURL: (filePath: string) => {
    if (mocks.urlThrows) throw new Error('url construction failed');
    return new URL(`file://${filePath}`);
  },
}));

vi.mock('@config/logger', () => ({
  Logger: {
    debug: () => {
      if (mocks.loggerThrow !== undefined) throw mocks.loggerThrow;
    },
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  },
}));

type PluginAutoImportsType = typeof import('@/runtime/PluginAutoImports');

const load = async (): Promise<PluginAutoImportsType> => {
  vi.resetModules();
  return import('@/runtime/PluginAutoImports');
};

describe('PluginAutoImports uncovered branches', () => {
  const originalRoot = process.env['ZINTRUST_PROJECT_ROOT'];
  let tmp = '';

  const register = (relative: string, content: string) => {
    const absolute = nodePath.join(tmp, relative);
    realFs.mkdirSync(nodePath.dirname(absolute), { recursive: true });
    realFs.writeFileSync(absolute, content, 'utf8');
    mocks.exists.add(absolute);
    mocks.files.set(absolute, content);
    return absolute;
  };

  const urlOf = (absolute: string) => `file://${absolute}`;

  beforeEach(() => {
    vi.clearAllMocks();
    tmp = realFs.mkdtempSync(nodePath.join(process.cwd(), 'tmp-plugin-branches-'));
    process.env['ZINTRUST_PROJECT_ROOT'] = tmp;
    mocks.autoImports = [];
    mocks.exists.clear();
    mocks.files.clear();
    mocks.readErrors.clear();
    mocks.urlThrows = false;
    mocks.loggerThrow = undefined;

    vi.doMock('@runtime/OfficialPlugins', () => ({
      OfficialPlugins: {
        getAutoImports: () => mocks.autoImports,
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock('@runtime/OfficialPlugins');
    vi.resetModules();
    realFs.rmSync(tmp, { recursive: true, force: true });
    if (originalRoot === undefined) delete process.env['ZINTRUST_PROJECT_ROOT'];
    else process.env['ZINTRUST_PROJECT_ROOT'] = originalRoot;
  });

  it('formats summaries with and without failed specifiers', async () => {
    mocks.autoImports = ['@zintrust/not-installed/register'];
    const optional = await load();
    expect(await optional.PluginAutoImports.tryImportRuntimeAutoImports()).toEqual({
      ok: true,
      loadedPath: 'official:base',
    });

    register('packages/boom/src/register.ts', "throw new Error('register boom');\n");
    mocks.autoImports = ['@zintrust/boom/register'];
    const failed = await load();
    const result = await failed.PluginAutoImports.tryImportRuntimeAutoImports('full');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorMessage).toContain('failed: @zintrust/boom/register');
    }
  });

  it('resolves local package fallbacks without a subpath', async () => {
    register('packages/indexpkg/src/index.ts', 'export const ok = true;\n');
    mocks.autoImports = ['@zintrust/indexpkg'];

    const { PluginAutoImports } = await load();
    const result = await PluginAutoImports.tryImportRuntimeAutoImports();
    expect(result.ok).toBe(true);
  });

  it('logs read errors that are not Error instances', async () => {
    mocks.readErrors.set('official:base', 'string read failure');

    const { PluginAutoImports } = await load();
    const result = await PluginAutoImports.tryImportFromFileContents(['official:base']);
    expect(result.ok).toBe(false);
  });

  it('classifies relative and empty-message module-not-found errors', async () => {
    mocks.exists.add(nodePath.resolve(process.cwd(), 'relative-missing.ts'));
    mocks.readErrors.set('official:base', { code: 'ERR_MODULE_NOT_FOUND' });
    mocks.autoImports = ['./relative-missing'];
    const relative = await load();
    const relativeResult = await relative.PluginAutoImports.tryImportRuntimeAutoImports();
    expect(relativeResult.ok).toBe(false);

    mocks.exists.add(nodePath.resolve(process.cwd(), 'empty-message.ts'));
    mocks.readErrors.set('official:base', { code: 'ERR_MODULE_NOT_FOUND' });
    mocks.autoImports = ['@zintrust/empty-message/register.ts'];
    const emptyMessage = await load();
    const emptyResult = await emptyMessage.PluginAutoImports.tryImportRuntimeAutoImports();
    expect(emptyResult.ok).toBe(true);
  });

  it('reports a non-Error fallback import failure', async () => {
    register('packages/strthrow/src/register.ts', "throw 'fallback string boom';\n");
    mocks.autoImports = ['@zintrust/strthrow/register'];

    const { PluginAutoImports } = await load();
    const result = await PluginAutoImports.tryImportRuntimeAutoImports();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('import-failed');
  });

  it('handles empty, loaded, failed and missing file-contents imports', async () => {
    mocks.exists.add(nodePath.resolve(process.cwd(), 'cfg.ts'));
    const valid = register('valid.js', 'export const ok = true;\n');
    const broken = register('broken.js', "throw new Error('contents boom');\n");
    mocks.autoImports = ['./cfg'];

    const run = async (content: string) => {
      mocks.files.set('official:base', content);
      const { PluginAutoImports } = await load();
      return PluginAutoImports.tryImportRuntimeAutoImports();
    };

    expect((await run('export const x = 1;\n')).ok).toBe(true);
    expect((await run(`import '${urlOf(valid)}';\n`)).ok).toBe(true);
    expect((await run(`import '${urlOf(broken)}';\n`)).ok).toBe(false);
    expect((await run(`import '${urlOf(nodePath.join(tmp, 'not-installed.js'))}';\n`)).ok).toBe(
      true
    );
  });

  it('uses a local fallback for a bare specifier when direct import fails', async () => {
    register('packages/fallbackpkg/src/register.ts', 'export const ok = true;\n');
    mocks.autoImports = ['@zintrust/fallbackpkg/register'];

    const { PluginAutoImports } = await load();
    expect((await PluginAutoImports.tryImportRuntimeAutoImports()).ok).toBe(true);
  });

  it('counts a rejected import promise as failed', async () => {
    mocks.exists.add(nodePath.resolve(process.cwd(), 'url-throw.ts'));
    mocks.urlThrows = true;
    mocks.autoImports = ['./url-throw'];

    const { PluginAutoImports } = await load();
    expect((await PluginAutoImports.tryImportRuntimeAutoImports()).ok).toBe(false);
  });

  it('imports project auto-imports from the contents of a .ts candidate', async () => {
    const valid = register('valid.js', 'export const ok = true;\n');
    register('src/zintrust.plugins.ts', `import '${urlOf(valid)}';\n`);

    const { PluginAutoImports } = await load();
    const result = await PluginAutoImports.tryImportProjectAutoImports();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.loadedPath).toContain('zintrust.plugins.ts');
  });

  it('falls back to the default failed result when every candidate rejects', async () => {
    register('dist/src/zintrust.plugins.js', 'export {};\n');
    mocks.urlThrows = true;
    mocks.loggerThrow = 'logger boom';

    const { PluginAutoImports } = await load();
    const result = await PluginAutoImports.tryImportProjectAutoImports();
    expect(result).toEqual({
      ok: false,
      reason: 'import-failed',
      errorMessage: 'logger boom',
    });
  });

  it('recovers via file contents when direct project imports fail', async () => {
    const valid = register('valid.js', 'export const ok = true;\n');
    register(
      'dist/src/zintrust.plugins.js',
      `import '${urlOf(valid)}';\nthrow new Error('direct boom');\n`
    );

    const { PluginAutoImports } = await load();
    const result = await PluginAutoImports.tryImportProjectAutoImports();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.loadedPath).toBe('manual-imports');
  });

  it('reports failure when file contents contain only failing imports', async () => {
    const broken = register('broken.js', "throw new Error('contents boom');\n");
    register(
      'dist/src/zintrust.plugins.js',
      `import '${urlOf(broken)}';\nthrow new Error('direct boom');\n`
    );

    const { PluginAutoImports } = await load();
    const result = await PluginAutoImports.tryImportProjectAutoImports();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorMessage).toContain('contents boom');
  });

  it('logs Error read failures and returns not-found when no candidate exists', async () => {
    mocks.readErrors.set('official:base', new Error('read boom'));
    const first = await load();
    expect((await first.PluginAutoImports.tryImportFromFileContents(['official:base'])).ok).toBe(
      false
    );

    const second = await load();
    expect(await second.PluginAutoImports.tryImportProjectAutoImports()).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });

  it('uses a local fallback after a .ts source import fails', async () => {
    register('packages/latefallback/src/register.ts.js', 'export const ok = true;\n');
    const broken = register('broken.js', "throw new Error('contents boom');\n");
    mocks.files.set('official:base', `import '${urlOf(broken)}';\n`);
    mocks.autoImports = ['@zintrust/latefallback/register.ts'];

    const { PluginAutoImports } = await load();
    expect((await PluginAutoImports.tryImportRuntimeAutoImports()).ok).toBe(true);
  });

  it('returns the default failed result when every candidate rejects', async () => {
    register('dist/src/zintrust.plugins.js', 'export {};\n');
    mocks.urlThrows = true;

    const { PluginAutoImports } = await load();
    const result = await PluginAutoImports.tryImportProjectAutoImports();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorMessage).toContain('url construction failed');
  });

  it('handles Error instances thrown inside the project import try block', async () => {
    register('dist/src/zintrust.plugins.js', "throw new Error('direct boom');\n");
    mocks.loggerThrow = new Error('logger error boom');

    const { PluginAutoImports } = await load();
    expect(await PluginAutoImports.tryImportProjectAutoImports()).toEqual({
      ok: false,
      reason: 'import-failed',
      errorMessage: 'logger error boom',
    });
  });
});
