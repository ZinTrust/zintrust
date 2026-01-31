import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('errorPages directory continue branch', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('continues when filePath is a directory and ultimately returns 404', async () => {
    const send = vi.fn();
    const setStatus = vi.fn();
    const setHeader = vi.fn();

    // Mock candidate roots to one entry
    vi.doMock('@core-routes/publicRoot', () => ({ getFrameworkPublicRoots: () => ['/tmp'] }));

    // resolveSafePath returns a concrete file path
    vi.doMock('@core-routes/common', () => ({
      resolveSafePath: (_base: string, _rel: string) => '/tmp/error-pages/file',
      tryDecodeURIComponent: (s: string) => s,
    }));

    // Mock fs: exists true, statSync.isDirectory true for that path
    vi.doMock('@node-singletons/fs', () => ({
      existsSync: () => true,
      statSync: () => ({ isDirectory: () => true, isFile: () => false }),
      readFileSync: () => '<html></html>',
    }));
    vi.doMock('@node-singletons/path', () => ({
      join: (...parts: string[]) => parts.join('/'),
      extname: () => '.html',
    }));

    const { serveErrorPagesFile } = await import('@/routes/errorPages');

    const res = { send, setStatus, setHeader } as any;

    const result = serveErrorPagesFile('/error-pages/x', res);
    expect(result).toBe(true);
    expect(setStatus).toHaveBeenCalledWith(404);
    expect(send).toHaveBeenCalledWith('Not Found');
  });
});
