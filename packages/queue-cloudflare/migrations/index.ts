export type { Migration } from './20260608000001_create_cloudflare_queue_jobs_table';

import { migration as createJobs } from './20260608000001_create_cloudflare_queue_jobs_table';
import { migration as createEvents } from './20260608000002_create_cloudflare_queue_job_events_table';
import { migration as createLogs } from './20260608000003_create_cloudflare_queue_job_logs_table';
import { migration as createRepeatables } from './20260608000004_create_cloudflare_queue_repeatables_table';
import { migration as createFlowDependencies } from './20260608000005_create_cloudflare_queue_flow_dependencies_table';

export const migrations = [
  createJobs,
  createEvents,
  createLogs,
  createRepeatables,
  createFlowDependencies,
];
