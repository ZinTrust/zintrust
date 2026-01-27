import type { WorkersDashboardUiOptions } from './types';
import { getWorkersDashboardHTML } from './workers-dashboard';

export type {
  GetWorkersQuery,
  WorkerData,
  WorkersDashboardUiOptions,
  WorkersListResponse,
} from './types';
export { getWorkersDashboardHTML } from './workers-dashboard';

export function createWorkersDashboard(options: Partial<WorkersDashboardUiOptions> = {}): {
  html: string;
  options: WorkersDashboardUiOptions;
} {
  const defaultOptions: WorkersDashboardUiOptions = {
    autoRefresh: true,
    refreshIntervalMs: 30000,
    pageSize: 100,
    enableAutoStart: true,
    ...options,
  };

  return {
    html: getWorkersDashboardHTML(defaultOptions),
    options: defaultOptions,
  };
}

export default {
  createWorkersDashboard,
};
