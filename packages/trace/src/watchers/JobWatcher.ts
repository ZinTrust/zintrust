/**
 * JobWatcher — records job dispatch, completion, and failure.
 * Subsystems must call JobWatcher.onDispatch / onProcess / onFail from
 * within their queue implementation for full tracking.
 */
import { TraceContext } from '../context';
import type { ITraceWatcher, ITraceWatcherConfig, JobContent } from '../types';
import { EntryType } from '../types';
import { RequestFilter } from '../utils/requestFilter';
import { parseStackFrameLine } from '../utils/stackFrame';

// Module-level storage ref so emit helpers can be called from outside.
let _storage: ITraceWatcherConfig['storage'] | null = null;
let _ignoreRoutes: string[] = [];
let _ignorePath: string[] = [];
const MAX_TRACKED_JOBS = 1000;

type PendingJob = { uuid: string; content: JobContent };

const pendingJobs = new Map<string, PendingJob[]>();

const trackPendingJob = (name: string, job: PendingJob): void => {
  const jobs = pendingJobs.get(name) ?? [];
  jobs.push(job);
  if (jobs.length > MAX_TRACKED_JOBS) {
    jobs.shift();
  }
  pendingJobs.set(name, jobs);
};

const takePendingJob = (name: string): PendingJob | null => {
  const jobs = pendingJobs.get(name);
  if (!jobs || jobs.length === 0) return null;

  const job = jobs.shift() ?? null;
  if (jobs.length === 0) {
    pendingJobs.delete(name);
  } else {
    pendingJobs.set(name, jobs);
  }

  return job;
};

const emitDispatch = (name: string, queue: string, connection: string, data?: unknown): void => {
  if (!_storage) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes, _ignorePath)) return;
  const uuid = crypto.randomUUID();
  const content: JobContent = {
    status: 'pending',
    connection,
    queue,
    name,
    data,
    hostname: TraceContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid,
      batchId: TraceContext.getBatchId(),
      type: EntryType.JOB,
      content,
      tags: [name],
      isLatest: true,
      createdAt: TraceContext.now(),
    })
    .catch(() => undefined);

  trackPendingJob(name, { uuid, content });
};

const emitProcessed = (name: string): void => {
  if (!_storage) return;
  const pendingJob = takePendingJob(name);
  if (pendingJob === null) return;

  const patch: JobContent = { ...pendingJob.content, status: 'processed' };
  void _storage.updateEntry(pendingJob.uuid, { content: patch }).catch(() => undefined);
};

const emitFailed = (name: string, error: Error): void => {
  if (!_storage) return;
  const pendingJob = takePendingJob(name);
  if (pendingJob === null) return;

  const patch: JobContent = {
    ...pendingJob.content,
    status: 'failed',
    exception: {
      message: error.message,
      trace: (error.stack ?? '')
        .split('\n')
        .slice(1)
        .map(parseStackFrameLine)
        .filter((trace): trace is { file: string; line: number } => trace !== null)
        .slice(0, 10),
    },
  };

  void _storage.updateEntry(pendingJob.uuid, { content: patch }).catch(() => undefined);
};

export const JobWatcher: ITraceWatcher & {
  onDispatch: typeof emitDispatch;
  onProcessed: typeof emitProcessed;
  onFailed: typeof emitFailed;
} = Object.freeze({
  onDispatch: emitDispatch,
  onProcessed: emitProcessed,
  onFailed: emitFailed,

  register({ storage, config }: ITraceWatcherConfig): () => void {
    if (config.watchers.job === false) return () => undefined;
    _storage = storage;
    _ignoreRoutes = config.ignoreRoutes;
    _ignorePath = config.ignorePath;
    return () => {
      _storage = null;
      _ignoreRoutes = [];
      _ignorePath = [];
      pendingJobs.clear();
    };
  },
});
