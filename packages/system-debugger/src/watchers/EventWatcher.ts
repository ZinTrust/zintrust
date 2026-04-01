import { DebuggerContext } from '../context';
import type { EventContent, IDebuggerWatcher, IDebuggerWatcherConfig } from '../types';
import { EntryType } from '../types';
import { AuthTag } from '../utils/authTag';

let _storage: IDebuggerWatcherConfig['storage'] | null = null;

const emit = (name: string, listenerCount: number, payload?: unknown): void => {
  if (!_storage) return;
  const content: EventContent = {
    name,
    payload,
    listenerCount,
    hostname: DebuggerContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: DebuggerContext.getBatchId(),
      type: EntryType.EVENT,
      content,
      tags: AuthTag.append([name]),
      isLatest: true,
      createdAt: DebuggerContext.now(),
    })
    .catch(() => undefined);
};

export const EventWatcher: IDebuggerWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: IDebuggerWatcherConfig): () => void {
    if (config.watchers.event === false) return () => undefined;
    _storage = storage;
    return () => {
      _storage = null;
    };
  },
});
