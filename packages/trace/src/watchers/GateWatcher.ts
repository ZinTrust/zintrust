import { TraceContext } from '../context';
import type { GateContent, ITraceWatcher, ITraceWatcherConfig } from '../types';
import { EntryType } from '../types';
import { RequestFilter } from '../utils/requestFilter';

let _storage: ITraceWatcherConfig['storage'] | null = null;
let _ignoreRoutes: string[] = [];
let _ignorePath: string[] = [];

const emit = (
  ability: string,
  result: GateContent['result'],
  userId?: string,
  subject?: string
): void => {
  if (!_storage) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes, _ignorePath)) return;
  const tags: string[] = [ability, result];
  if (userId) tags.push(`Auth:${userId}`);
  const content: GateContent = {
    ability,
    result,
    userId,
    subject,
    hostname: TraceContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: TraceContext.getBatchId(),
      type: EntryType.GATE,
      content,
      tags,
      isLatest: true,
      createdAt: TraceContext.now(),
    })
    .catch(() => undefined);
};

export const GateWatcher: ITraceWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: ITraceWatcherConfig): () => void {
    if (config.watchers.gate === false) return () => undefined;
    _storage = storage;
    _ignoreRoutes = config.ignoreRoutes;
    _ignorePath = config.ignorePath;
    return () => {
      _storage = null;
      _ignoreRoutes = [];
      _ignorePath = [];
    };
  },
});
