import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import * as nodeFs from 'node:fs';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';

import { Router } from '@/routing/Router';
import { HTTP_HEADERS, MIME_TYPES } from '@config/constants';
import * as fsSingleton from '@node-singletons/fs';

const hoisted = vi.hoisted(() => ({
  publicRoot: '',
}));

vi.mock('@routing/publicRoot', () => ({
  getPublicRoot: () => hoisted.publicRoot,
}));

import { registerErrorPagesRoutes, serveErrorPagesFile } from '@/routes/errorPages';

type TestRes = {
  setStatus: Mock;
  setHeader: Mock;
  send: Mock;
};

const createRes = (): TestRes => ({
  setStatus: vi.fn().mockReturnThis(),
  setHeader: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
});

describe('patch coverage: routing/errorPages', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();

    tempDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'zintrust-error-pages-'));
    hoisted.publicRoot = tempDir;

    nodeFs.mkdirSync(nodePath.join(tempDir, 'error-pages'), { recursive: true });
    nodeFs.writeFileSync(nodePath.join(tempDir, 'error-pages', 'app.css'), 'body{}');

    nodeFs.mkdirSync(nodePath.join(tempDir, 'error-pages', 'dir'), { recursive: true });

    nodeFs.writeFileSync(nodePath.join(tempDir, 'zintrust.svg'), '<svg />');
  });

  afterEach(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns false for non /error-pages paths', () => {
    const res = createRes();
    expect(serveErrorPagesFile('/nope', res as any)).toBe(false);
  });

  it('serves /error-pages root as 404', () => {
    const res = createRes();
    expect(serveErrorPagesFile('/error-pages', res as any)).toBe(true);
    expect(res.setStatus).toHaveBeenCalledWith(404);
    expect(res.setHeader).toHaveBeenCalledWith(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
  });

  it('serves static asset under /error-pages', () => {
    const res = createRes();
    expect(serveErrorPagesFile('/error-pages/app.css', res as any)).toBe(true);
    expect(res.setStatus).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith(HTTP_HEADERS.CONTENT_TYPE, expect.any(String));
    expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
  });

  it('returns 404 when target is directory', () => {
    const res = createRes();
    expect(serveErrorPagesFile('/error-pages/dir', res as any)).toBe(true);
    expect(res.setStatus).toHaveBeenCalledWith(404);
  });

  it('returns 404 when traversal escapes baseDir', () => {
    const res = createRes();
    expect(serveErrorPagesFile('/error-pages/../secret.txt', res as any)).toBe(true);
    expect(res.setStatus).toHaveBeenCalledWith(404);
  });

  it('returns 500 when read fails', () => {
    const spy = vi.spyOn(fsSingleton, 'readFileSync').mockImplementation((p: any) => {
      if (String(p).endsWith('app.css')) throw new Error('boom');
      return nodeFs.readFileSync(p);
    });

    const res = createRes();
    expect(serveErrorPagesFile('/error-pages/app.css', res as any)).toBe(true);
    expect(res.setStatus).toHaveBeenCalledWith(500);

    spy.mockRestore();
  });

  it('registers /zintrust.svg and serves it (and handles errors)', async () => {
    const router = Router.createRouter();
    registerErrorPagesRoutes(router);

    const match = Router.match(router, 'GET', '/zintrust.svg');
    if (match === null) throw new Error('Expected /zintrust.svg route');

    const resOk = createRes();
    await match.handler({ getPath: vi.fn(() => '/zintrust.svg') } as any, resOk as any);
    expect(resOk.setStatus).toHaveBeenCalledWith(200);
    expect(resOk.setHeader).toHaveBeenCalledWith(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.SVG);

    vi.spyOn(fsSingleton, 'readFileSync').mockImplementationOnce(() => {
      throw new Error('boom');
    });

    const resErr = createRes();
    await match.handler({ getPath: vi.fn(() => '/zintrust.svg') } as any, resErr as any);
    expect(resErr.setStatus).toHaveBeenCalledWith(500);
    expect(resErr.send).toHaveBeenCalledWith('Internal Server Error');
  });
});
