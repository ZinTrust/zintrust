/**
 * ExceptionWatcher — captures unhandled exceptions by hooking into the
 * framework error middleware.  Core must call ExceptionWatcher.capture()
 * from within its error handler, or the register() side-effect adds a
 * process-level unhandledRejection/uncaughtException listener as fallback.
 */
import { DebuggerContext } from '../context';
import { DebuggerStorage } from '../storage/DebuggerStorage';
import type { ExceptionContent, IDebuggerWatcher, IDebuggerWatcherConfig } from '../types';
import { EntryType } from '../types';

const getLinePreview = (_file: string, _line: number): Record<string, string> => {
  return {};
};

const buildContent = (err: Error): ExceptionContent => {
  const stack = err.stack ?? '';
  const trace: ExceptionContent['trace'] = stack
    .split('\n')
    .slice(1)
    .map((l) => {
      const match =
        l.trim().match(/at .+ \((.+):(\d+):\d+\)/) ?? l.trim().match(/at (.+):(\d+):\d+/);
      if (!match) return null;
      return { file: match[1], line: parseInt(match[2], 10) };
    })
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

let _storage: ReturnType<typeof DebuggerStorage.resolveStorage> | null = null;
let _listenerRefCount = 0;

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

  const content = buildContent(err);
  const hash = DebuggerStorage.familyHash(`${content.class}:${content.file}:${content.line}`);
  const uuid = crypto.randomUUID();

  storage
    .writeEntry({
      uuid,
      batchId: DebuggerContext.getBatchId(),
      familyHash: hash,
      type: EntryType.EXCEPTION,
      content,
      tags: [content.class],
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
      };
    },
  });
