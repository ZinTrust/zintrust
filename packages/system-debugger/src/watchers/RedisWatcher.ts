import { DebuggerContext } from '../context';
import type { IDebuggerWatcher, IDebuggerWatcherConfig, RedisContent } from '../types';
import { EntryType } from '../types';
import { AuthTag } from '../utils/authTag';

let _storage: IDebuggerWatcherConfig['storage'] | null = null;

/** Emit a redis command trace. Key/value payload is intentionally omitted for security. */
const emit = (command: string, duration: number): void => {
  if (!_storage) return;
  const content: RedisContent = { command, duration, hostname: DebuggerContext.getHostname() };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: DebuggerContext.getBatchId(),
      type: EntryType.REDIS,
      content,
      tags: AuthTag.append([command.toUpperCase()]),
      isLatest: true,
      createdAt: DebuggerContext.now(),
    })
    .catch(() => undefined);
};

export const RedisWatcher: IDebuggerWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: IDebuggerWatcherConfig): () => void {
    if (config.watchers.redis === false) return () => undefined;
    _storage = storage;
    return () => {
      _storage = null;
    };
  },
});
