import { mkdtempSync, writeFileSync } from '@node-singletons/fs';
import { join } from '@node-singletons/path';
import { beforeEach, describe, expect, it } from 'vitest';

describe('PluginAutoImports import-failed with string error', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('captures string thrown during import as errorMessage', async () => {
    const tmp = mkdtempSync(join(process.cwd(), 'tmp-plugins-'));
    const pluginPath = join(tmp, 'src');
    const filePath = join(pluginPath, 'zintrust.plugins.js');
    await import('@node-singletons/fs').then(({ mkdirSync }) =>
      mkdirSync(pluginPath, { recursive: true })
    );
    // throw a non-Error value
    writeFileSync(filePath, "throw 'plain-error-string';\n", 'utf8');

    process.env['ZINTRUST_PROJECT_ROOT'] = tmp;

    const { PluginAutoImports } = await import('@/runtime/PluginAutoImports');

    const result = await PluginAutoImports.tryImportProjectAutoImports();

    expect(result.ok).toBe(false);

    if (!result.ok) {
      expect(result.reason).toBe('import-failed');
      expect(result.errorMessage).toContain('plain-error-string');
    }

    await import('@node-singletons/fs').then(({ rmSync }) =>
      rmSync(tmp, { recursive: true, force: true })
    );
  });
});
