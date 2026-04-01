/**
 * HttpWatcher — records inbound HTTP requests as debugger entries.
 * Registers as a global middleware via Kernel.registerGlobalMiddleware().
 */
import type { IRequest, IResponse } from '@zintrust/core';
import { DebuggerContext } from '../context';
import type {
  IDebuggerConfig,
  IDebuggerWatcher,
  IDebuggerWatcherConfig,
  RequestContent,
} from '../types';
import { EntryType } from '../types';
import { AuthTag } from '../utils/authTag';
import { redactHeaders, redactObject } from '../utils/redact';
import { RequestFilter } from '../utils/requestFilter';

const buildEntry = (
  req: IRequest,
  res: IResponse,
  start: number,
  config: IDebuggerConfig
): RequestContent => {
  const headers = req.headers
    ? redactHeaders(req.headers as Record<string, string>, config.redaction.headers)
    : {};

  const payload = req.body ? redactObject(req.body, config.redaction.body) : {};

  return {
    method: req.getMethod(),
    uri: req.getPath(),
    headers,
    payload,
    responseStatus: res.getStatus(),
    responseHeaders: {},
    duration: Date.now() - start,
    memory: DebuggerContext.getMemory(),
    middleware: [],
    hostname: DebuggerContext.getHostname(),
    userId: DebuggerContext.getUserId(),
  };
};

const shouldIgnore = (req: IRequest, config: IDebuggerConfig): boolean => {
  return RequestFilter.matchesIgnoredPath(req.getPath(), config.ignoreRoutes);
};

const isWatcherEnabled = (config: IDebuggerConfig): boolean => config.watchers.request !== false;

export const HttpWatcher: IDebuggerWatcher = Object.freeze({
  register({ storage, config, registerMiddleware }: IDebuggerWatcherConfig): () => void {
    if (!isWatcherEnabled(config)) return () => undefined;
    if (!registerMiddleware) return () => undefined;

    const middleware = async (
      req: IRequest,
      res: IResponse,
      next: () => Promise<void>
    ): Promise<void> => {
      if (shouldIgnore(req, config)) return next();

      const start = DebuggerContext.now();
      const batchId = DebuggerContext.getBatchId();

      await next();

      const content = buildEntry(req, res, start, config);
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
          createdAt: DebuggerContext.now(),
        })
        .catch(() => undefined); // fire-and-forget
    };

    registerMiddleware(middleware as Parameters<typeof registerMiddleware>[0]);
    return () => undefined;
  },
});
