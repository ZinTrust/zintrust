/**
 * AuthWatcher — records login/logout/failed auth events.
 * Credentials are never stored; only the outcome.
 */
import { TraceContext } from '../context';
import type { AuthContent, ITraceWatcher, ITraceWatcherConfig } from '../types';
import { EntryType } from '../types';
import { RequestFilter } from '../utils/requestFilter';

let _storage: ITraceWatcherConfig['storage'] | null = null;
let _ignoreRoutes: string[] = [];

const emit = (event: AuthContent['event'], userId?: string): void => {
  if (!_storage) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes)) return;
  const content: AuthContent = {
    event,
    userId,
    hostname: TraceContext.getHostname(),
  };
  const tags: string[] = [];
  if (userId) tags.push(`Auth:${userId}`);
  if (event === 'failed') tags.push('failed');

  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: TraceContext.getBatchId(),
      type: EntryType.AUTH,
      content,
      tags,
      isLatest: true,
      createdAt: TraceContext.now(),
    })
    .catch(() => undefined);
};

export const AuthWatcher: ITraceWatcher & { emit: typeof emit } = Object.freeze({
  emit,

  register({ storage, config }: ITraceWatcherConfig): () => void {
    if (config.watchers.auth === false) return () => undefined;
    _storage = storage;
    _ignoreRoutes = config.ignoreRoutes;
    return () => {
      _storage = null;
      _ignoreRoutes = [];
    };
  },
});
