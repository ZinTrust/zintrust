import { describe, expect, it, vi } from 'vitest';

const { listEntries, getEntry } = vi.hoisted(() => ({
  listEntries: vi.fn(),
  getEntry: vi.fn(),
}));

vi.mock('@zintrust/core/config', () => ({
  appConfig: { name: 'ZinTrust Test App' },
}));

vi.mock('@zintrust/core/database', () => ({
  useDatabase: vi.fn(() => ({ connection: 'trace-db' })),
}));

vi.mock('../../src/config', () => ({
  TraceConfig: {
    merge: vi.fn(() => ({ connection: 'trace' })),
  },
}));

vi.mock('../../src/storage', () => ({
  TraceStorage: {
    resolveStorage: vi.fn(() => ({})),
  },
}));

vi.mock('../../src/dashboard/handlers', () => ({
  addMonitoring: vi.fn(),
  clearEntries: vi.fn(),
  getBatch: vi.fn(),
  getEntry,
  getMonitoring: vi.fn(),
  getStats: vi.fn(),
  getClientHosts: vi.fn(),
  listEntries,
  removeMonitoring: vi.fn(),
  setHandlerStorage: vi.fn(),
}));

import { createRouter, Router } from '@core-routes/Router';
import { registerTraceRoutes } from '../../src/dashboard/routes';

describe('registerTraceRoutes SPA routing', () => {
  const setup = (basePath = '/trace') => {
    const router = createRouter();
    registerTraceRoutes(router, {} as never, { basePath });
    return router;
  };

  it('serves the SPA shell for the base path', () => {
    const match = Router.match(setup(), 'GET', '/trace');
    expect(match?.routePath).toBe('/trace');
  });

  it('serves the SPA shell for the trailing-slash base path', () => {
    const match = Router.match(setup(), 'GET', '/trace/');
    expect(match?.routePath).toBe('/trace/');
  });

  it.each(['/trace/entries', '/trace/entries/abc', '/trace/batch/123'])(
    'serves the SPA shell for deep link %s (refresh-safe)',
    (path) => {
      const match = Router.match(setup(), 'GET', path);
      expect(match?.routePath).toBe('/trace/:path*');
      expect(match?.params.path).toBe(path.slice('/trace/'.length));
    }
  );

  it('keeps REST API GET routes ahead of the SPA catch-all', () => {
    const router = setup();

    const entries = Router.match(router, 'GET', '/trace/api/entries');
    expect(entries?.routePath).toBe('/trace/api/entries');
    expect(entries?.handler).toBe(listEntries);

    const entry = Router.match(router, 'GET', '/trace/api/entries/some-uuid');
    expect(entry?.routePath).toBe('/trace/api/entries/:uuid');
    expect(entry?.handler).toBe(getEntry);
  });

  it('honours a custom base path', () => {
    const router = setup('/ops/telescope');

    expect(Router.match(router, 'GET', '/ops/telescope/entries')?.routePath).toBe(
      '/ops/telescope/:path*'
    );
    expect(Router.match(router, 'GET', '/ops/telescope/api/entries')?.handler).toBe(listEntries);
  });
});
