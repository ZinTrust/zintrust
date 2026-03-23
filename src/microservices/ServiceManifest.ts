import { isArray, isFunction, isNonEmptyString, isObject } from '@helper/index';
import type { RoutesModule } from '@registry/type';

export interface ServiceManifestEntry {
  id: string;
  domain: string;
  name: string;
  prefix?: string;
  configRoot?: string;
  version?: string;
  description?: string;
  port?: number;
  healthCheck?: string;
  monolithEnabled?: boolean;
  loadRoutes?: () => Promise<RoutesModule>;
}

export interface ActiveServiceRuntime {
  id: string;
  domain: string;
  name: string;
  configRoot?: string;
}

export interface ProjectRuntimeModule {
  serviceManifest?: ReadonlyArray<ServiceManifestEntry>;
  activeService?: ActiveServiceRuntime;
}

export const getServiceId = (domain: string, name: string): string => `${domain}/${name}`;

export const getDefaultServicePrefix = (domain: string, name: string): string =>
  `/${getServiceId(domain, name)}`;

const normalizeServicePrefix = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '/') return '/';

  const segments = trimmed
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) return '/';
  return `/${segments.join('/')}`;
};

export const getServicePrefix = (args: {
  prefix?: unknown;
  domain?: unknown;
  name?: unknown;
}): string => {
  if (typeof args.prefix === 'string') return normalizeServicePrefix(args.prefix);

  const domain = isNonEmptyString(args.domain) ? args.domain : 'default';
  const name = isNonEmptyString(args.name) ? args.name : 'unknown';
  return getDefaultServicePrefix(domain, name);
};

export const isCanonicalServiceId = (value: unknown): value is string => {
  if (!isNonEmptyString(value)) return false;
  const segments = value.split('/');
  return segments.length === 2 && segments.every((segment) => segment.trim().length > 0);
};

export const toCanonicalServiceId = (args: {
  id?: unknown;
  domain?: unknown;
  name?: unknown;
}): string => {
  if (isCanonicalServiceId(args.id)) return args.id;
  const domain = isNonEmptyString(args.domain) ? args.domain : 'default';
  const name = isNonEmptyString(args.name) ? args.name : 'unknown';
  return getServiceId(domain, name);
};

export const isServiceManifestEntry = (value: unknown): value is ServiceManifestEntry => {
  if (!isObject(value)) return false;
  if (!isCanonicalServiceId(value['id'])) return false;
  if (!isNonEmptyString(value['domain'])) return false;
  if (!isNonEmptyString(value['name'])) return false;

  const prefix = value['prefix'];
  if (prefix !== undefined && typeof prefix !== 'string') {
    return false;
  }

  const configRoot = value['configRoot'];
  if (configRoot !== undefined && typeof configRoot !== 'string') {
    return false;
  }

  const loadRoutes = value['loadRoutes'];
  if (loadRoutes !== undefined && !isFunction(loadRoutes)) {
    return false;
  }

  return true;
};

export const normalizeServiceManifest = (value: unknown): ReadonlyArray<ServiceManifestEntry> => {
  if (!isArray(value)) return [];

  return value.filter(isServiceManifestEntry).map((entry) => ({
    ...entry,
    id: toCanonicalServiceId(entry),
    prefix: getServicePrefix(entry),
    ...(isNonEmptyString(entry.configRoot) ? { configRoot: entry.configRoot } : {}),
    monolithEnabled: entry.monolithEnabled !== false,
  }));
};

export const normalizeActiveServiceRuntime = (value: unknown): ActiveServiceRuntime | undefined => {
  if (!isObject(value)) return undefined;
  if (!isNonEmptyString(value['domain'])) return undefined;
  if (!isNonEmptyString(value['name'])) return undefined;

  const configRoot = isNonEmptyString(value['configRoot']) ? value['configRoot'] : undefined;

  return Object.freeze({
    id: toCanonicalServiceId(value),
    domain: value['domain'],
    name: value['name'],
    ...(configRoot === undefined ? {} : { configRoot }),
  });
};

export const normalizeProjectRuntimeModule = (value: unknown): ProjectRuntimeModule => {
  if (!isObject(value)) {
    return Object.freeze({});
  }

  return Object.freeze({
    ...(Object.hasOwn(value, 'serviceManifest')
      ? { serviceManifest: normalizeServiceManifest(value['serviceManifest']) }
      : {}),
    ...(Object.hasOwn(value, 'activeService')
      ? { activeService: normalizeActiveServiceRuntime(value['activeService']) }
      : {}),
  });
};

export const serviceMatchesAllowList = (
  serviceId: string,
  serviceName: string,
  allowList: ReadonlyArray<string>
): boolean => {
  if (allowList.length === 0) return true;
  return allowList.includes(serviceId) || allowList.includes(serviceName);
};

export default Object.freeze({
  getServiceId,
  getDefaultServicePrefix,
  getServicePrefix,
  isCanonicalServiceId,
  toCanonicalServiceId,
  isServiceManifestEntry,
  normalizeServiceManifest,
  normalizeActiveServiceRuntime,
  normalizeProjectRuntimeModule,
  serviceMatchesAllowList,
});
