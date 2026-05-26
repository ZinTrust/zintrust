import { appConfig, Env } from '@zintrust/core/config';

const normalizeBaseUrl = (value: string): string => {
  let end = value.length;
  while (end > 0 && value.charAt(end - 1) === '/') {
    end--;
  }
  return value.slice(0, end);
};

const withHttpScheme = (value: string): string =>
  value.startsWith('http://') || value.startsWith('https://') ? value : `http://${value}`;

const resolveWorkerApiUrl = (): string => {
  const workerApiUrl = Env.get('WORKER_API_URL');
  if (workerApiUrl) {
    return normalizeBaseUrl(withHttpScheme(workerApiUrl));
  }

  return '';
};

export const WorkerConfig = Object.freeze({
  getWorkerBaseUrl: resolveWorkerApiUrl,
});

const LEGACY_REDIS_WORKER_PREFIX = 'zintrust:workers:';

const trimBoundaryUnderscores = (value: string): string => {
  let start = 0;
  let end = value.length;

  while (start < end && value.charAt(start) === '_') {
    start += 1;
  }

  while (end > start && value.charAt(end - 1) === '_') {
    end -= 1;
  }

  return value.slice(start, end);
};

const normalizeAppName = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  const collapsedWhitespace = trimmed.replaceAll(/\s+/g, '_');
  const sanitized = collapsedWhitespace.replaceAll(/[^a-z0-9_:-]/g, '_');
  const collapsedUnderscores = sanitized.replaceAll(/_+/g, '_');
  const normalized = trimBoundaryUnderscores(collapsedUnderscores);
  return normalized === '' ? 'zintrust' : normalized;
};

const trimBoundaryColons = (value: string): string => {
  let start = 0;
  let end = value.length;

  while (start < end && value.charAt(start) === ':') {
    start += 1;
  }

  while (end > start && value.charAt(end - 1) === ':') {
    end -= 1;
  }

  return value.slice(start, end);
};

const defaultKeyPrefix = (): string => {
  const appName =
    typeof appConfig.name === 'string' && appConfig.name.trim() !== ''
      ? appConfig.name
      : Env.get('APP_NAME', 'zintrust');

  return `${normalizeAppName(appName)}_zintrust:workers:`;
};

const isLegacyWorkerPrefix = (value: string): boolean => {
  if (value === LEGACY_REDIS_WORKER_PREFIX) return true;
  if (value.startsWith('worker_')) return true;
  return value.includes(':workers:_worker_');
};

const normalizeConfiguredKeyPrefix = (value: string | undefined | null): string | undefined => {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (trimmed === '') return undefined;

  if (isLegacyWorkerPrefix(trimmed)) {
    return defaultKeyPrefix();
  }

  return trimmed;
};

const appendPrefixSegment = (base: string, segment: string): string => {
  const normalizedSegment = trimBoundaryColons(segment.trim());
  if (normalizedSegment === '') return base;

  const normalizedBase = trimBoundaryColons(base);
  if (normalizedBase === '') {
    return `${normalizedSegment}:`;
  }

  return `${normalizedBase}:${normalizedSegment}:`;
};

export const resolveWorkerKeyPrefix = (value?: string | null): string => {
  return (
    normalizeConfiguredKeyPrefix(value) ??
    normalizeConfiguredKeyPrefix(Env.get('WORKER_PERSISTENCE_REDIS_KEY_PREFIX', '')) ??
    defaultKeyPrefix()
  );
};

export const keyPrefix = (): string => {
  return resolveWorkerKeyPrefix();
};

export const keyPrefixFor = (...segments: string[]): string => {
  return segments.reduce((prefix, segment) => appendPrefixSegment(prefix, segment), keyPrefix());
};
