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

export const keyPrefix = (): string => {
  const redisKeyPrefix = (Env.get('WORKER_PERSISTENCE_REDIS_KEY_PREFIX', '') ?? '').trim();

  return redisKeyPrefix
    ? `${redisKeyPrefix}_worker_${appConfig.prefix}`
    : `worker_${appConfig.prefix}`;
};
