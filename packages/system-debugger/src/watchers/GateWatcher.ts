import { DebuggerContext } from '../context';
import type { GateContent, IDebuggerWatcher, IDebuggerWatcherConfig } from '../types';
import { EntryType } from '../types';

let _storage: IDebuggerWatcherConfig['storage'] | null = null;

const emit = (
  ability: string,
  result: GateContent['result'],
  userId?: string,
  subject?: string
): void => {
  if (!_storage) return;
  const tags: string[] = [ability, result];
  if (userId) tags.push(`Auth:${userId}`);
  const content: GateContent = {
    ability,
    result,
    userId,
    subject,
    hostname: DebuggerContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: DebuggerContext.getBatchId(),
      type: EntryType.GATE,
      content,
      tags,
      isLatest: true,
      createdAt: DebuggerContext.now(),
    })
    .catch(() => undefined);
};

export const GateWatcher: IDebuggerWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: IDebuggerWatcherConfig): () => void {
    if (config.watchers.gate === false) return () => undefined;
    _storage = storage;
    return () => {
      _storage = null;
    };
  },
});
