import type { IRequest } from '@http/Request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  getWorkersEnv: vi.fn(),
  getWorkersVar: vi.fn(),
  getAssetsBinding: vi.fn(),
}));

vi.mock('@node-singletons/fs', () => ({
  existsSync: mocks.existsSync,
  readFileSync: mocks.readFileSync,
}));
vi.mock('@config/cloudflare', () => ({
  Cloudflare: {
    getWorkersEnv: mocks.getWorkersEnv,
    getWorkersVar: mocks.getWorkersVar,
    getAssetsBinding: mocks.getAssetsBinding,
  },
}));
vi.mock('@config/app', () => ({ appConfig: { errorResponseMode: 'auto' } }));

import { ErrorPageRenderer } from '@http/error-pages/ErrorPageRenderer';

const req = (path: string, accept: unknown): IRequest =>
  ({
    getPath: () => path,
    getHeader: (name: string) => (name.toLowerCase() === 'accept' ? accept : undefined),
  }) as unknown as IRequest;

const input = (statusCode = 404) => ({
  statusCode,
  errorName: 'Error',
  errorMessage: 'boom',
  requestPath: '/x',
});

describe('ErrorPageRenderer uncovered branches', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete (globalThis as any).__zintrustErrorTemplates;
    mocks.getWorkersEnv.mockReturnValue(null);
    mocks.getWorkersVar.mockReturnValue(null);
    mocks.getAssetsBinding.mockReturnValue(null);
    mocks.existsSync.mockReturnValue(false);
    mocks.readFileSync.mockReturnValue('');
  });

  it('accept header array is joined for html and json preferences', () => {
    expect(ErrorPageRenderer.shouldSendHtml(req('/docs', ['text/html', 'text/plain']))).toBe(true);
    expect(ErrorPageRenderer.shouldSendHtml(req('/docs', ['application/json']))).toBe(false);
  });

  it('prefersHtml returns false for empty accept and for non-html accept', () => {
    expect(ErrorPageRenderer.shouldSendHtml(req('/docs', undefined))).toBe(false);
    expect(ErrorPageRenderer.shouldSendHtml(req('/docs', 'application/json'))).toBe(false);
  });

  it('prefersJson returns true for api paths, json and wildcard accepts', () => {
    expect(ErrorPageRenderer.shouldSendHtml(req('/api/x', 'text/html'))).toBe(false);
    expect(ErrorPageRenderer.shouldSendHtml(req('/docs', 'application/json'))).toBe(false);
    expect(ErrorPageRenderer.shouldSendHtml(req('/docs', '*/*'))).toBe(false);
  });

  it('setTemplates ignores invalid names and non-string values', () => {
    ErrorPageRenderer.setTemplates({
      '404': ['not a string'] as any,
      '418': 'ignored' as any,
      '500': '',
    });
    const html = ErrorPageRenderer.renderHtml('/public', input(404));
    expect(html).toContain('404');
    expect((globalThis as any).__zintrustErrorTemplates).toEqual({ '500': '' });
  });

  it('setTemplates stores a valid template and render uses it', () => {
    ErrorPageRenderer.setTemplates({ '404': '<b>{{errorMessage}}</b>' });
    expect(ErrorPageRenderer.renderHtml('/public', input(404))).toBe('<b>boom</b>');
  });

  it('read failure and empty file fall back to defaults', () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockImplementationOnce(() => {
      throw new Error('read fail');
    });
    expect(ErrorPageRenderer.renderHtml('/public', input(404))).toContain('<h1>404 Error</h1>');

    mocks.readFileSync.mockReturnValue('');
    expect(ErrorPageRenderer.renderHtml('/public', input(500))).toContain('<h1>500 Error</h1>');
  });

  it('workers runtime uses worker var template when present', () => {
    mocks.getWorkersEnv.mockReturnValue({});
    mocks.getWorkersVar.mockReturnValue('  <p>{{statusCode}}</p>  ');
    const html = ErrorPageRenderer.renderHtml('/public', input(404));
    expect(html).toBe('  <p>404</p>  ');
    expect(mocks.getAssetsBinding).not.toHaveBeenCalled();
  });

  it('workers runtime ignores blank worker var and uses default template', () => {
    mocks.getWorkersEnv.mockReturnValue({});
    mocks.getWorkersVar.mockReturnValue('   ');
    expect(ErrorPageRenderer.renderHtml('/public', input(500))).toContain('<h1>500 Error</h1>');
  });

  it('renderHtmlAsync: cached template short-circuits', async () => {
    ErrorPageRenderer.setTemplates({ '500': 'cached {{statusCode}}' });
    expect(await ErrorPageRenderer.renderHtmlAsync('/public', input(500))).toBe('cached 500');
    expect(mocks.getWorkersEnv).not.toHaveBeenCalled();
  });

  it('renderHtmlAsync: unsupported status returns undefined', async () => {
    expect(await ErrorPageRenderer.renderHtmlAsync('/public', input(418))).toBeUndefined();
  });

  it('renderHtmlAsync: node template from disk is cached', async () => {
    mocks.existsSync.mockReturnValue(true);
    mocks.readFileSync.mockReturnValue('<i>{{errorName}}</i>');
    expect(await ErrorPageRenderer.renderHtmlAsync('/public', input(404))).toBe('<i>Error</i>');
    expect((globalThis as any).__zintrustErrorTemplates['404']).toBe('<i>{{errorName}}</i>');
  });

  it('renderHtmlAsync: node default template when disk read missing', async () => {
    expect(await ErrorPageRenderer.renderHtmlAsync('/public', input(500))).toContain(
      '<h1>500 Error</h1>'
    );
  });

  it('renderHtmlAsync: workers assets fetch handles ok, blank, failure and throw', async () => {
    mocks.getWorkersEnv.mockReturnValue({});
    const fetch = vi.fn();
    mocks.getAssetsBinding.mockReturnValue({ fetch });

    fetch.mockResolvedValueOnce({ ok: true, text: async () => '<u>{{statusCode}}</u>' });
    expect(await ErrorPageRenderer.renderHtmlAsync('/public', input(404))).toBe('<u>404</u>');
    expect((globalThis as any).__zintrustErrorTemplates['404']).toBe('<u>{{statusCode}}</u>');

    delete (globalThis as any).__zintrustErrorTemplates;
    fetch.mockResolvedValueOnce({ ok: true, text: async () => '   ' });
    mocks.getWorkersVar.mockReturnValue('var {{statusCode}}');
    expect(await ErrorPageRenderer.renderHtmlAsync('/public', input(404))).toBe('var 404');

    delete (globalThis as any).__zintrustErrorTemplates;
    fetch.mockResolvedValueOnce({ ok: false });
    mocks.getWorkersVar.mockReturnValue(null);
    expect(await ErrorPageRenderer.renderHtmlAsync('/public', input(500))).toContain(
      '<h1>500 Error</h1>'
    );

    delete (globalThis as any).__zintrustErrorTemplates;
    fetch.mockRejectedValueOnce(new Error('network'));
    expect(await ErrorPageRenderer.renderHtmlAsync('/public', input(500))).toContain(
      '<h1>500 Error</h1>'
    );
  });
});
