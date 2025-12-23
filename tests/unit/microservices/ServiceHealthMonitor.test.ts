import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@config/logger', () => {
  const Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    scope: vi.fn(),
  };
  return { Logger };
});

vi.mock('@security/UrlValidator', () => ({
  validateUrl: vi.fn(),
}));

import {
  HealthCheckAggregator,
  HealthCheckHandler,
  ServiceHealthMonitor,
  type AggregatedHealthStatus,
  type HealthCheckResult,
  type IServiceHealthMonitor,
} from '@/microservices/ServiceHealthMonitor';

type ResState = { statusCode: number; jsonBody: unknown };

function createFakeRes(options?: { throwFirstJson?: boolean }): {
  res: IResponse;
  state: ResState;
} {
  const state: ResState = { statusCode: 200, jsonBody: undefined };
  let jsonCalls = 0;

  const res = {
    setStatus(code: number): IResponse {
      state.statusCode = code;
      return res as unknown as IResponse;
    },
    json(data: unknown): void {
      jsonCalls += 1;
      if (options?.throwFirstJson === true && jsonCalls === 1) {
        throw new Error('json failed');
      }
      state.jsonBody = data;
    },
  } as unknown as IResponse;

  return { res, state };
}

function createFakeReq(): IRequest {
  return {} as unknown as IRequest;
}

const okJsonResponse = (ok: boolean): Response => {
  return {
    ok,
    json: async () => ({ ok: true }),
  } as unknown as Response;
};

