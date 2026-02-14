import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from 'vitest';

import * as nodeFs from 'node:fs';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';

import { HTTP_HEADERS } from '@config/constants';
import { Router } from '@core-routes/Router';

const hoisted = vi.hoisted(() => ({
  publicRoot: '',
  handleNotFound: vi.fn(),
}));

vi.mock('@core-routes/publicRoot', () => ({
  getPublicRoot: () => hoisted.publicRoot,
  getPublicRootAsync: async () => hoisted.publicRoot,
}));

vi.mock('@core-routes/error', () => ({
  ErrorRouting: {
    handleNotFound: hoisted.handleNotFound,
  },
}));

import {
  registerDocRoutes,
  serveDocumentationFileAsync,
  setDocumentationCSPHeaders,
} from '@core-routes/doc';

type TestRes = {
  setStatus: Mock;
  setHeader: Mock;
  send: Mock;
  json: Mock;
};

const createRes = (): TestRes => ({
  setStatus: vi.fn().mockReturnThis(),
  setHeader: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
});

describe('patch coverage: routing/doc', () => {
  let tempDir: string;

  beforeAll(() => {
    vi.clearAllMocks();
    tempDir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'zintrust-doc-'));
    hoisted.publicRoot = tempDir;

    nodeFs.writeFileSync(nodePath.join(tempDir, 'index.html'), '<h1>Docs</h1>');
    nodeFs.writeFileSync(nodePath.join(tempDir, 'foo.html'), '<p>Foo</p>');

    nodeFs.mkdirSync(nodePath.join(tempDir, 'assets'), { recursive: true });
    nodeFs.writeFileSync(nodePath.join(tempDir, 'assets', 'app.js'), 'console.log("ok")');
  });

  afterAll(() => {
    nodeFs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('serves /doc directory index.html', async () => {
    const res = createRes();

    const served = await serveDocumentationFileAsync('/doc', res as any);
    expect(served).toBe(true);
    expect(res.setStatus).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', expect.any(String));
    expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
  });

  it('serves extensionless /doc/foo via .html fallback', async () => {
    const res = createRes();

    const served = await serveDocumentationFileAsync('/doc/foo', res as any);
    expect(served).toBe(true);
    expect(res.setStatus).toHaveBeenCalledWith(200);
  });

  it('normalizes encoded and backslash paths under /doc', async () => {
    const res1 = createRes();
    expect(await serveDocumentationFileAsync('/doc/assets%2Fapp.js', res1 as any)).toBe(true);

    const res2 = createRes();
    expect(await serveDocumentationFileAsync(String.raw`/doc/assets\app.js`, res2 as any)).toBe(
      true
    );
  });

  it('returns false when path traversal escapes public root', async () => {
    const res = createRes();
    expect(await serveDocumentationFileAsync('/doc/../secret', res as any)).toBe(false);
  });

  it('sets relaxed CSP header', () => {
    const res = createRes();
    setDocumentationCSPHeaders(res as any);
    expect(res.setHeader).toHaveBeenCalledWith(
      HTTP_HEADERS.CONTENT_SECURITY_POLICY,
      expect.stringContaining("default-src 'self'")
    );
  });

  it('registers /doc routes and calls notFound when missing', async () => {
    const router = Router.createRouter();
    registerDocRoutes(router);

    const match = Router.match(router, 'GET', '/doc/missing-file');
    if (match === null) throw new Error('Expected /doc/:path* route');

    const req = { getPath: vi.fn(() => '/doc/missing-file') } as any;
    const res = createRes();

    await match.handler(req, res as any);

    expect(res.setHeader).toHaveBeenCalledWith(
      HTTP_HEADERS.CONTENT_SECURITY_POLICY,
      expect.any(String)
    );
    expect(hoisted.handleNotFound).toHaveBeenCalledTimes(1);
  });
});
