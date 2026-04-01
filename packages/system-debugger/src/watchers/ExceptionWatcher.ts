/**
 * ExceptionWatcher — captures unhandled exceptions by hooking into the
 * framework error middleware.  Core must call ExceptionWatcher.capture()
 * from within its error handler, or the register() side-effect adds a
 * process-level unhandledRejection/uncaughtException listener as fallback.
 */
import { DebuggerContext } from '../context';
import type { ExceptionContent, IDebuggerWatcher, IDebuggerWatcherConfig } from '../types';
import { EntryType } from '../types';
import { AuthTag } from '../utils/authTag';
import { familyHash } from '../utils/familyHash';
import { RequestFilter } from '../utils/requestFilter';
import { parseStackFrameLine } from '../utils/stackFrame';

const getLinePreview = (_file: string, _line: number): Record<string, string> => {
  return {};
};

const buildContent = (err: Error): ExceptionContent => {
  const stack = err.stack ?? '';
  const trace: ExceptionContent['trace'] = stack
    .split('\n')
    .slice(1)
    .map(parseStackFrameLine)
    .filter((x): x is { file: string; line: number } => x !== null)
    .slice(0, 20);

  const firstFrame = trace[0];

  return {
    class: err.constructor?.name ?? 'Error',
    file: firstFrame?.file ?? 'unknown',
    line: firstFrame?.line ?? 0,
    message: err.message,
    trace,
    linePreview: firstFrame ? getLinePreview(firstFrame.file, firstFrame.line) : {},
    occurrences: 1,
    hostname: DebuggerContext.getHostname(),
    userId: DebuggerContext.getUserId(),
  };
};

let _storage: IDebuggerWatcherConfig['storage'] | null = null;
let _listenerRefCount = 0;
let _ignoreRoutes: string[] = [];

const handleUncaughtException = (error: unknown): void => {
  captureException(error);
};

const handleUnhandledRejection = (reason: unknown): void => {
  captureException(reason);
};

const registerProcessListeners = (): void => {
  if (typeof process === 'undefined') return;
  process.on('uncaughtException', handleUncaughtException);
  process.on('unhandledRejection', handleUnhandledRejection);
};

const unregisterProcessListeners = (): void => {
  if (typeof process === 'undefined') return;
  process.off('uncaughtException', handleUncaughtException);
  process.off('unhandledRejection', handleUnhandledRejection);
};

const captureException = (err: unknown): void => {
  const storage = _storage;
  if (!storage) return;
  if (!(err instanceof Error)) return;
  if (RequestFilter.shouldIgnoreCurrentRequest(_ignoreRoutes)) return;

  const content = buildContent(err);
  const hash = familyHash(`${content.class}:${content.file}:${content.line}`);
  const uuid = crypto.randomUUID();

  storage
    .writeEntry({
      uuid,
      batchId: DebuggerContext.getBatchId(),
      familyHash: hash,
      type: EntryType.EXCEPTION,
      content,
      tags: AuthTag.append([content.class]),
      isLatest: true,
      createdAt: DebuggerContext.now(),
    })
    .then(() => storage.markFamilyStale(hash, uuid))
    .catch(() => undefined);
};

export const ExceptionWatcher: IDebuggerWatcher & { capture: (err: unknown) => void } =
  Object.freeze({
    capture: captureException,

    register({ storage, config }: IDebuggerWatcherConfig): () => void {
      if (config.watchers.exception === false) return () => undefined;
      _storage = storage;
      _ignoreRoutes = config.ignoreRoutes;

      if (_listenerRefCount === 0) {
        registerProcessListeners();
      }
      _listenerRefCount += 1;

      return () => {
        _listenerRefCount = Math.max(0, _listenerRefCount - 1);
        if (_listenerRefCount === 0) {
          unregisterProcessListeners();
        }
        _storage = null;
        _ignoreRoutes = [];
      };
    },
  });
