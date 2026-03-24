import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('WorkerAdapterImports', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('seeds ProjectRuntime from the project worker runtime before loading worker plugins', async () => {
    const set = vi.fn();

    vi.doMock('@runtime/ProjectRuntime', () => ({
      ProjectRuntime: {
        set,
      },
    }));

    vi.doMock('@/zintrust.runtime.wg', () => ({
      serviceManifest: [
        {
          id: 'ecommerce/users',
          domain: 'ecommerce',
          name: 'users',
          monolithEnabled: true,
        },
      ],
    }));

    const pluginImport = vi.fn(async () => undefined);
    vi.doMock('@/zintrust.plugins.wg', () => {
      pluginImport();
      return {};
    });

    const mod = await import('../../../src/runtime/WorkerAdapterImports');

    await mod.WorkerAdapterImports.ready;

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceManifest: expect.arrayContaining([
          expect.objectContaining({ id: 'ecommerce/users' }),
        ]),
      })
    );
    expect(pluginImport).toHaveBeenCalledTimes(1);
  });

  it('falls back to the generic project runtime module when the worker-specific runtime is unavailable', async () => {
    const set = vi.fn();

    vi.doMock('@runtime/ProjectRuntime', () => ({
      ProjectRuntime: {
        set,
      },
    }));

    vi.doMock('@/zintrust.runtime.wg', () => {
      throw new Error('missing worker runtime');
    });
    vi.doMock('@/zintrust.runtime', () => ({
      serviceManifest: [
        {
          id: 'ecommerce/catalog',
          domain: 'ecommerce',
          name: 'catalog',
          monolithEnabled: true,
        },
      ],
    }));
    vi.doMock('@/zintrust.plugins.wg', () => ({}));

    const mod = await import('../../../src/runtime/WorkerAdapterImports');

    await mod.WorkerAdapterImports.ready;

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceManifest: expect.arrayContaining([
          expect.objectContaining({ id: 'ecommerce/catalog' }),
        ]),
      })
    );
  });
});
