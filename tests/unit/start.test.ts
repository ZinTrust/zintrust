import { afterEach, describe, expect, it } from 'vitest';

import { ProjectRuntime } from '@runtime/ProjectRuntime';

import { bootStandaloneService, configureStandaloneService, isNodeMain } from '@/start';

describe('start helpers', () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
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
    expect(ProjectRuntime.getActiveService()).toEqual(runtime);
  });
});
