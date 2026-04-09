import type { EntryTypeValue, ITraceEntry, ITraceStorage } from '../types';

type TraceLogger = {
  warn: (message: string, context?: Record<string, unknown>) => void;
};

type TraceWriteFailureContext = {
  connectionName: string;
  error: unknown;
  operation: string;
  watcherType?: EntryTypeValue;
};

type TraceWriteDiagnosticsSnapshot = {
  degraded: boolean;
  lastErrorMessage: string | null;
  lastFailureAt: number | null;
  totalFailures: number;
};

type TraceWriteDiagnosticsState = TraceWriteDiagnosticsSnapshot & {
  lastLoggedAtByFingerprint: Map<string, number>;
};

const LOG_WINDOW_MS = 30_000;

const diagnosticsState: TraceWriteDiagnosticsState = {
  degraded: false,
  lastErrorMessage: null,
  lastFailureAt: null,
  lastLoggedAtByFingerprint: new Map<string, number>(),
  totalFailures: 0,
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (value === null || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
};

const getAttachedErrorDetails = (error: unknown): unknown => {
  if (error instanceof Error && 'details' in error) {
    const details = (error as Error & { details?: unknown }).details;
    if (details !== undefined) return details;
  }

  const record = asRecord(error);
  return record?.['details'];
};

const getTextValue = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const describeBodyDetails = (body: Record<string, unknown>): string | null => {
  const code = getTextValue(body['code']);
  const message = getTextValue(body['message']);

  if (code !== null && message !== null) return `${code}: ${message}`;
  if (code !== null) return code;
  if (message !== null) return message;

  return null;
};

const describeRecordDetails = (record: Record<string, unknown>): string | null => {
  const body = asRecord(record['body']);
  if (body !== null) {
    const describedBody = describeBodyDetails(body);
    if (describedBody !== null) return describedBody;
  }

  const nested = describeErrorDetails(record['details']);
  if (nested !== null) return nested;

  const message = getTextValue(record['message']);
  if (message !== null) return message;

  const code = getTextValue(record['code']);
  if (code !== null) return code;

  return null;
};

const describeErrorDetails = (details: unknown): string | null => {
  const text = getTextValue(details);
  if (text !== null) return text;

  const record = asRecord(details);
  if (record === null) return null;
  return describeRecordDetails(record);
};

const withOptionalDetail = (
  context: Record<string, unknown>,
  errorDetails: unknown
): Record<string, unknown> => {
  if (errorDetails === undefined) return context;
  return { ...context, errorDetails };
};

const getErrorMessage = (error: unknown): string => {
  let baseMessage = '';
  if (error instanceof Error && error.message.trim() !== '') {
    baseMessage = error.message;
  } else if (typeof error === 'string' && error.trim() !== '') {
    baseMessage = error;
  } else {
    try {
      const serialized = JSON.stringify(error);
      if (typeof serialized === 'string' && serialized !== '') baseMessage = serialized;
    } catch {
      // ignore serialization failures
    }
  }

  const detailsSummary = describeErrorDetails(getAttachedErrorDetails(error));
  if (
    detailsSummary !== null &&
    detailsSummary !== '' &&
    baseMessage !== '' &&
    !baseMessage.includes(detailsSummary)
  ) {
    return `${baseMessage} (${detailsSummary})`;
  }

  if (baseMessage !== '') return baseMessage;

  if (detailsSummary !== null && detailsSummary !== '') return detailsSummary;

  return 'Unknown trace storage error';
};

const buildFingerprint = (context: TraceWriteFailureContext): string => {
  return [
    context.connectionName,
    context.operation,
    context.watcherType ?? 'unknown',
    getErrorMessage(context.error),
  ].join('|');
};

const reportFailure = (
  logger: TraceLogger | undefined,
  context: TraceWriteFailureContext
): void => {
  const now = Date.now();
  const errorMessage = getErrorMessage(context.error);
  const errorDetails = getAttachedErrorDetails(context.error);
  const fingerprint = buildFingerprint(context);
  const lastLoggedAt = diagnosticsState.lastLoggedAtByFingerprint.get(fingerprint);

  diagnosticsState.degraded = true;
  diagnosticsState.lastErrorMessage = errorMessage;
  diagnosticsState.lastFailureAt = now;
  diagnosticsState.totalFailures += 1;

  if (logger === undefined) return;
  if (typeof lastLoggedAt === 'number' && now - lastLoggedAt < LOG_WINDOW_MS) return;

  diagnosticsState.lastLoggedAtByFingerprint.set(fingerprint, now);
  logger.warn(
    '[trace] Trace storage write degraded',
    withOptionalDetail(
      {
        connectionName: context.connectionName,
        error: errorMessage,
        lastFailureAt: now,
        operation: context.operation,
        totalFailures: diagnosticsState.totalFailures,
        watcherType: context.watcherType ?? null,
      },
      errorDetails
    )
  );
};

const wrapStorageMethod = <TArgs extends unknown[], TResult>(
  method: (...args: TArgs) => Promise<TResult>,
  describeFailure: (...args: TArgs) => Omit<TraceWriteFailureContext, 'connectionName' | 'error'>,
  connectionName: string,
  logger?: TraceLogger
): ((...args: TArgs) => Promise<TResult>) => {
  return async (...args: TArgs): Promise<TResult> => {
    try {
      return await method(...args);
    } catch (error) {
      reportFailure(logger, {
        ...describeFailure(...args),
        connectionName,
        error,
      });
      throw error;
    }
  };
};

export const TraceWriteDiagnostics = Object.freeze({
  getSnapshot(): TraceWriteDiagnosticsSnapshot {
    return {
      degraded: diagnosticsState.degraded,
      lastErrorMessage: diagnosticsState.lastErrorMessage,
      lastFailureAt: diagnosticsState.lastFailureAt,
      totalFailures: diagnosticsState.totalFailures,
    };
  },

  reset(): void {
    diagnosticsState.degraded = false;
    diagnosticsState.lastErrorMessage = null;
    diagnosticsState.lastFailureAt = null;
    diagnosticsState.totalFailures = 0;
    diagnosticsState.lastLoggedAtByFingerprint.clear();
  },

  wrapStorage(
    storage: ITraceStorage,
    options: { connectionName: string; logger?: TraceLogger }
  ): ITraceStorage {
    return Object.freeze({
      ...storage,
      writeEntry: wrapStorageMethod(
        storage.writeEntry.bind(storage),
        (entry: ITraceEntry) => ({ operation: 'writeEntry', watcherType: entry.type }),
        options.connectionName,
        options.logger
      ),
      updateEntry: wrapStorageMethod(
        storage.updateEntry.bind(storage),
        (_uuid: string, _patch) => ({ operation: 'updateEntry' }),
        options.connectionName,
        options.logger
      ),
      markFamilyStale: wrapStorageMethod(
        storage.markFamilyStale.bind(storage),
        (_familyHash: string, _exceptUuid: string) => ({ operation: 'markFamilyStale' }),
        options.connectionName,
        options.logger
      ),
      prune: wrapStorageMethod(
        storage.prune.bind(storage),
        (_olderThanMs: number, _keepExceptions?: boolean) => ({ operation: 'prune' }),
        options.connectionName,
        options.logger
      ),
      clear: wrapStorageMethod(
        storage.clear.bind(storage),
        () => ({ operation: 'clear' }),
        options.connectionName,
        options.logger
      ),
      addMonitoring: wrapStorageMethod(
        storage.addMonitoring.bind(storage),
        (_tag: string) => ({ operation: 'addMonitoring' }),
        options.connectionName,
        options.logger
      ),
      removeMonitoring: wrapStorageMethod(
        storage.removeMonitoring.bind(storage),
        (_tag: string) => ({ operation: 'removeMonitoring' }),
        options.connectionName,
        options.logger
      ),
    });
  },
});
