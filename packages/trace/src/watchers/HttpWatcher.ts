/**
 * HttpWatcher — records inbound HTTP requests as trace entries.
 * Registers as a global middleware via Kernel.registerGlobalMiddleware().
 */
import type { IRequest, IResponse } from '@zintrust/core';
import { TraceContext } from '../context';
import type { ITraceConfig, ITraceWatcher, ITraceWatcherConfig, RequestContent } from '../types';
import { EntryType } from '../types';
import { AuthTag } from '../utils/authTag';
import { redactHeaders, redactObject } from '../utils/redact';
import { RequestFilter } from '../utils/requestFilter';

const normalizeHeaders = (headers: IRequest['headers']): Record<string, string> => {
  if (!headers) return {};

  return Object.fromEntries(
    Object.entries(headers).flatMap(([key, value]) => {
      if (typeof value === 'string') return [[key, value]];
      if (Array.isArray(value)) return [[key, value.join(', ')]];
      return [];
    })
  );
};

const buildEntry = (
  req: IRequest,
  res: IResponse,
  start: number,
  config: ITraceConfig
): RequestContent => {
  const headers = redactHeaders(normalizeHeaders(req.headers), [
    ...config.redaction.keys,
    ...config.redaction.headers,
  ]);

  const payload = req.body
    ? redactObject(req.body, [...config.redaction.keys, ...config.redaction.body])
    : {};

  return {
    method: req.getMethod(),
    uri: req.getPath(),
    headers,
    payload,
    responseStatus: res.getStatus(),
    responseHeaders: {},
    duration: Date.now() - start,
    memory: TraceContext.getMemory(),
    middleware: [],
    hostname: TraceContext.getHostname(),
    userId: TraceContext.getUserId(),
  };
};

const shouldIgnore = (req: IRequest, config: ITraceConfig): boolean => {
  return RequestFilter.matchesIgnoredPath(req.getPath(), config.ignoreRoutes);
};

const isWatcherEnabled = (config: ITraceConfig): boolean => config.watchers.request !== false;

export const HttpWatcher: ITraceWatcher = Object.freeze({
  register({ storage, config, registerMiddleware }: ITraceWatcherConfig): () => void {
    if (!isWatcherEnabled(config)) return () => undefined;
    if (!registerMiddleware) return () => undefined;

    const middleware: Parameters<
      NonNullable<ITraceWatcherConfig['registerMiddleware']>
    >[0] = async (req: unknown, res: unknown, next: () => Promise<void>): Promise<void> => {
      const request = req as IRequest;
      const response = res as IResponse;

      if (shouldIgnore(request, config)) return next();

      const start = TraceContext.now();
      const batchId = TraceContext.getBatchId();

      await next();

      const content = buildEntry(request, response, start, config);
      const tags = AuthTag.append([]);
      if (content.responseStatus >= 500) tags.push('failed');

      storage
        .writeEntry({
          uuid: crypto.randomUUID(),
          batchId,
          type: EntryType.REQUEST,
          content,
          tags,
          isLatest: true,
          createdAt: TraceContext.now(),
        })
        .catch(() => undefined); // fire-and-forget
    };

    registerMiddleware(middleware);
    return () => undefined;
  },
});
