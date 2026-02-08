/**
 * Redis Test Routes
 * Tests Redis connectivity via Durable Object pool and proxy from Cloudflare Workers
 */

import { Cloudflare } from '@config/cloudflare';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { WorkerFactory } from '@zintrust/workers';
import type { CacheDriver } from 'packages/cache-redis/src';
import { RedisProxyAdapter, RedisWorkersDurableObjectAdapter } from 'packages/cache-redis/src';

const ADVANCED_WORKER_SPEC = 'https://wk.zintrust.com/AdvancEmailWorker.js';

const runRedisTest = async (driver: CacheDriver, label: string) => {
  const key = `zt:redis-test:${label}:${Date.now()}`;
  const value = { ok: true, ts: new Date().toISOString() };

  await driver.set(key, value, 30);
  const read = await driver.get<typeof value>(key);
  const exists = await driver.has(key);
  await driver.delete(key);
  const existsAfterDelete = await driver.has(key);

  return {
    key,
    wrote: value,
    read,
    exists,
    existsAfterDelete,
  };
};

/**
 * Test Redis via Durable Object pool binding (REDIS_POOL)
 */
export const testRedisDurableObject = async (_req: IRequest, res: IResponse): Promise<void> => {
  try {
    if (Cloudflare.getWorkersEnv() === null) {
      throw ErrorFactory.createConfigError(
        'Durable Object test requires Cloudflare Workers runtime.'
      );
    }

    const driver = RedisWorkersDurableObjectAdapter.create();
    const result = await runRedisTest(driver, 'do');

    res.json({
      success: true,
      message: 'Redis Durable Object test successful',
      adapter: 'packages/cache-redis (Durable Object pool)',
      runtime: 'Cloudflare Workers',
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Redis Durable Object test failed',
      details: String(error),
      adapter: 'packages/cache-redis (Durable Object pool)',
      runtime: 'Cloudflare Workers',
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Test Redis via HTTP proxy
 */
export const testRedisProxy = async (_req: IRequest, res: IResponse): Promise<void> => {
  try {
    const driver = RedisProxyAdapter.create();
    const result = await runRedisTest(driver, 'proxy');

    res.json({
      success: true,
      message: 'Redis proxy test successful',
      adapter: 'packages/cache-redis (proxy)',
      runtime: Cloudflare.getWorkersEnv() !== null ? 'Cloudflare Workers' : 'Node',
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Redis proxy test failed',
      details: String(error),
      adapter: 'packages/cache-redis (proxy)',
      runtime: Cloudflare.getWorkersEnv() !== null ? 'Cloudflare Workers' : 'Node',
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Test URL-based worker processor resolution (Cloudflare Workers)
 */
export const testWorkerProcessorUrl = async (_req: IRequest, res: IResponse): Promise<void> => {
  try {
    const resolved = await WorkerFactory.resolveProcessorSpec(ADVANCED_WORKER_SPEC);
    if (!resolved) {
      throw ErrorFactory.createConfigError('PROCESSOR_SPEC_NOT_RESOLVED');
    }

    res.json({
      success: true,
      message: 'Processor spec resolved successfully',
      spec: ADVANCED_WORKER_SPEC,
      runtime: Cloudflare.getWorkersEnv() !== null ? 'Cloudflare Workers' : 'Node',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Processor spec resolution failed',
      spec: ADVANCED_WORKER_SPEC,
      details: String(error),
      runtime: Cloudflare.getWorkersEnv() !== null ? 'Cloudflare Workers' : 'Node',
      timestamp: new Date().toISOString(),
    });
  }
};
