import { DebuggerContext } from '../context';
import type { IDebuggerWatcher, IDebuggerWatcherConfig, ModelContent } from '../types';
import { EntryType } from '../types';

let _storage: IDebuggerWatcherConfig['storage'] | null = null;

const emit = (
  action: ModelContent['action'],
  model: string,
  id?: string | number,
  changes?: Record<string, unknown>
): void => {
  if (!_storage) return;
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
    return () => {
      _storage = null;
    };
  },
});
