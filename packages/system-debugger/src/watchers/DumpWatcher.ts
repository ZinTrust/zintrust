import { DebuggerContext } from '../context';
import type { DumpContent, IDebuggerWatcher, IDebuggerWatcherConfig } from '../types';
import { EntryType } from '../types';
import { RequestFilter } from '../utils/requestFilter';

let _storage: IDebuggerWatcherConfig['storage'] | null = null;
let _enabled = false;
let _ignoreRoutes: string[] = [];

/** Explicitly opt-in (enabled only when config.watchers.dump === true, not just non-false). */
const emit = (value: unknown, file?: string, line?: number): void => {
  if (!_storage || !_enabled) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes)) return;
  const content: DumpContent = { value, file, line, hostname: DebuggerContext.getHostname() };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: DebuggerContext.getBatchId(),
      type: EntryType.DUMP,
      content,
      tags: [],
      isLatest: true,
      createdAt: DebuggerContext.now(),
    })
    .catch(() => undefined);
};

export const DumpWatcher: IDebuggerWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: IDebuggerWatcherConfig): () => void {
    // DumpWatcher requires explicit opt-in (=== true), not just absence of false
    if (config.watchers.dump !== true) return () => undefined;
    _storage = storage;
    _enabled = true;
    _ignoreRoutes = config.ignoreRoutes;
    return () => {
      _storage = null;
      _enabled = false;
      _ignoreRoutes = [];
    };
  },
});
