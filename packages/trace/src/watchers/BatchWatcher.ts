import { TraceContext } from '../context';
import type { BatchContent, ITraceWatcher, ITraceWatcherConfig } from '../types';
import { EntryType } from '../types';
import { RequestFilter } from '../utils/requestFilter';

let _storage: ITraceWatcherConfig['storage'] | null = null;
let _ignoreRoutes: string[] = [];
let _ignorePaths: string[] = [];

const emit = (
  name: string,
  total: number,
  processed: number,
  failed: number,
  status: BatchContent['status']
): void => {
  if (!_storage) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes, _ignorePaths)) return;
  const tags = [name];
  if (failed > 0) tags.push('failed');
  const content: BatchContent = {
    name,
    total,
    processed,
    failed,
    status,
    hostname: TraceContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: TraceContext.getBatchId(),
      type: EntryType.BATCH,
      content,
      tags,
      isLatest: true,
      createdAt: TraceContext.now(),
    })
    .catch(() => undefined);
};

export const BatchWatcher: ITraceWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: ITraceWatcherConfig): () => void {
    if (config.watchers.batch === false) return () => undefined;
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
