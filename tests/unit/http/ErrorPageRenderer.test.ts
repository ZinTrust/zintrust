import type { IRequest } from '@http/Request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@node-singletons/fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('@config/app', () => ({
  appConfig: {
    errorResponseMode: 'auto',
  },
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

  describe('ERROR_RESPONSE_MODE', () => {
    it('shouldSendHtml respects json mode - always returns false', async () => {
      const { appConfig } = await import('@config/app');
      vi.spyOn(appConfig, 'errorResponseMode', 'get').mockReturnValue('json');

      const { ErrorPageRenderer } = await import('@http/error-pages/ErrorPageRenderer');
      const req = makeReq('/docs', 'text/html,application/xhtml+xml');
      expect(ErrorPageRenderer.shouldSendHtml(req)).toBe(false);
    });

    it('shouldSendHtml respects html mode - returns true for browser requests', async () => {
      const { appConfig } = await import('@config/app');
      vi.spyOn(appConfig, 'errorResponseMode', 'get').mockReturnValue('html');

      const { ErrorPageRenderer } = await import('@http/error-pages/ErrorPageRenderer');
      const req = makeReq('/docs', 'text/html,application/xhtml+xml');
      expect(ErrorPageRenderer.shouldSendHtml(req)).toBe(true);
    });

    it('shouldSendHtml respects html mode - returns false for api paths', async () => {
      const { appConfig } = await import('@config/app');
      vi.spyOn(appConfig, 'errorResponseMode', 'get').mockReturnValue('html');

      const { ErrorPageRenderer } = await import('@http/error-pages/ErrorPageRenderer');
      const req = makeReq('/api/tasks', 'text/html');
      expect(ErrorPageRenderer.shouldSendHtml(req)).toBe(false);
    });

    it('shouldSendHtml respects auto mode - uses default logic', async () => {
      const { appConfig } = await import('@config/app');
      vi.spyOn(appConfig, 'errorResponseMode', 'get').mockReturnValue('auto');

      const { ErrorPageRenderer } = await import('@http/error-pages/ErrorPageRenderer');
      const req = makeReq('/docs', 'text/html,application/xhtml+xml');
      expect(ErrorPageRenderer.shouldSendHtml(req)).toBe(true);
    });
  });
});
