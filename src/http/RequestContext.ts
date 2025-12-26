import type { IRequest } from '@http/Request';

export interface IRequestContext {
  requestId: string;
  startTime: number;
  method: string;
  path: string;
  userAgent?: string;
  status?: number;
  duration?: number;
}

type StoreApi = {
  run<T>(store: IRequestContext, callback: () => T): T;
  getStore(): IRequestContext | undefined;
};

const createFallbackStorage = (): StoreApi => {
  let store: IRequestContext | undefined;

  return {
    run<T>(ctx: IRequestContext, callback: () => T): T {
      const prev = store;
      store = ctx;
      try {
        return callback();
      } finally {
        store = prev;
      }
    },

    getStore(): IRequestContext | undefined {
      return store;
    },
  };
};

const resolveStorage = async (): Promise<StoreApi> => {
  try {
    const mod = (await import('node:async_hooks')) as unknown as {
      AsyncLocalStorage: new () => StoreApi;
    };
    return new mod.AsyncLocalStorage();
  } catch {
    return createFallbackStorage();
  }
};

const getHeaderString = (req: IRequest, name: string): string | undefined => {
  const value = req.getHeader(name);
  return typeof value === 'string' ? value : undefined;
};

const generateRequestId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const id = crypto.randomUUID();
  return `req_${id}`;
};

const STORAGE_PROMISE: Promise<StoreApi> = resolveStorage();

export const RequestContext = Object.freeze({
  async run<T>(context: IRequestContext, callback: () => T): Promise<T> {
    const storage = await STORAGE_PROMISE;
    return storage.run(context, callback);
  },

  async current(): Promise<IRequestContext | undefined> {
    const storage = await STORAGE_PROMISE;
    return storage.getStore();
  },

  create(req: IRequest): IRequestContext {
    req.context ??= {};

    const requestIdFromHeader = getHeaderString(req, 'x-request-id');
    const requestId = requestIdFromHeader ?? generateRequestId();

    const ctx: IRequestContext = {
      requestId,
      startTime: Date.now(),
      method: req.getMethod(),
      path: req.getPath(),
      userAgent: getHeaderString(req, 'user-agent'),
    };

    req.context['requestId'] = requestId;
    req.context['requestContext'] = ctx;

    return ctx;
  },

  attach(req: IRequest, context: IRequestContext): void {
    req.context ??= {};
    req.context['requestContext'] = context;
    req.context['requestId'] = context.requestId;
  },

  get(req: IRequest): IRequestContext | undefined {
    const anyReq = req as unknown as { context?: Record<string, unknown> };
    const value = anyReq.context?.['requestContext'];
    return typeof value === 'object' && value !== null ? (value as IRequestContext) : undefined;
  },

  enrich(context: IRequestContext, status: number): IRequestContext {
    const duration = Date.now() - context.startTime;
    return {
      ...context,
      status,
      duration,
    };
  },
});

export default RequestContext;
