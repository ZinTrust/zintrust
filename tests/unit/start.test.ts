import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/utils/EnvFileLoader', () => ({
  EnvFileLoader: {
    ensureLoaded: vi.fn(),
  },
}));

import { ProjectRuntime } from '@runtime/ProjectRuntime';

import { EnvFileLoader } from '@cli/utils/EnvFileLoader';

import { bootStandaloneService, configureStandaloneService, isNodeMain } from '@/start';

const createCloudflareWorkerModule = (fetchImpl?: ((...args: unknown[]) => Promise<Response>) | null) => ({
  fetch: fetchImpl,
  ZintrustSocketHub: class {},
});

describe('start helpers', () => {
  const originalArgv = process.argv;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    ProjectRuntime.clear();
  });

  it('returns true when argv path matches import meta url', () => {
    process.argv = ['node', '/tmp/app.js'];
    expect(isNodeMain('file:///tmp/app.js')).toBe(true);
  });

  it('returns false when argv is missing', () => {
    process.argv = ['node'];
    expect(isNodeMain('file:///tmp/app.js')).toBe(false);
  });

  it('returns true when argv ends with import meta path', () => {
    process.argv = ['node', '/tmp/app.js'];
    expect(isNodeMain('/tmp/app.js')).toBe(true);
  });

  it('configures standalone service runtime in core', () => {
    const runtime = configureStandaloneService({
      domain: 'ecommerce',
      name: 'users',
      configRoot: 'src/services/ecommerce/users/config',
    });

    expect(runtime).toEqual({
      id: 'ecommerce/users',
      domain: 'ecommerce',
      name: 'users',
      configRoot: 'src/services/ecommerce/users/config',
    });
    expect(ProjectRuntime.getActiveService()).toEqual(runtime);
  });

  it('throws a validation error when standalone service shape is invalid', () => {
    expect(() => configureStandaloneService({ domain: 'ecommerce' })).toThrow(
      /Standalone service runtime requires at least domain and name/
    );
  });

  it('boots standalone service without starting node bootstrap when not main', async () => {
    process.argv = ['node'];
    process.env['ZINTRUST_PROJECT_ROOT'] = '/workspace';

    const runtime = await bootStandaloneService('file:///tmp/service.js', {
      domain: 'ecommerce',
      name: 'orders',
      configRoot: 'src/services/ecommerce/orders/config',
    });

    expect(runtime).toEqual({
      id: 'ecommerce/orders',
      domain: 'ecommerce',
      name: 'orders',
      configRoot: 'src/services/ecommerce/orders/config',
    });
    expect(EnvFileLoader.ensureLoaded).toHaveBeenCalledWith({
      cwd: '/workspace',
      includeCwd: true,
      envPaths: ['/workspace/src/services/ecommerce/orders'],
    });
    expect(ProjectRuntime.getActiveService()).toEqual(runtime);
  });

  it('allows standalone services to skip root env and use an explicit envPath', async () => {
    process.argv = ['node'];
    process.env['ZINTRUST_PROJECT_ROOT'] = '/workspace';

    const runtime = await bootStandaloneService('file:///tmp/service.js', {
      domain: 'ecommerce',
      name: 'billing',
      configRoot: 'src/services/ecommerce/billing/config',
      rootEnv: false,
      envPath: 'config/env/microservices/billing/.env.staging',
    });

    expect(runtime).toEqual({
      id: 'ecommerce/billing',
      domain: 'ecommerce',
      name: 'billing',
      configRoot: 'src/services/ecommerce/billing/config',
    });
    expect(ProjectRuntime.getActiveService()).toEqual(runtime);
    expect(EnvFileLoader.ensureLoaded).toHaveBeenCalledWith({
      cwd: '/workspace',
      includeCwd: false,
      envPaths: ['/workspace/config/env/microservices/billing/.env.staging'],
    });
  });

  it('loads root env before project bootstrap when start() runs in node mode', async () => {
    process.env['ZINTRUST_PROJECT_ROOT'] = '/workspace';

    const order: string[] = [];
    const loadProjectBootstrap = vi.fn(async () => {
      order.push('bootstrap');
    });
    const ensureNodeStartupEnvLoaded = vi.fn(async () => {
      order.push('env');
      return { loadedFiles: ['.env'] };
    });

    vi.resetModules();
    vi.doMock('@runtime/ProjectBootstrap', () => ({
      loadProjectBootstrap,
    }));
    vi.doMock('@runtime/NodeStartup', () => ({
      ensureNodeStartupEnvLoaded,
    }));

    const { start } = await import('@/start');
    await start();

    expect(order).toEqual(['env', 'bootstrap']);
  });

  it('does not import cloudflare worker entry while starting in node mode', async () => {
    process.env['ZINTRUST_PROJECT_ROOT'] = '/workspace';

    const ensureNodeStartupEnvLoaded = vi.fn(async () => ({ loadedFiles: ['.env'] }));
    const loadProjectBootstrap = vi.fn(async () => undefined);
    const mockCloudflareImport = vi.fn(() => {
      throw new Error('cloudflare-entry-imported');
    });

    vi.resetModules();
    vi.doMock('@runtime/NodeStartup', () => ({
      ensureNodeStartupEnvLoaded,
    }));
    vi.doMock('@runtime/ProjectBootstrap', () => ({
      loadProjectBootstrap,
    }));
    vi.doMock('@functions/cloudflare', mockCloudflareImport);

    const { start } = await import('@/start');

    await expect(start()).resolves.toBeUndefined();
  });

  it('re-exports the socket durable object from the shared start entry', async () => {
    const mod = await import('@/start');

    expect(mod.ZintrustSocketHub).toBeTypeOf('function');
  });

  it('uses the default worker export when the cloudflare module is a namespace object', async () => {
    const workerFetch = vi.fn(async () => new Response('ok', { status: 200 }));

    vi.resetModules();
    vi.doMock('@functions/cloudflare', () => ({
      fetch: undefined,
      default: {
        fetch: workerFetch,
      },
      ZintrustSocketHub: class {},
    }));

    const mod = await import('@/start');
    const response = await mod.default.fetch(new Request('https://example.test'), {}, {});

    expect(workerFetch).toHaveBeenCalledTimes(1);
    await expect(response.text()).resolves.toBe('ok');
  });

  it('uses the direct worker fetch export when present', async () => {
    const workerFetch = vi.fn(async () => new Response('direct', { status: 200 }));

    vi.resetModules();
    vi.doMock('@functions/cloudflare', () => createCloudflareWorkerModule(workerFetch));

    const mod = await import('@/start');
    const response = await mod.default.fetch(new Request('https://example.test'), {}, {});

    expect(workerFetch).toHaveBeenCalledTimes(1);
    await expect(response.text()).resolves.toBe('direct');
  });

  it('throws a validation error when the cloudflare worker export has no fetch handler', async () => {
    vi.resetModules();
    vi.doMock('@functions/cloudflare', () => ({
      ...createCloudflareWorkerModule(null),
      default: {},
    }));

    const mod = await import('@/start');

    await expect(
      mod.default.fetch(new Request('https://example.test'), {}, {})
    ).rejects.toMatchObject({
      name: 'ValidationError',
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('delegates deno and lambda exports to their runtime modules', async () => {
    const denoHandler = vi.fn(async () => new Response('deno-ok', { status: 200 }));
    const lambdaHandler = vi.fn(async () => ({ ok: true }));
    const workerFetch = vi.fn(async () => new Response('worker-ok', { status: 200 }));

    vi.resetModules();
    vi.doMock('@functions/deno', () => ({ default: denoHandler }));
    vi.doMock('@functions/lambda', () => ({ handler: lambdaHandler }));
    vi.doMock('@functions/cloudflare', () => createCloudflareWorkerModule(workerFetch));

    const mod = await import('@/start');
    const denoResponse = await mod.deno(new Request('https://example.test/deno'));
    const lambdaResponse = await mod.handler({ test: true }, { awsRequestId: 'req-1' });

    expect(denoHandler).toHaveBeenCalledTimes(1);
    await expect(denoResponse.text()).resolves.toBe('deno-ok');
    expect(lambdaHandler).toHaveBeenCalledWith({ test: true }, { awsRequestId: 'req-1' });
    expect(lambdaResponse).toEqual({ ok: true });
  });
});
