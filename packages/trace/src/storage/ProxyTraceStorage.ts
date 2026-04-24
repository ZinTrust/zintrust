import { ErrorFactory, RemoteSignedJson } from '@zintrust/core';
import type { ITraceEntry, ITraceStorage } from '../types';

type ProxyTraceStorageSettings = {
  baseUrl: string;
  path: string;
  keyId: string;
  secret: string;
  timeoutMs: number;
};

type TraceProxyWriteRequest = {
  entry: ITraceEntry;
};

type TraceProxyUpdateRequest = {
  uuid: string;
  patch: Partial<Pick<ITraceEntry, 'content' | 'isLatest'>>;
};

type TraceProxyMarkFamilyStaleRequest = {
  familyHash: string;
  exceptUuid: string;
};

const ensureConfigured = (settings: ProxyTraceStorageSettings): void => {
  if (settings.baseUrl.trim() === '') {
    throw ErrorFactory.createConfigError('TRACE_PROXY_URL is required when TRACE_PROXY=true');
  }

  if (settings.keyId.trim() === '' || settings.secret.trim() === '') {
    throw ErrorFactory.createConfigError(
      'TRACE_PROXY signing credentials are required when TRACE_PROXY=true'
    );
  }
};

const normalizePath = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed === '') return '/zin/trace/write';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const trimTrailingSlashes = (value: string): string => {
  let trimmed = value;
  while (trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
};

const createUnsupportedReadError = (): Error =>
  ErrorFactory.createConfigError(
    'Trace proxy sender storage does not expose dashboard/query operations. Use the trace server for reads.'
  );

type ProxyRequestSettings = {
  baseUrl: string;
  keyId: string;
  secret: string;
  timeoutMs: number;
  signaturePathPrefixToStrip: string;
  missingUrlMessage: string;
  missingCredentialsMessage: string;
  messages: {
    unauthorized: string;
    forbidden: string;
    rateLimited: string;
    rejected: string;
    error: string;
    timedOut: string;
  };
  normalizedPath: string;
};

const buildSettings = (settings: ProxyTraceStorageSettings): ProxyRequestSettings => {
  ensureConfigured(settings);
  const normalizedPath = normalizePath(settings.path);

  return {
    baseUrl: settings.baseUrl,
    keyId: settings.keyId,
    secret: settings.secret,
    timeoutMs: settings.timeoutMs,
    signaturePathPrefixToStrip: new URL(settings.baseUrl).pathname,
    missingUrlMessage: 'TRACE_PROXY_URL is required when TRACE_PROXY=true',
    missingCredentialsMessage: 'TRACE_PROXY signing credentials are required when TRACE_PROXY=true',
    messages: {
      unauthorized: 'Trace proxy rejected the request credentials',
      forbidden: 'Trace proxy rejected the request signature',
      rateLimited: 'Trace proxy rate-limited the request',
      rejected: 'Trace proxy rejected the request payload',
      error: 'Trace proxy request failed',
      timedOut: 'Trace proxy request timed out',
    },
    normalizedPath,
  };
};

const appendSuffix = (path: string, suffix: string): string => {
  const base = trimTrailingSlashes(normalizePath(path));
  const tail = suffix.startsWith('/') ? suffix : `/${suffix}`;
  return `${base}${tail}`;
};

const unsupportedQueryEntries: ITraceStorage['queryEntries'] = async () => {
  throw createUnsupportedReadError();
};

const unsupportedGetEntry: ITraceStorage['getEntry'] = async () => {
  throw createUnsupportedReadError();
};

const unsupportedGetBatch: ITraceStorage['getBatch'] = async () => {
  throw createUnsupportedReadError();
};

const unsupportedQueryBatchEntries: ITraceStorage['queryBatchEntries'] = async () => {
  throw createUnsupportedReadError();
};

const unsupportedPrune: ITraceStorage['prune'] = async () => {
  throw createUnsupportedReadError();
};

const unsupportedClear: ITraceStorage['clear'] = async () => {
  throw createUnsupportedReadError();
};

const unsupportedGetMonitoring: ITraceStorage['getMonitoring'] = async () => {
  throw createUnsupportedReadError();
};

const unsupportedAddMonitoring: ITraceStorage['addMonitoring'] = async () => {
  throw createUnsupportedReadError();
};

const unsupportedRemoveMonitoring: ITraceStorage['removeMonitoring'] = async () => {
  throw createUnsupportedReadError();
};

const unsupportedStats: ITraceStorage['stats'] = async () => {
  throw createUnsupportedReadError();
};

export const ProxyTraceStorage = Object.freeze({
  create(settings: ProxyTraceStorageSettings): ITraceStorage {
    const normalized = buildSettings(settings);

    return Object.freeze({
      async writeEntry(entry: ITraceEntry): Promise<void> {
        await RemoteSignedJson.request<{ ok: true }>(normalized, normalized.normalizedPath, {
          entry,
        } satisfies TraceProxyWriteRequest);
      },

      async updateEntry(
        uuid: string,
        patch: Partial<Pick<ITraceEntry, 'content' | 'isLatest'>>
      ): Promise<void> {
        await RemoteSignedJson.request<{ ok: true }>(
          normalized,
          appendSuffix(normalized.normalizedPath, '/update'),
          { uuid, patch } satisfies TraceProxyUpdateRequest
        );
      },

      async markFamilyStale(familyHash: string, exceptUuid: string): Promise<void> {
        await RemoteSignedJson.request<{ ok: true }>(
          normalized,
          appendSuffix(normalized.normalizedPath, '/mark-family-stale'),
          { familyHash, exceptUuid } satisfies TraceProxyMarkFamilyStaleRequest
        );
      },

      queryEntries: unsupportedQueryEntries,
      getEntry: unsupportedGetEntry,
      getBatch: unsupportedGetBatch,
      queryBatchEntries: unsupportedQueryBatchEntries,
      prune: unsupportedPrune,
      clear: unsupportedClear,
      getMonitoring: unsupportedGetMonitoring,
      addMonitoring: unsupportedAddMonitoring,
      removeMonitoring: unsupportedRemoveMonitoring,
      stats: unsupportedStats,
    });
  },
});

export default ProxyTraceStorage;
