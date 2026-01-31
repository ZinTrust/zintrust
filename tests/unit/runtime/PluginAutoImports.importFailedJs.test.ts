import { mkdtempSync, writeFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';
import { beforeEach, describe, expect, it } from 'vitest';

describe('PluginAutoImports import-failed .js', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('returns import-failed when .js candidate import throws', async () => {
    const tmp = mkdtempSync(join(process.cwd(), 'tmp-plugins-'));
    const pluginPath = join(tmp, 'src');
    const filePath = join(pluginPath, 'zintrust.plugins.js');
    try {
      await import('@node-singletons/fs').then(({ mkdirSync }) =>
        mkdirSync(pluginPath, { recursive: true })
      );
    } catch {}
    writeFileSync(filePath, "throw new Error('boomjs');\n", 'utf8');

    process.env['ZINTRUST_PROJECT_ROOT'] = tmp;

    const { PluginAutoImports } = await import('@/runtime/PluginAutoImports');

    const result = await PluginAutoImports.tryImportProjectAutoImports();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('import-failed');
      expect(result.errorMessage).toEqual(expect.stringContaining('boomjs'));
    }

    try {
      await import('@node-singletons/fs').then(({ rmSync }) =>
        rmSync(tmp, { recursive: true, force: true })
      );
    } catch {}
  });
});
