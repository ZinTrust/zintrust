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
import { redactHeaders, redactObject } from '../utils/redact';

const buildEntry = (
  req: IRequest,
  res: IResponse,
  start: number,
  config: IDebuggerConfig
): RequestContent => {
  const headers = req.headers
    ? redactHeaders(req.headers as Record<string, string>, config.redaction.headers)
    : {};

  const payload = req.body
    ? redactObject(req.body as Record<string, unknown>, config.redaction.body)
    : {};

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
  const path = req.getPath().split('?')[0];
  return config.ignoreRoutes.some((r) => path.startsWith(r));
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
      const tags: string[] = [];
      const userId = DebuggerContext.getUserId();
      if (userId) tags.push(`Auth:${userId}`);
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
