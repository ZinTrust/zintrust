import { describe, expect, it, vi, type Mock } from 'vitest';

import { useDatabase } from '@orm/Database';
import { QueryBuilder } from '@orm/QueryBuilder';
import { registerHealthRoutes } from '@routes/health';
import { Router } from '@routing/Router';

vi.mock('@orm/Database');
vi.mock('@orm/QueryBuilder', () => ({
  QueryBuilder: {
    ping: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@config/logger');

describe('routes/health connect() branches (patch coverage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls db.connect() in /health when isConnected() is false', async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    const db = {
      isConnected: vi.fn().mockReturnValue(false),
      connect,
    };
    (useDatabase as Mock).mockReturnValue(db);

    const router = Router.createRouter();
    registerHealthRoutes(router);

    const match = Router.match(router, 'GET', '/health');
    if (match === null) throw new Error('Expected /health route handler');

    const res = { json: vi.fn(), setStatus: vi.fn().mockReturnThis() } as any;
    await match.handler({} as any, res);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(QueryBuilder.ping).toHaveBeenCalledTimes(1);
  });

  it('calls db.connect() in /health/ready when isConnected() is false', async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    const db = {
      isConnected: vi.fn().mockReturnValue(false),
      connect,
    };
    (useDatabase as Mock).mockReturnValue(db);

    const router = Router.createRouter();
    registerHealthRoutes(router);

    const match = Router.match(router, 'GET', '/health/ready');
    if (match === null) throw new Error('Expected /health/ready route handler');

    const res = { json: vi.fn(), setStatus: vi.fn().mockReturnThis() } as any;
    await match.handler({} as any, res);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(QueryBuilder.ping).toHaveBeenCalledTimes(1);
  });
});
