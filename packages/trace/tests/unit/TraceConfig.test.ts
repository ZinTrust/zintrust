import { describe, expect, it } from 'vitest';

import { TraceConfig } from '../../src/config';

describe('TraceConfig', () => {
  it('merges custom redaction keys without dropping the defaults', () => {
    const config = TraceConfig.merge({
      redaction: {
        keys: ['pin', 'authorization'],
        headers: ['x-custom-auth'],
        body: ['cardPin'],
        query: ['auth_code'],
      },
    });

    expect(config.redaction.keys).toEqual(
      expect.arrayContaining(['password', 'authorization', 'pin'])
    );
    expect(config.redaction.headers).toEqual(
      expect.arrayContaining(['authorization', 'x-custom-auth'])
    );
    expect(config.redaction.body).toEqual(expect.arrayContaining(['password', 'cardPin']));
    expect(config.redaction.query).toEqual(expect.arrayContaining(['auth_code']));
  });

  it('returns union redaction fields for a specific channel', () => {
    const config = TraceConfig.merge({
      redaction: {
        keys: ['pin'],
        headers: ['x-secret-header'],
        body: ['cardPin'],
        query: [],
      },
    });

    expect(TraceConfig.getRedactionFields(config, 'headers')).toEqual(
      expect.arrayContaining(['pin', 'authorization', 'x-secret-header'])
    );
    expect(TraceConfig.getRedactionFields(config, 'body')).toEqual(
      expect.arrayContaining(['pin', 'password', 'cardPin'])
    );
  });

  it('accepts request watcher include and exclude filters', () => {
    const config = TraceConfig.merge({
      watchers: {
        request: {
          get: { include: ['auth'], exclude: ['report'] },
          post: { include: ['checkout'] },
        },
      },
    });

    expect(config.watchers.request).toEqual(
      expect.objectContaining({
        get: expect.objectContaining({
          include: expect.arrayContaining(['auth']),
          exclude: expect.arrayContaining(['report']),
        }),
        post: expect.objectContaining({
          include: expect.arrayContaining(['checkout']),
        }),
      })
    );
  });

  it('accepts client request source overrides', () => {
    const config = TraceConfig.merge({
      watchers: {
        clientRequest: {
          exclude: ['internal'],
          sources: {
            termii: { enabled: false },
            sendgrid: { responseBody: false },
          },
        },
      },
    });

    expect(config.watchers.clientRequest).toEqual(
      expect.objectContaining({
        exclude: expect.arrayContaining(['internal']),
        sources: expect.objectContaining({
          termii: expect.objectContaining({ enabled: false }),
          sendgrid: expect.objectContaining({ responseBody: false }),
        }),
      })
    );
  });

  it('supports cache payload and SQL binding capture toggles', () => {
    const config = TraceConfig.merge({
      captureCachePayloads: true,
      captureQueryBindings: false,
      observeConnection: 'primary',
    });

    expect(config.captureCachePayloads).toBe(true);
    expect(config.captureQueryBindings).toBe(false);
    expect(config.observeConnection).toBe('primary');
  });

  it('supports trace proxy and service-tag overrides', () => {
    const config = TraceConfig.merge({
      serviceTag: 'payments-api',
      proxy: {
        enabled: true,
        url: 'https://trace.example.test/gateway',
        path: '/zin/trace/write',
        timeoutMs: 1500,
      },
    });

    expect(config.serviceTag).toBe('payments-api');
    expect(config.proxy).toEqual(
      expect.objectContaining({
        enabled: true,
        url: 'https://trace.example.test/gateway',
        path: '/zin/trace/write',
        timeoutMs: 1500,
      })
    );
  });

  it('accepts contains-based ignorePaths filters separately from ignoreRoutes', () => {
    const config = TraceConfig.merge({
      ignoreRoutes: ['/trace'],
      ignorePaths: ['queue-monitor', '.js'],
    });

    expect(config.ignoreRoutes).toEqual(['/trace']);
    expect(config.ignorePaths).toEqual(['queue-monitor', '.js']);
  });
});
