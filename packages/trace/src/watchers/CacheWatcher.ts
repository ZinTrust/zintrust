/**
 * CacheWatcher — records cache operations.
 * Call CacheWatcher.emit() from within your cache driver instrumentation.
 */
import { TraceContext } from '../context';
import type { CacheContent, ITraceWatcher, ITraceWatcherConfig } from '../types';
import { EntryType } from '../types';
import { AuthTag } from '../utils/authTag';
import { redactString, redactUnknown } from '../utils/redact';
import { RequestFilter } from '../utils/requestFilter';

let _storage: ITraceWatcherConfig['storage'] | null = null;
let _config: ITraceWatcherConfig['config'] | null = null;
let _redactionFields: string[] = [];
let _ignoreRoutes: string[] = [];
let _ignorePaths: string[] = [];

const emit = (
  operation: CacheContent['operation'],
  key: string,
  duration: number,
  hit?: boolean,
  payload?: unknown,
  store?: string,
  ttl?: number
): void => {
  if (!_storage) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes, _ignorePaths)) return;
  const safeKey = redactString(key, _redactionFields);
  const shouldLogPayload = _config?.captureCachePayloads === true;
  const content: CacheContent = {
    operation,
    key: safeKey,
    hit,
    ...(typeof store === 'string' && store !== '' ? { store } : {}),
    ...(typeof ttl === 'number' ? { ttl } : {}),
    payloadLogged: shouldLogPayload,
    ...(shouldLogPayload ? { payload: redactUnknown(payload, _redactionFields) } : {}),
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
    _config = config;
    _redactionFields = config.redaction.query;
    _ignoreRoutes = config.ignoreRoutes;
    _ignorePaths = config.ignorePaths;
    return () => {
      _storage = null;
      _config = null;
      _ignoreRoutes = [];
      _ignorePaths = [];
    };
  },
});
