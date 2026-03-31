/**
 * MailWatcher — records mail dispatch intent.
 * Body is never captured; only to/subject/template.
 */
import { DebuggerContext } from '../context';
import type { IDebuggerWatcher, IDebuggerWatcherConfig, MailContent } from '../types';
import { EntryType } from '../types';

let _storage: IDebuggerWatcherConfig['storage'] | null = null;

const emit = (to: string, subject: string, template?: string): void => {
  if (!_storage) return;
  const content: MailContent = {
    to,
    subject,
    template,
    hostname: DebuggerContext.getHostname(),
  };
  _storage
    .writeEntry({
      uuid: crypto.randomUUID(),
      batchId: DebuggerContext.getBatchId(),
      type: EntryType.MAIL,
      content,
      tags: [],
      isLatest: true,
      createdAt: DebuggerContext.now(),
    })
    .catch(() => undefined);
};

export const MailWatcher: IDebuggerWatcher & { emit: typeof emit } = Object.freeze({
  emit,

  register({ storage, config }: IDebuggerWatcherConfig): () => void {
    if (config.watchers.mail === false) return () => undefined;
    _storage = storage;
    return () => {
      _storage = null;
    };
  },
});
