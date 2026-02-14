import type { IRequest } from '@http/Request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@node-singletons/fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe('ErrorPageRenderer', () => {
  const makeReq = (path: string, accept: unknown): IRequest => {
    return {
      getPath: () => path,
      getHeader: (name: string) => {
        if (name.toLowerCase() === 'accept') return accept as any;
        return undefined;
      },
    } as unknown as IRequest;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shouldSendHtml is false for /api paths', async () => {
    const { ErrorPageRenderer } = await import('@http/error-pages/ErrorPageRenderer');
    const req = makeReq('/api/tasks', 'text/html');
    expect(ErrorPageRenderer.shouldSendHtml(req)).toBe(false);
  });

  it('shouldSendHtml is true for browser accept headers (non-api)', async () => {
    const { ErrorPageRenderer } = await import('@http/error-pages/ErrorPageRenderer');
    const req = makeReq('/docs', 'text/html,application/xhtml+xml');
    expect(ErrorPageRenderer.shouldSendHtml(req)).toBe(true);
  });

  it('renderHtml returns undefined for unsupported status code', async () => {
    const { ErrorPageRenderer } = await import('@http/error-pages/ErrorPageRenderer');
    const html = ErrorPageRenderer.renderHtml('/public', {
      statusCode: 418,
      errorName: 'Teapot',
      errorMessage: 'no',
      requestPath: '/x',
    });
    expect(html).toBeUndefined();
  });

  it('renderHtml reads template and interpolates escaped values', async () => {
    const fs = await import('@node-singletons/fs');
    (fs.existsSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (fs.readFileSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      '<h1>{{statusCode}}</h1>{{errorMessage}} {{requestPath}}'
    );

    const { ErrorPageRenderer } = await import('@http/error-pages/ErrorPageRenderer');

    const html = ErrorPageRenderer.renderHtml('/public', {
      statusCode: 404,
      errorName: 'Not Found',
      errorMessage: '<bad>',
      requestPath: "/x?y='z'",
    });

    expect(html).toContain('<h1>404</h1>');
    expect(html).toContain('&lt;bad&gt;');
    expect(html).toContain('&#39;z&#39;');
  });

  it('renderHtml falls back to default template if file missing', async () => {
    const fs = await import('@node-singletons/fs');
    (fs.existsSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const { ErrorPageRenderer } = await import('@http/error-pages/ErrorPageRenderer');
    const html = ErrorPageRenderer.renderHtml('/public', {
      statusCode: 500,
      errorName: 'Error',
      errorMessage: 'oops',
      requestPath: '/x',
    });

    expect(html).toContain('500');
    expect(html).toContain('oops');
  });
});
