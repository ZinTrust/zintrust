import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@node-singletons/fs', () => ({
  existsSync: vi.fn(() => false),
}));

vi.mock('@config/logger', () => ({
  Logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@exceptions/ZintrustError', () => ({
  ErrorFactory: {
    createTryCatchError: vi.fn(() => ({ name: 'TryCatchError' })),
  },
}));

import { Logger } from '@config/logger';
import { PluginAutoImports } from '@runtime/PluginAutoImports';

describe('patch coverage: PluginAutoImports projectRoot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to process.cwd() when env is not set', async () => {
    const original = process.env['ZINTRUST_PROJECT_ROOT'];
    delete process.env['ZINTRUST_PROJECT_ROOT'];

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/tmp/zintrust-test-root'); //NOSONAR

    const result = await PluginAutoImports.tryImportProjectAutoImports();

    // Import should fail when candidate exists but the import itself errors
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBeDefined();
    }
    expect(vi.mocked(Logger.debug)).toHaveBeenCalledWith(
      '[plugins] No plugin auto-imports file found',
      expect.objectContaining({ projectRoot: '/tmp/zintrust-test-root' }) //NOSONAR
    );

    cwdSpy.mockRestore();
    if (original !== undefined) process.env['ZINTRUST_PROJECT_ROOT'] = original;
  });

  it('covers error handling during import', async () => {
    const original = process.env['ZINTRUST_PROJECT_ROOT'];
    delete process.env['ZINTRUST_PROJECT_ROOT'];

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/tmp/zintrust-test-root');

    // Mock existsSync to return true
    const { existsSync } = await import('@node-singletons/fs');
    vi.mocked(existsSync).mockReturnValue(true);

    // Mock Promise.allSettled to throw an error, which will hit the outer catch block
    const originalPromiseAllSettled = Promise.allSettled;
    vi.spyOn(Promise, 'allSettled').mockImplementation(() => {
      throw new Error('Promise.allSettled failed');
    });

    const result = await PluginAutoImports.tryImportProjectAutoImports();

    // The outer catch block should handle this error
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('import-failed');
      expect(result.errorMessage).toBeDefined();
    }

    // Restore the original Promise.allSettled
    Promise.allSettled = originalPromiseAllSettled;

    cwdSpy.mockRestore();
    if (original !== undefined) process.env['ZINTRUST_PROJECT_ROOT'] = original;
  });
});
