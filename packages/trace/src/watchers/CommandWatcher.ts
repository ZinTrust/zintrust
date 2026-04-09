import { TraceContext } from '../context';
import type { CommandContent, ITraceWatcher, ITraceWatcherConfig } from '../types';
import { EntryType } from '../types';
import { redactObject } from '../utils/redact';
import { RequestFilter } from '../utils/requestFilter';

let _storage: ITraceWatcherConfig['storage'] | null = null;
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
    hostname: TraceContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: TraceContext.getBatchId(),
      type: EntryType.COMMAND,
      content,
      tags,
      isLatest: true,
      createdAt: TraceContext.now(),
    })
    .catch(() => undefined);
};

export const CommandWatcher: ITraceWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: ITraceWatcherConfig): () => void {
    if (config.watchers.command === false) return () => undefined;
    _storage = storage;
    _redactKeys = [...(config.redaction?.keys ?? []), ...(config.redaction?.body ?? [])];
    _ignoreRoutes = config.ignoreRoutes;
    return () => {
      _storage = null;
      _ignoreRoutes = [];
    };
  },
});
