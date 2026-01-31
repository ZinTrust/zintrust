import { mkdtempSync, rmSync, writeFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PluginAutoImports import-failed branch', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns import-failed when candidate import throws', async () => {
    const tmp = mkdtempSync(join(process.cwd(), 'tmp-plugins-'));
    const pluginPath = join(tmp, 'src');
    const filePath = join(pluginPath, 'zintrust.plugins.ts');
    // Ensure directories exist and file throws on import
    // Simple JS content that throws when imported
    // create directory
    try {
      const { mkdirSync } = await import('@node-singletons/fs');
      mkdirSync(pluginPath, { recursive: true });
    } catch {
      // ignore
    }
    writeFileSync(filePath, "throw new Error('boom');\n", { encoding: 'utf8', flag: 'w' });

    // Ensure environment points to the temp project root
    process.env['ZINTRUST_PROJECT_ROOT'] = tmp;

    const { PluginAutoImports } = await import('@/runtime/PluginAutoImports');

    const result = await PluginAutoImports.tryImportProjectAutoImports();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('import-failed');
      expect(result.errorMessage).toEqual(expect.stringContaining('boom'));
    }

    // Cleanup
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });
});