describe('ServiceHealthMonitor', (): void => {
  beforeEach((): void => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    // Default fetch mock (can be overridden in tests)
    (globalThis as unknown as { fetch?: unknown }).fetch = vi.fn(async () => okJsonResponse(true));
  });

  afterEach((): void => {
    vi.useRealTimers();
    delete (globalThis as unknown as { fetch?: unknown }).fetch;
  });

  describe('HealthCheckHandler', (): void => {
    it('returns 200 for healthy service (no deps, no db check)', async (): Promise<void> => {
      const handler = HealthCheckHandler.create('test-service', '1.0.0', 3000, 'localhost');
      const { res, state } = createFakeRes();

      await handler.handle(createFakeReq(), res);

      expect(state.statusCode).toBe(200);
      const body = state.jsonBody as HealthCheckResult;
      expect(body.service).toBe('test-service');
      expect(body.status).toBe('healthy');
      expect(body.checks.http).toBe(true);
    });

    it('returns 202 for degraded service when db fails and dependency is down', async (): Promise<void> => {
      (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        okJsonResponse(false)
      );

      const handler = HealthCheckHandler.create(
        'test-service',
        '1.0.0',
        3000,
        'localhost',
        ['dep-a'],
        async () => false
      );
      const { res, state } = createFakeRes();

      await handler.handle(createFakeReq(), res);

      expect(state.statusCode).toBe(202);
      const body = state.jsonBody as HealthCheckResult;
      expect(body.status).toBe('degraded');
      expect(body.checks.database).toBe(false);
      expect(body.checks.dependencies?.['dep-a']).toBe(false);
      expect(body.message).toBe('Database connection failed');
      const { validateUrl } = await import('@security/UrlValidator');
      expect(validateUrl).toHaveBeenCalled();
    });

    it('returns 503 for unhealthy service when db check throws', async (): Promise<void> => {
      const handler = HealthCheckHandler.create(
        'test-service',
        '1.0.0',
        3000,
        'localhost',
        [],
        async () => {
          throw new Error('db down');
        }
      );
      const { res, state } = createFakeRes();

      await handler.handle(createFakeReq(), res);

      expect(state.statusCode).toBe(503);
      const body = state.jsonBody as HealthCheckResult;
      expect(body.status).toBe('unhealthy');
      expect(body.checks.database).toBe(false);
      expect(body.message).toBe('Database check error');
    });

    it('falls back to 503 unhealthy payload if response serialization throws', async (): Promise<void> => {
      const handler = HealthCheckHandler.create('test-service', '1.0.0', 3000, 'localhost');
      const { res, state } = createFakeRes({ throwFirstJson: true });

      await handler.handle(createFakeReq(), res);

      expect(state.statusCode).toBe(503);
      const body = state.jsonBody as HealthCheckResult;
      expect(body.status).toBe('unhealthy');
      expect(body.checks.http).toBe(false);
      expect(typeof body.message).toBe('string');
    });
  });

  describe('ServiceHealthMonitor', (): void => {
    it('areAllHealthy is false before any checks when services are configured', (): void => {
      const monitor = ServiceHealthMonitor.create({ a: 'http://a/health' }, 1000); //NOSONAR
      expect(monitor.areAllHealthy()).toBe(false);
    });

    it('checkAll stores results and aggregates status', async (): Promise<void> => {
      (globalThis.fetch as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(okJsonResponse(true))
        .mockRejectedValueOnce(new Error('down'));

      const monitor = ServiceHealthMonitor.create(
        { a: 'http://a/health', b: 'http://b/health' }, //NOSONAR
        1000
      );

      const status = await monitor.checkAll();
      expect(status.totalServices).toBe(2);
      expect(status.healthy).toBe(1);
      expect(status.degraded).toBe(0);
      expect(status.unhealthy).toBe(0);
      expect(monitor.getServiceStatus('a')?.status).toBe('healthy');
      expect(monitor.getServiceStatus('b')?.status).toBe('stopped');
      expect(monitor.areAllHealthy()).toBe(false);
    });

    it('start runs an initial check and schedules interval; start twice warns; stop clears', async (): Promise<void> => {
      const monitor = ServiceHealthMonitor.create({ a: 'http://a/health' }, 1234); //NOSONAR
      const checkAllSpy = vi.spyOn(monitor, 'checkAll');
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
      const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

      monitor.start();
      expect(checkAllSpy).toHaveBeenCalledTimes(1);
      expect(setIntervalSpy).toHaveBeenCalledTimes(1);

      monitor.start();
      const { Logger } = await import('@config/logger');
      expect(Logger.warn).toHaveBeenCalled();

      monitor.stop();
      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

      monitor.stop();
      expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

      setIntervalSpy.mockRestore();
      clearIntervalSpy.mockRestore();
    });
  });

  describe('HealthCheckAggregator', (): void => {
    it('returns 503 when any service is unhealthy', async (): Promise<void> => {
      const monitor = {
        getLastStatus: (): AggregatedHealthStatus =>
          ({
            timestamp: 't',
            totalServices: 1,
            healthy: 0,
            degraded: 0,
            unhealthy: 1,
            services: [],
          }) satisfies AggregatedHealthStatus,
      } as unknown as IServiceHealthMonitor;

      const agg = HealthCheckAggregator.create(monitor);
      const { res, state } = createFakeRes();

      await agg.handle(createFakeReq(), res);
      expect(state.statusCode).toBe(503);
    });

    it('returns 202 when any service is degraded and none unhealthy', async (): Promise<void> => {
      const monitor = {
        getLastStatus: (): AggregatedHealthStatus =>
          ({
            timestamp: 't',
            totalServices: 2,
            healthy: 1,
            degraded: 1,
            unhealthy: 0,
            services: [],
          }) satisfies AggregatedHealthStatus,
      } as unknown as IServiceHealthMonitor;

      const agg = HealthCheckAggregator.create(monitor);
      const { res, state } = createFakeRes();

      await agg.handle(createFakeReq(), res);
      expect(state.statusCode).toBe(202);
    });

    it('returns 200 when all services are healthy', async (): Promise<void> => {
      const monitor = {
        getLastStatus: (): AggregatedHealthStatus =>
          ({
            timestamp: 't',
            totalServices: 1,
            healthy: 1,
            degraded: 0,
            unhealthy: 0,
            services: [],
          }) satisfies AggregatedHealthStatus,
      } as unknown as IServiceHealthMonitor;

      const agg = HealthCheckAggregator.create(monitor);
      const { res, state } = createFakeRes();

      await agg.handle(createFakeReq(), res);
      expect(state.statusCode).toBe(200);
    });
  });
});
