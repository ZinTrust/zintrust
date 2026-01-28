import { HTTP_HEADERS } from '@config/constants';
import { Router } from '@core-routes/Router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@config/env', () => ({
  Env: {
    get: vi.fn((_key: string, defaultVal?: string) => defaultVal ?? ''),
    getInt: vi.fn((_key: string, defaultVal?: number) => defaultVal ?? 0),
    getBool: vi.fn((_key: string, defaultVal?: boolean) => defaultVal ?? false),
    getFloat: vi.fn((_key: string, defaultVal?: number) => defaultVal ?? 0),
  },
}));

vi.mock('@storage/LocalSignedUrl', () => ({
  LocalSignedUrl: {
    verifyToken: vi.fn(),
  },
}));

vi.mock('@storage/index', () => ({
  Storage: {
    get: vi.fn(),
  },
}));

import { Env } from '@config/env';
import { registerStorageRoutes } from '@routes/storage';
import { LocalSignedUrl } from '@storage/LocalSignedUrl';
import { Storage } from '@storage/index';

describe('Storage routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when token is missing', async () => {
    const router = Router.createRouter();
    registerStorageRoutes(router);

    const match = Router.match(router, 'GET', '/storage/download');
    if (match === null) throw new Error('Expected /storage/download route handler');

    const req = {
      getQueryParam: vi.fn(() => undefined),
    } as unknown as { getQueryParam: Mock };

    const res = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as { setStatus: Mock; json: Mock };

    await match.handler(req as any, res as any);

    expect(res.setStatus).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Missing token' });
  });

  it('returns 500 when APP_KEY is missing', async () => {
    (Env.get as unknown as Mock).mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'APP_KEY') return '';
      return defaultVal ?? '';
    });

    const router = Router.createRouter();
    registerStorageRoutes(router);

    const match = Router.match(router, 'GET', '/storage/download');
    if (match === null) throw new Error('Expected /storage/download route handler');

    const req = {
      getQueryParam: vi.fn(() => 'token'),
    } as unknown as { getQueryParam: Mock };

    const res = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as { setStatus: Mock; json: Mock };

    await match.handler(req as any, res as any);

    expect(res.setStatus).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Storage signing is not configured' });
  });

  it('returns 403 when token is invalid or expired', async () => {
    (Env.get as unknown as Mock).mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'APP_KEY') return 'test-app-key';
      return defaultVal ?? '';
    });

    (LocalSignedUrl.verifyToken as unknown as Mock).mockImplementation(() => {
      throw new Error('bad token');
    });

    const router = Router.createRouter();
    registerStorageRoutes(router);

    const match = Router.match(router, 'GET', '/storage/download');
    if (match === null) throw new Error('Expected /storage/download route handler');

    const req = {
      getQueryParam: vi.fn(() => 'token'),
    } as unknown as { getQueryParam: Mock };

    const res = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as { setStatus: Mock; json: Mock };

    await match.handler(req as any, res as any);

    expect(res.setStatus).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: 'Invalid or expired token' });
  });

  it('returns 400 when token disk is not local', async () => {
    (Env.get as unknown as Mock).mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'APP_KEY') return 'test-app-key';
      return defaultVal ?? '';
    });

    (LocalSignedUrl.verifyToken as unknown as Mock).mockReturnValue({
      disk: 's3',
      key: 'x.txt',
      exp: Date.now() + 10_000,
      method: 'GET',
    });

    const router = Router.createRouter();
    registerStorageRoutes(router);

    const match = Router.match(router, 'GET', '/storage/download');
    if (match === null) throw new Error('Expected /storage/download route handler');

    const req = {
      getQueryParam: vi.fn(() => 'token'),
    } as unknown as { getQueryParam: Mock };

    const res = {
      setStatus: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as { setStatus: Mock; json: Mock };

    await match.handler(req as any, res as any);

    expect(res.setStatus).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Unsupported disk' });
  });

  it('returns file contents for a valid token', async () => {
    (Env.get as unknown as Mock).mockImplementation((key: string, defaultVal?: string) => {
      if (key === 'APP_KEY') return 'test-app-key';
      return defaultVal ?? '';
    });

    (LocalSignedUrl.verifyToken as unknown as Mock).mockReturnValue({
      disk: 'local',
      key: 'a/b.txt',
      exp: Date.now() + 10_000,
      method: 'GET',
    });

    const body = Buffer.from('hello');
    (Storage.get as unknown as Mock).mockResolvedValue(body);

    const router = Router.createRouter();
    registerStorageRoutes(router);

    const match = Router.match(router, 'GET', '/storage/download');
    if (match === null) throw new Error('Expected /storage/download route handler');

    const req = {
      getQueryParam: vi.fn(() => 'token'),
    } as unknown as { getQueryParam: Mock };

    const res = {
      setHeader: vi.fn(),
      setStatus: vi.fn().mockReturnThis(),
      send: vi.fn(),
    } as unknown as { setHeader: Mock; setStatus: Mock; send: Mock };

    await match.handler(req as any, res as any);

    expect(Storage.get).toHaveBeenCalledWith('local', 'a/b.txt');
    expect(res.setHeader).toHaveBeenCalledWith(
      HTTP_HEADERS.CONTENT_TYPE,
      'application/octet-stream'
    );
    expect(res.setStatus).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(body);
  });
});
