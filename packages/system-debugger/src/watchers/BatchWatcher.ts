import { DebuggerContext } from '../context';
import type { BatchContent, IDebuggerWatcher, IDebuggerWatcherConfig } from '../types';
import { EntryType } from '../types';

let _storage: IDebuggerWatcherConfig['storage'] | null = null;

const emit = (
  name: string,
  total: number,
  processed: number,
  failed: number,
  status: BatchContent['status']
): void => {
  if (!_storage) return;
  const tags = [name];
  if (failed > 0) tags.push('failed');
  const content: BatchContent = {
    name,
    total,
    processed,
    failed,
    status,
    hostname: DebuggerContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: DebuggerContext.getBatchId(),
      type: EntryType.BATCH,
      content,
      tags,
      isLatest: true,
      createdAt: DebuggerContext.now(),
    })
    .catch(() => undefined);
};

export const BatchWatcher: IDebuggerWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: IDebuggerWatcherConfig): () => void {
    if (config.watchers.batch === false) return () => undefined;
    _storage = storage;
    return () => {
      _storage = null;
    };
  },
});
