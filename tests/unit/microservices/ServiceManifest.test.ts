import {
  getDefaultServicePrefix,
  getServiceId,
  getServicePrefix,
  isCanonicalServiceId,
  normalizeActiveServiceRuntime,
  normalizeProjectRuntimeModule,
  normalizeServiceManifest,
  serviceMatchesAllowList,
} from '@/microservices/ServiceManifest';
import { describe, expect, it } from 'vitest';

describe('ServiceManifest', () => {
  it('builds canonical service ids', () => {
    expect(getServiceId('ecommerce', 'users')).toBe('ecommerce/users');
  });

  it('builds default monolith prefixes from canonical service ids', () => {
    expect(getDefaultServicePrefix('ecommerce', 'users')).toBe('/ecommerce/users');
    expect(getServicePrefix({ domain: 'ecommerce', name: 'users' })).toBe('/ecommerce/users');
  });

  it('recognizes canonical service ids', () => {
    expect(isCanonicalServiceId('ecommerce/users')).toBe(true);
    expect(isCanonicalServiceId('users')).toBe(false);
  });

  it('normalizes and filters manifest entries', () => {
    const manifest = normalizeServiceManifest([
      {
        id: 'ecommerce/users',
        domain: 'ecommerce',
        name: 'users',
        monolithEnabled: true,
        loadRoutes: async () => ({ registerRoutes: () => {} }),
      },
      {
        id: 'invalid',
        domain: 'bad',
        name: '',
      },
    ]);

    expect(manifest).toHaveLength(1);
    expect(manifest[0]?.id).toBe('ecommerce/users');
    expect(manifest[0]?.prefix).toBe('/ecommerce/users');
    expect(manifest[0]?.monolithEnabled).toBe(true);
  });

  it('preserves custom service prefixes after normalization', () => {
    const manifest = normalizeServiceManifest([
      {
        id: 'ecommerce/users',
        domain: 'ecommerce',
        name: 'users',
        prefix: 'gateway/users',
        loadRoutes: async () => ({ registerRoutes: () => {} }),
      },
    ]);

    expect(manifest[0]?.prefix).toBe('/gateway/users');
  });

  it('matches SERVICES allow-lists by canonical id or bare name', () => {
    expect(serviceMatchesAllowList('ecommerce/users', 'users', ['ecommerce/users'])).toBe(true);
    expect(serviceMatchesAllowList('ecommerce/users', 'users', ['users'])).toBe(true);
    expect(serviceMatchesAllowList('ecommerce/users', 'users', ['orders'])).toBe(false);
  });

  it('normalizes active service runtime metadata', () => {
    const activeService = normalizeActiveServiceRuntime({
      domain: 'ecommerce',
      name: 'users',
      configRoot: 'src/services/ecommerce/users/config',
    });

    expect(activeService).toEqual({
      id: 'ecommerce/users',
      domain: 'ecommerce',
      name: 'users',
      configRoot: 'src/services/ecommerce/users/config',
    });
  });

  it('normalizes project runtime modules without dropping optional fields', () => {
    const runtimeModule = normalizeProjectRuntimeModule({
      activeService: { domain: 'ecommerce', name: 'users' },
    });

    expect(runtimeModule.serviceManifest).toBeUndefined();
    expect(runtimeModule.activeService?.id).toBe('ecommerce/users');
  });
});
