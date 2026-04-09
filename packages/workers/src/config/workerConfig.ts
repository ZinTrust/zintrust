import { Env, appConfig } from '@zintrust/core';

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

const normalizeAppName = (value: string): string => {
  const trimmed = value.trim().toLowerCase();
  const collapsedWhitespace = trimmed.replaceAll(/\s+/g, '_');
  const sanitized = collapsedWhitespace.replaceAll(/[^a-z0-9_:-]/g, '_');
  const collapsedUnderscores = sanitized.replaceAll(/_+/g, '_');
  const normalized = collapsedUnderscores.replaceAll(/^_+|_+$/g, '');
  return normalized === '' ? 'zintrust' : normalized;
};

export const keyPrefix = (): string => {
  const redisKeyPrefix = (Env.get('WORKER_PERSISTENCE_REDIS_KEY_PREFIX', '') ?? '').trim();

  if (redisKeyPrefix !== '') {
    return redisKeyPrefix;
  }

  const appName =
    typeof appConfig.name === 'string' && appConfig.name.trim() !== ''
      ? appConfig.name
      : Env.get('APP_NAME', 'zintrust');

  return `${normalizeAppName(appName)}_zintrust:workers:`;
};
