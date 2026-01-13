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

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/tmp/zintrust-test-root');

    const result = await PluginAutoImports.tryImportProjectAutoImports();

    expect(result).toEqual({ ok: false, reason: 'not-found' });
    expect(vi.mocked(Logger.debug)).toHaveBeenCalledWith(
      '[plugins] No plugin auto-imports file found',
      expect.objectContaining({ projectRoot: '/tmp/zintrust-test-root' })
    );

    cwdSpy.mockRestore();
    if (original !== undefined) process.env['ZINTRUST_PROJECT_ROOT'] = original;
  });
});
