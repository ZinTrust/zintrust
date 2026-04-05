import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('PluginAutoImports official imports', () => {
  const originalProjectRoot = process.env['ZINTRUST_PROJECT_ROOT'];

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();

    if (originalProjectRoot === undefined) delete process.env['ZINTRUST_PROJECT_ROOT'];
    else process.env['ZINTRUST_PROJECT_ROOT'] = originalProjectRoot;
  });

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('treats missing official packages as optional', async () => {
    vi.doMock('@runtime/OfficialPlugins', () => ({
      OfficialPlugins: {
        getAutoImports: () => ['@zintrust/not-installed/register'],
      },
    }));

    const { PluginAutoImports } = await import('@/runtime/PluginAutoImports');
    const result = await PluginAutoImports.tryImportRuntimeAutoImports('base');

    expect(result).toEqual({ ok: true, loadedPath: 'official:base' });
  });

  it('fails when an installed official package register import throws', async () => {
    const tmp = mkdtempSync(join(process.cwd(), 'tmp-official-imports-'));
    const registerPath = join(tmp, 'packages', 'broken-plugin', 'src');

    mkdirSync(registerPath, { recursive: true });
    writeFileSync(join(registerPath, 'register.ts'), "throw new Error('register boom');\n", 'utf8');
    process.env['ZINTRUST_PROJECT_ROOT'] = tmp;

    vi.doMock('@runtime/OfficialPlugins', () => ({
      OfficialPlugins: {
        getAutoImports: () => ['@zintrust/broken-plugin/register'],
      },
    }));

    const { PluginAutoImports } = await import('@/runtime/PluginAutoImports');
    const result = await PluginAutoImports.tryImportRuntimeAutoImports('base');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('import-failed');
      expect(result.errorMessage).toContain('Loaded 0/1 official plugin imports');
      expect(result.errorMessage).toContain('failed: @zintrust/broken-plugin/register');
    }

    rmSync(tmp, { recursive: true, force: true });
  });

  it('reports missing and loaded official specifiers when a later import fails', async () => {
    const tmp = mkdtempSync(join(process.cwd(), 'tmp-official-imports-'));
    const readyPath = join(tmp, 'packages', 'ready-plugin', 'src');
    const brokenPath = join(tmp, 'packages', 'broken-plugin', 'src');

    mkdirSync(readyPath, { recursive: true });
    mkdirSync(brokenPath, { recursive: true });
    writeFileSync(join(readyPath, 'register.ts'), 'export const ready = true;\n', 'utf8');
    writeFileSync(join(brokenPath, 'register.ts'), "throw new Error('register boom');\n", 'utf8');
    process.env['ZINTRUST_PROJECT_ROOT'] = tmp;

    vi.doMock('@runtime/OfficialPlugins', () => ({
      OfficialPlugins: {
        getAutoImports: () => [
          '@zintrust/ready-plugin/register',
          '@zintrust/not-installed/register',
          '@zintrust/broken-plugin/register',
        ],
      },
    }));

    const { PluginAutoImports } = await import('@/runtime/PluginAutoImports');
    const result = await PluginAutoImports.tryImportRuntimeAutoImports('base');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorMessage).toContain('Loaded 1/3 official plugin imports');
      expect(result.errorMessage).toContain('missing: @zintrust/not-installed/register');
      expect(result.errorMessage).toContain('failed: @zintrust/broken-plugin/register');
    }

    rmSync(tmp, { recursive: true, force: true });
  });
});
