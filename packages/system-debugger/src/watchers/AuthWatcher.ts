/**
 * AuthWatcher — records login/logout/failed auth events.
 * Credentials are never stored; only the outcome.
 */
import { DebuggerContext } from '../context';
import type { AuthContent, IDebuggerWatcher, IDebuggerWatcherConfig } from '../types';
import { EntryType } from '../types';

let _storage: IDebuggerWatcherConfig['storage'] | null = null;

const emit = (event: AuthContent['event'], userId?: string): void => {
  if (!_storage) return;
  const content: AuthContent = {
    event,
    userId,
    hostname: DebuggerContext.getHostname(),
  };
  const tags: string[] = [];
  if (userId) tags.push(`Auth:${userId}`);
  if (event === 'failed') tags.push('failed');

  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: DebuggerContext.getBatchId(),
      type: EntryType.AUTH,
      content,
      tags,
      isLatest: true,
      createdAt: DebuggerContext.now(),
    })
    .catch(() => undefined);
};

export const AuthWatcher: IDebuggerWatcher & { emit: typeof emit } = Object.freeze({
  emit,

  register({ storage, config }: IDebuggerWatcherConfig): () => void {
    if (config.watchers.auth === false) return () => undefined;
    _storage = storage;
    return () => {
      _storage = null;
    };
  },
});
