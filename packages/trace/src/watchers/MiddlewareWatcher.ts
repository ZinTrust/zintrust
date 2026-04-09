import { TraceContext } from '../context';
import type { ITraceWatcher, ITraceWatcherConfig, MiddlewareContent } from '../types';
import { EntryType } from '../types';
import { RequestFilter } from '../utils/requestFilter';

let _storage: ITraceWatcherConfig['storage'] | null = null;
let _ignoreRoutes: string[] = [];

const emit = (name: string, event: MiddlewareContent['event'], duration?: number): void => {
  if (!_storage) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes)) return;
  const content: MiddlewareContent = {
    name,
    event,
    duration,
    hostname: TraceContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: TraceContext.getBatchId(),
      type: EntryType.MIDDLEWARE,
      content,
      tags: [name, event],
      isLatest: true,
      createdAt: TraceContext.now(),
    })
    .catch(() => undefined);
};

export const MiddlewareWatcher: ITraceWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: ITraceWatcherConfig): () => void {
    if (config.watchers.middleware === false) return () => undefined;
    _storage = storage;
    _ignoreRoutes = config.ignoreRoutes;
    return () => {
      _storage = null;
      _ignoreRoutes = [];
    };
  },
});
