import { DebuggerContext } from '../context';
import type { CommandContent, IDebuggerWatcher, IDebuggerWatcherConfig } from '../types';
import { EntryType } from '../types';
import { redactObject } from '../utils/redact';
import { RequestFilter } from '../utils/requestFilter';

let _storage: IDebuggerWatcherConfig['storage'] | null = null;
let _redactKeys: string[] = [];
let _ignoreRoutes: string[] = [];

const emit = (
  name: string,
  args: Record<string, unknown>,
  exitCode: number,
  duration: number,
  output?: string
): void => {
  if (!_storage) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes)) return;
  const tags = [name];
  if (exitCode !== 0) tags.push('failed');
  const content: CommandContent = {
    name,
    arguments: redactObject(args, _redactKeys),
    exitCode,
    duration,
    output,
    hostname: DebuggerContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: DebuggerContext.getBatchId(),
      type: EntryType.COMMAND,
      content,
      tags,
      isLatest: true,
      createdAt: DebuggerContext.now(),
    })
    .catch(() => undefined);
};

export const CommandWatcher: IDebuggerWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: IDebuggerWatcherConfig): () => void {
    if (config.watchers.command === false) return () => undefined;
    _storage = storage;
    _redactKeys = config.redaction?.body ?? [];
    _ignoreRoutes = config.ignoreRoutes;
    return () => {
      _storage = null;
      _ignoreRoutes = [];
    };
  },
});
