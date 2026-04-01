/**
 * ScheduleWatcher — records scheduled task runs and outcomes.
 */
import { DebuggerContext } from '../context';
import type { IDebuggerWatcher, IDebuggerWatcherConfig, ScheduleContent } from '../types';
import { EntryType } from '../types';
import { RequestFilter } from '../utils/requestFilter';

let _storage: IDebuggerWatcherConfig['storage'] | null = null;
let _ignoreRoutes: string[] = [];

const emit = (
  name: string,
  expression: string,
  status: ScheduleContent['status'],
  duration: number,
  output?: string
): void => {
  if (!_storage) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes)) return;
  const content: ScheduleContent = {
    name,
    expression,
    status,
    duration,
    output,
    hostname: DebuggerContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: DebuggerContext.getBatchId(),
      type: EntryType.SCHEDULE,
      content,
      tags: status === 'failed' ? ['failed'] : [],
      isLatest: true,
      createdAt: DebuggerContext.now(),
    })
    .catch(() => undefined);
};

export const ScheduleWatcher: IDebuggerWatcher & { emit: typeof emit } = Object.freeze({
  emit,

  register({ storage, config }: IDebuggerWatcherConfig): () => void {
    if (config.watchers.schedule === false) return () => undefined;
    _storage = storage;
    _ignoreRoutes = config.ignoreRoutes;
    return () => {
      _storage = null;
      _ignoreRoutes = [];
    };
  },
});
