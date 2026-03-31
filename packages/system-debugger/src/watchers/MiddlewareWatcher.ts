import { DebuggerContext } from '../context';
import type { IDebuggerWatcher, IDebuggerWatcherConfig, MiddlewareContent } from '../types';
import { EntryType } from '../types';

let _storage: IDebuggerWatcherConfig['storage'] | null = null;

const emit = (name: string, event: MiddlewareContent['event'], duration?: number): void => {
  if (!_storage) return;
  const content: MiddlewareContent = {
    name,
    event,
    duration,
    hostname: DebuggerContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: DebuggerContext.getBatchId(),
      type: EntryType.MIDDLEWARE,
      content,
      tags: [name, event],
      isLatest: true,
      createdAt: DebuggerContext.now(),
    })
    .catch(() => undefined);
};

export const MiddlewareWatcher: IDebuggerWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: IDebuggerWatcherConfig): () => void {
    if (config.watchers.middleware === false) return () => undefined;
    _storage = storage;
    return () => {
      _storage = null;
    };
  },
});
