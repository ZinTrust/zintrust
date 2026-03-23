import { afterEach, describe, expect, it } from 'vitest';

import { ProjectRuntime } from '../../../src/runtime/ProjectRuntime';

describe('ProjectRuntime', () => {
  afterEach(() => {
    ProjectRuntime.clear();
  });

  it('merges active service context with later manifest state', () => {
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
});
