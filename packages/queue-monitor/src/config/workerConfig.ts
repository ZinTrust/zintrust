import { Env } from '@zintrust/core';

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

  const host = Env.get('HOST', 'http://localhost:3000');
  return normalizeBaseUrl(withHttpScheme(host));
};

export const WorkerConfig = Object.freeze({
  getWorkerBaseUrl: resolveWorkerApiUrl,
});
