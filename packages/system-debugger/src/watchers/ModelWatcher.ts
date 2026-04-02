import { DebuggerContext } from '../context';
import type { IDebuggerWatcher, IDebuggerWatcherConfig, ModelContent } from '../types';
import { EntryType } from '../types';
import { RequestFilter } from '../utils/requestFilter';

let _storage: IDebuggerWatcherConfig['storage'] | null = null;
let _ignoreRoutes: string[] = [];

const emit = (
  action: ModelContent['action'],
  model: string,
  id?: string | number,
  changes?: Record<string, unknown>
): void => {
  if (!_storage) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes)) return;
  const content: ModelContent = {
    action,
    model,
    id,
    changes,
    hostname: DebuggerContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: DebuggerContext.getBatchId(),
      type: EntryType.MODEL,
      content,
      tags: [model],
      isLatest: true,
      createdAt: DebuggerContext.now(),
    })
    .catch(() => undefined);
};

export const ModelWatcher: IDebuggerWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: IDebuggerWatcherConfig): () => void {
    if (config.watchers.model === false) return () => undefined;
    _storage = storage;
    _ignoreRoutes = config.ignoreRoutes;
    return () => {
      _storage = null;
      _ignoreRoutes = [];
    };
  },
});
