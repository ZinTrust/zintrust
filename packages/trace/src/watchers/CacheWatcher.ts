/**
 * CacheWatcher — records cache operations.
 * Call CacheWatcher.emit() from within your cache driver instrumentation.
 */
import { TraceContext } from '../context';
import type { CacheContent, ITraceWatcher, ITraceWatcherConfig } from '../types';
import { EntryType } from '../types';
import { AuthTag } from '../utils/authTag';
import { redactString } from '../utils/redact';
import { RequestFilter } from '../utils/requestFilter';

let _storage: ITraceWatcherConfig['storage'] | null = null;
let _redactionFields: string[] = [];
let _ignoreRoutes: string[] = [];

const emit = (
  operation: CacheContent['operation'],
  key: string,
  duration: number,
  hit?: boolean
): void => {
  if (!_storage) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes)) return;
  const safeKey = redactString(key, _redactionFields);
  const content: CacheContent = {
    operation,
    key: safeKey,
    hit,
    duration,
    hostname: TraceContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: TraceContext.getBatchId(),
      type: EntryType.CACHE,
      content,
      tags: AuthTag.append([]),
      isLatest: true,
      createdAt: TraceContext.now(),
    })
    .catch(() => undefined);
};

export const CacheWatcher: ITraceWatcher & { emit: typeof emit } = Object.freeze({
  emit,

  register({ storage, config }: ITraceWatcherConfig): () => void {
    if (config.watchers.cache === false) return () => undefined;
    _storage = storage;
    _redactionFields = config.redaction.query;
    _ignoreRoutes = config.ignoreRoutes;
    return () => {
      _storage = null;
      _ignoreRoutes = [];
    };
  },
});
