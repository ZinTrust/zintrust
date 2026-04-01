import { DebuggerContext } from '../context';
import type { IDebuggerWatcher, IDebuggerWatcherConfig, NotificationContent } from '../types';
import { EntryType } from '../types';
import { AuthTag } from '../utils/authTag';
import { RequestFilter } from '../utils/requestFilter';

let _storage: IDebuggerWatcherConfig['storage'] | null = null;
let _ignoreRoutes: string[] = [];

const emit = (notification: string, channels: string[], notifiable?: string): void => {
  if (!_storage) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes)) return;
  const content: NotificationContent = {
    notification,
    channels,
    notifiable,
    hostname: DebuggerContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: DebuggerContext.getBatchId(),
      type: EntryType.NOTIFICATION,
      content,
      tags: AuthTag.append([notification, ...channels]),
      isLatest: true,
      createdAt: DebuggerContext.now(),
    })
    .catch(() => undefined);
};

export const NotificationWatcher: IDebuggerWatcher & { emit: typeof emit } = Object.freeze({
  emit,
  register({ storage, config }: IDebuggerWatcherConfig): () => void {
    if (config.watchers.notification === false) return () => undefined;
    _storage = storage;
    _ignoreRoutes = config.ignoreRoutes;
    return () => {
      _storage = null;
      _ignoreRoutes = [];
    };
  },
});
