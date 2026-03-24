import { afterEach, describe, expect, it, vi } from 'vitest';

describe('ProjectRuntime', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('merges active service context with later manifest state', async () => {
    const { ProjectRuntime } = await import('../../../src/runtime/ProjectRuntime');
    ProjectRuntime.clear();

    ProjectRuntime.set({
      activeService: {
        id: 'ecommerce/users',
        domain: 'ecommerce',
        name: 'users',
        configRoot: 'src/services/ecommerce/users/config',
      },
    });

    ProjectRuntime.set({
      serviceManifest: [
        {
          id: 'ecommerce/users',
          domain: 'ecommerce',
          name: 'users',
          monolithEnabled: true,
        },
      ],
    });

    expect(ProjectRuntime.getActiveService()).toEqual({
      id: 'ecommerce/users',
      domain: 'ecommerce',
      name: 'users',
      configRoot: 'src/services/ecommerce/users/config',
    });
    expect(ProjectRuntime.getServiceManifest()).toHaveLength(1);
  });

  it('loads worker runtime metadata from zintrust.runtime.wg before falling back', async () => {
    vi.doMock('@/zintrust.runtime.wg', () => ({
      serviceManifest: [
        {
          id: 'ecommerce/users',
          domain: 'ecommerce',
          name: 'users',
          prefix: '/ecommerce/users',
          monolithEnabled: true,
        },
      ],
    }));

    const { ProjectRuntime } = await import('../../../src/runtime/ProjectRuntime');
    const loaded = await ProjectRuntime.tryLoadWorkerRuntime();

    expect(loaded?.serviceManifest).toHaveLength(1);
    expect(ProjectRuntime.getServiceManifest()).toEqual([
      {
        id: 'ecommerce/users',
        domain: 'ecommerce',
        name: 'users',
        prefix: '/ecommerce/users',
        loadEnv: true,
        monolithEnabled: true,
      },
    ]);
  });

  it('loads node runtime metadata even when active service was cached first', async () => {
    process.env['ZINTRUST_PROJECT_ROOT'] =
      '/opt/homebrew/var/www/Sites/zintrust/simulate/fresh-check';

    const { ProjectRuntime } = await import('../../../src/runtime/ProjectRuntime');
    ProjectRuntime.clear();
    ProjectRuntime.setActiveService({
      id: 'ecommerce/users',
      domain: 'ecommerce',
      name: 'users',
    });

    const loaded = await ProjectRuntime.tryLoadNodeRuntime();

    expect(loaded?.serviceManifest?.length).toBeGreaterThan(0);
    expect(ProjectRuntime.getActiveService()).toEqual({
      id: 'ecommerce/users',
      domain: 'ecommerce',
      name: 'users',
    });
  });
});
