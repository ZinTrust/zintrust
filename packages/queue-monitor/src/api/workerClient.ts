import { ErrorFactory, Logger } from '@zintrust/core';
import { WorkerConfig } from '../config/workerConfig';

type WorkerApiResponse<T> = { ok: boolean; error?: string } & T;

type WorkerStatusPayload = {
  status: unknown;
};

type WorkerHealthPayload = {
  health: unknown;
};

type WorkerListPayload = {
  workers: string[];
};

type WorkerInfoPayload = {
  worker: unknown;
};

const requestJson = async <T>(
  path: string,
  options: RequestInit = {}
): Promise<WorkerApiResponse<T>> => {
  const baseUrl = WorkerConfig.getWorkerBaseUrl();
  const url = `${baseUrl}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    Logger.error('Worker API request failed', { url, status: response.status });
    throw ErrorFactory.createWorkerError(`Worker API request failed (${response.status})`);
  }

  return (await response.json()) as WorkerApiResponse<T>;
};

export const WorkerClient = Object.freeze({
  async listWorkers(): Promise<string[]> {
    const response = await requestJson<WorkerListPayload>('/api/workers');
    return response.workers ?? [];
  },

  async getWorker(name: string): Promise<unknown> {
    const response = await requestJson<WorkerInfoPayload>(`/api/workers/${name}`);
    return response.worker;
  },

  async getStatus(name: string): Promise<unknown> {
    const response = await requestJson<WorkerStatusPayload>(`/api/workers/${name}/status`);
    return response.status;
  },

  async getHealth(name: string): Promise<unknown> {
    const response = await requestJson<WorkerHealthPayload>(`/api/workers/${name}/health`);
    return response.health;
  },

  async startWorker(name: string): Promise<WorkerApiResponse<{ message?: string }>> {
    return requestJson<{ message?: string }>(`/api/workers/${name}/start`, { method: 'POST' });
  },

  async stopWorker(name: string): Promise<WorkerApiResponse<{ message?: string }>> {
    return requestJson<{ message?: string }>(`/api/workers/${name}/stop`, { method: 'POST' });
  },

  async restartWorker(name: string): Promise<WorkerApiResponse<{ message?: string }>> {
    return requestJson<{ message?: string }>(`/api/workers/${name}/restart`, { method: 'POST' });
  },
});
