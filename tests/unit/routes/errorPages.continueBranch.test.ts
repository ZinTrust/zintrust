import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('errorPages continue branch', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('continues when resolveSafePath returns undefined for directory', async () => {
    const send = vi.fn();
    const setStatus = vi.fn();
    const setHeader = vi.fn();

    // Mock candidate roots to one entry
    vi.doMock('@core-routes/publicRoot', () => ({ getFrameworkPublicRoots: () => ['/tmp'] }));

    // Mock path and fs behavior: resolveSafePath returns undefined to force continue
    vi.doMock('@node-singletons/path', () => ({
      join: (...parts: string[]) => parts.join('/'),
      extname: (_p: string) => '.html',
    }));
    vi.doMock('@node-singletons/fs', () => ({
      existsSync: () => false,
      statSync: () => ({
        isDirectory: () => false,
        isFile: () => false,
      }),
      readFileSync: () => '<html></html>',
    }));
    vi.doMock('@core-routes/common', () => ({
      resolveSafePath: () => undefined,
      tryDecodeURIComponent: (s: string) => s,
    }));

    const { serveErrorPagesFile } = await import('@/routes/errorPages');

    const res = { send, setStatus, setHeader } as any;

    const result = serveErrorPagesFile('/error-pages/some/path', res);
    expect(result).toBe(true);
    expect(setStatus).toHaveBeenCalledWith(404);
    expect(send).toHaveBeenCalledWith('Not Found');
  });
});
