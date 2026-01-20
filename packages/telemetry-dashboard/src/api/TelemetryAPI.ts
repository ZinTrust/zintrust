import { ErrorFactory, Logger, Env } from '@zintrust/core';

type ApiResponse<T> = { ok: boolean; error?: string } & T;

const normalizeBaseUrl = (value: string): string => {
  let normalized = value;
  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
};

const withHttpScheme = (value: string): string =>
  value.startsWith('http://') || value.startsWith('https://') ? value : `http://${value}`;

const getWorkerBaseUrl = (): string => {
  const workerApiUrl = Env.get('WORKER_API_URL');
  if (workerApiUrl) {
    return normalizeBaseUrl(withHttpScheme(workerApiUrl));
  }

  const host = Env.get('HOST', 'http://localhost:3000');
  return normalizeBaseUrl(withHttpScheme(host));
};

const requestJson = async <T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> => {
  const url = `${getWorkerBaseUrl()}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: options.headers
      ? { 'Content-Type': 'application/json', ...options.headers }
      : { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    Logger.error('Telemetry API request failed', { url, status: response.status });
    throw ErrorFactory.createWorkerError(`Telemetry API request failed (${response.status})`);
  }

  return (await response.json()) as ApiResponse<T>;
};

export const TelemetryAPI = Object.freeze({
  async getSystemSummary(): Promise<ApiResponse<{ summary: unknown }>> {
    return requestJson<{ summary: unknown }>('/api/workers/system/summary');
  },

  async getMonitoringSummary(): Promise<ApiResponse<{ summary: unknown }>> {
    return requestJson<{ summary: unknown }>('/api/workers/system/monitoring/summary');
  },

  async getResourceCurrent(): Promise<ApiResponse<{ usage: unknown }>> {
    return requestJson<{ usage: unknown }>('/api/resources/current');
  },

  async getResourceTrends(): Promise<ApiResponse<{ trends: unknown }>> {
    return requestJson<{ trends: unknown }>('/api/resources/trends');
  },
});
