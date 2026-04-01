/**
 * CacheWatcher — records cache operations.
 * Call CacheWatcher.emit() from within your cache driver instrumentation.
 */
import { DebuggerContext } from '../context';
import type { CacheContent, IDebuggerWatcher, IDebuggerWatcherConfig } from '../types';
import { EntryType } from '../types';
import { AuthTag } from '../utils/authTag';
import { redactString } from '../utils/redact';

let _storage: IDebuggerWatcherConfig['storage'] | null = null;
let _redactionFields: string[] = [];

const emit = (
  operation: CacheContent['operation'],
  key: string,
  duration: number,
  hit?: boolean
): void => {
  if (!_storage) return;
  const safeKey = redactString(key, _redactionFields);
  const content: CacheContent = {
    operation,
    key: safeKey,
    hit,
    duration,
    hostname: DebuggerContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: DebuggerContext.getBatchId(),
      type: EntryType.CACHE,
      content,
      tags: AuthTag.append([]),
      isLatest: true,
      createdAt: DebuggerContext.now(),
    })
    .catch(() => undefined);
};

export const CacheWatcher: IDebuggerWatcher & { emit: typeof emit } = Object.freeze({
  emit,

  register({ storage, config }: IDebuggerWatcherConfig): () => void {
    if (config.watchers.cache === false) return () => undefined;
    _storage = storage;
    _redactionFields = config.redaction.query;
    return () => {
      _storage = null;
    };
  },
});
