import { describe, expect, it, vi } from 'vitest';

describe('establish-baseline more coverage', () => {
  it('covers realpathSync error catch in main-module detection without running baseline', async () => {
    vi.resetModules();

    const originalArgv = process.argv;
    process.argv = ['node', '/entry.js'];

    vi.doMock('@common/index', async () => {
      const actual = await vi.importActual<typeof import('@common/index')>('@common/index');
      return {
        ...actual,
        esmFilePath: () => '/current.js',
      };
    });

    vi.doMock('@node-singletons', () => ({
      fs: {
        realpathSync: () => {
          throw new Error('realpath boom');
        },
      },
    }));

    await expect(import('@performance/establish-baseline')).resolves.toBeTruthy();

    process.argv = originalArgv;
  });
});
