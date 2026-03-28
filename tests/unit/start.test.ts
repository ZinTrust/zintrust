import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cli/utils/EnvFileLoader', () => ({
  EnvFileLoader: {
    ensureLoaded: vi.fn(),
  },
}));

import { ProjectRuntime } from '@runtime/ProjectRuntime';

import { EnvFileLoader } from '@cli/utils/EnvFileLoader';

import { bootStandaloneService, configureStandaloneService, isNodeMain } from '@/start';

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
});
