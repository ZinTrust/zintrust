import {
  getServicePrefix,
  isCanonicalServiceId,
  isServiceManifestEntry,
  normalizeActiveServiceRuntime,
  normalizeProjectRuntimeModule,
  normalizeServiceManifest,
  serviceMatchesAllowList,
  toCanonicalServiceId,
} from '@microservices/ServiceManifest';
import { describe, expect, it } from 'vitest';

describe('ServiceManifest remaining branches', () => {
  describe('getServicePrefix / toCanonicalServiceId fallbacks', () => {
    it('normalizes empty, slash-only, and multi-slash prefixes', () => {
      expect(getServicePrefix({ prefix: '' })).toBe('/');
      expect(getServicePrefix({ prefix: '   ' })).toBe('/');
      expect(getServicePrefix({ prefix: '/' })).toBe('/');
      expect(getServicePrefix({ prefix: '///' })).toBe('/');
      expect(getServicePrefix({ prefix: ' / alpha // beta / ' })).toBe('/alpha/beta');
    });

    it('falls back to default domain/name when they are not non-empty strings', () => {
      expect(getServicePrefix({ prefix: 42, domain: '', name: '  ' })).toBe('/default/unknown');
      expect(getServicePrefix({ prefix: null, domain: 'shop', name: 1 })).toBe('/shop/unknown');
      expect(toCanonicalServiceId({ id: '', domain: 'shop', name: null })).toBe('shop/unknown');
      expect(toCanonicalServiceId({ id: 'a/b/c', domain: null, name: '' })).toBe(
        'default/unknown'
      );
      expect(toCanonicalServiceId({ id: 'shop/users' })).toBe('shop/users');
    });
  });

  describe('isCanonicalServiceId', () => {
    it('rejects non-strings, wrong segment counts and blank segments', () => {
      expect(isCanonicalServiceId(undefined)).toBe(false);
      expect(isCanonicalServiceId('')).toBe(false);
      expect(isCanonicalServiceId('a')).toBe(false);
      expect(isCanonicalServiceId('a/b/c')).toBe(false);
      expect(isCanonicalServiceId('a/ /c')).toBe(false);
      expect(isCanonicalServiceId('a/b')).toBe(true);
    });
  });

  describe('isServiceManifestEntry', () => {
    const valid = {
      id: 'shop/users',
      domain: 'shop',
      name: 'users',
    };

    it('rejects non-objects and entries with missing identity fields', () => {
      expect(isServiceManifestEntry(null)).toBe(false);
      expect(isServiceManifestEntry('shop/users')).toBe(false);
      expect(isServiceManifestEntry({ ...valid, id: 'users' })).toBe(false);
      expect(isServiceManifestEntry({ ...valid, domain: '' })).toBe(false);
      expect(isServiceManifestEntry({ ...valid, name: 7 })).toBe(false);
    });

    it('rejects optional fields of the wrong type', () => {
      expect(isServiceManifestEntry({ ...valid, prefix: 1 })).toBe(false);
      expect(isServiceManifestEntry({ ...valid, configRoot: false })).toBe(false);
      expect(isServiceManifestEntry({ ...valid, loadEnv: 'yes' })).toBe(false);
      expect(isServiceManifestEntry({ ...valid, loadRoutes: {} })).toBe(false);
      expect(isServiceManifestEntry({ ...valid, prefix: '/api', loadRoutes: async () => ({}) })).toBe(
        true
      );
    });
  });

  describe('normalizeServiceManifest', () => {
    it('returns an empty list for non-arrays and drops invalid entries', () => {
      expect(normalizeServiceManifest(undefined)).toEqual([]);
      expect(normalizeServiceManifest({})).toEqual([]);
      expect(normalizeServiceManifest([null, 'x', { id: 'invalid' }])).toEqual([]);
    });

    it('uses default canonical id/prefix when no explicit prefix is supplied', () => {
      const [entry] = normalizeServiceManifest([
        { id: 'shop/users', domain: 'shop', name: 'users', configRoot: '   ' },
      ]);

      expect(entry).toMatchObject({
        id: 'shop/users',
        domain: 'shop',
        name: 'users',
        prefix: '/shop/users',
        loadEnv: true,
        monolithEnabled: true,
      });
      expect(entry?.configRoot).toBe('   ');
    });

    it('keeps a valid configRoot and honors explicit false flags', () => {
      const [entry] = normalizeServiceManifest([
        {
          id: 'shop/users',
          domain: 'shop',
          name: 'users',
          configRoot: 'src/services/shop/users',
          loadEnv: false,
          monolithEnabled: false,
        },
      ]);

      expect(entry?.configRoot).toBe('src/services/shop/users');
      expect(entry?.loadEnv).toBe(false);
      expect(entry?.monolithEnabled).toBe(false);
    });
  });

  describe('normalizeActiveServiceRuntime', () => {
    it('returns undefined for non-objects and invalid identity fields', () => {
      expect(normalizeActiveServiceRuntime(null)).toBeUndefined();
      expect(normalizeActiveServiceRuntime([])).toBeUndefined();
      expect(normalizeActiveServiceRuntime({ domain: '', name: 'users' })).toBeUndefined();
      expect(normalizeActiveServiceRuntime({ domain: 'shop', name: '' })).toBeUndefined();
      expect(normalizeActiveServiceRuntime({ domain: 'shop', name: 'users' })).toEqual({
        id: 'shop/users',
        domain: 'shop',
        name: 'users',
      });
    });

    it('omits configRoot when it is not a non-empty string', () => {
      expect(
        normalizeActiveServiceRuntime({ domain: 'shop', name: 'users', configRoot: 5 })
      ).not.toHaveProperty('configRoot');
    });
  });

  describe('normalizeProjectRuntimeModule', () => {
    it('returns a frozen empty object for non-objects', () => {
      const result = normalizeProjectRuntimeModule(undefined);
      expect(result).toEqual({});
      expect(Object.isFrozen(result)).toBe(true);
    });

    it('only normalizes own properties that are present', () => {
      const module = normalizeProjectRuntimeModule({
        serviceManifest: 'not-an-array',
        unrelated: true,
      });
      expect(module.serviceManifest).toEqual([]);
      expect(module).not.toHaveProperty('activeService');
      expect(module).not.toHaveProperty('unrelated');

      const withActive = normalizeProjectRuntimeModule({
        activeService: null,
      });
      expect(withActive.activeService).toBeUndefined();
      expect(withActive).not.toHaveProperty('serviceManifest');
    });

    it('normalizes both fields together', () => {
      const module = normalizeProjectRuntimeModule({
        serviceManifest: [{ id: 'shop/users', domain: 'shop', name: 'users' }],
        activeService: { id: 'ignored', domain: 'shop', name: 'users' },
      });
      expect(module.serviceManifest).toHaveLength(1);
      expect(module.activeService?.id).toBe('shop/users');
    });
  });

  it('matches allow lists by id and by name, and returns true for an empty list', () => {
    expect(serviceMatchesAllowList('shop/users', 'users', [])).toBe(true);
    expect(serviceMatchesAllowList('shop/users', 'users', ['shop/users'])).toBe(true);
    expect(serviceMatchesAllowList('shop/users', 'users', ['users'])).toBe(true);
    expect(serviceMatchesAllowList('shop/users', 'users', ['orders'])).toBe(false);
  });
});
