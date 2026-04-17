/**
 * ScheduleWatcher — records scheduled task runs and outcomes.
 */
import { TraceContext } from '../context';
import type { ITraceWatcher, ITraceWatcherConfig, ScheduleContent } from '../types';
import { EntryType } from '../types';
import { RequestFilter } from '../utils/requestFilter';

let _storage: ITraceWatcherConfig['storage'] | null = null;
let _ignoreRoutes: string[] = [];
let _ignorePaths: string[] = [];

const emit = (
  name: string,
  expression: string,
  status: ScheduleContent['status'],
  duration: number,
  output?: string
): void => {
  if (!_storage) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes, _ignorePaths)) return;
  const content: ScheduleContent = {
    name,
    expression,
    status,
    duration,
    output,
    hostname: TraceContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: TraceContext.getBatchId(),
      type: EntryType.SCHEDULE,
      content,
      tags: status === 'failed' ? ['failed'] : [],
      isLatest: true,
      createdAt: TraceContext.now(),
    })
    .catch(() => undefined);
};

export const ScheduleWatcher: ITraceWatcher & { emit: typeof emit } = Object.freeze({
  emit,

  register({ storage, config }: ITraceWatcherConfig): () => void {
    if (config.watchers.schedule === false) return () => undefined;
    _storage = storage;
    _ignoreRoutes = config.ignoreRoutes;
    _ignorePaths = config.ignorePaths;
    return () => {
      _storage = null;
      _ignoreRoutes = [];
      _ignorePaths = [];
    };
  },
});
