import { generateUuid } from '@/common/utility';
import type { IRequest } from '@http/Request';

export interface IRequestContext {
  requestId: string;
  traceId?: string;
  userId?: string;
  tenantId?: string;
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
    const mod = (await import('@node-singletons/async_hooks')) as unknown as {
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

const extractTraceIdFromTraceparent = (traceparent: string | undefined): string | undefined => {
  if (typeof traceparent !== 'string') return undefined;
  const trimmed = traceparent.trim();
  if (trimmed === '') return undefined;

  // W3C traceparent: version-traceid-spanid-flags
  // Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
  const parts = trimmed.split('-');
  if (parts.length !== 4) return undefined;
  const traceId = parts[1] ?? '';
  if (/^[0-9a-f]{32}$/i.test(traceId) === false) return undefined;
  // Disallow all-zero traceId
  if (/^0{32}$/i.test(traceId)) return undefined;
  return traceId.toLowerCase();
};

const getTraceIdFromMicroserviceTraceContext = (req: IRequest): string | undefined => {
  const anyReq = req as unknown as { context?: Record<string, unknown> };
  const trace = anyReq.context?.['trace'];
  if (typeof trace !== 'object' || trace === null) return undefined;
  const traceId = (trace as { traceId?: unknown }).traceId;
  return typeof traceId === 'string' && traceId.trim() !== '' ? traceId : undefined;
};

const getOptionalContextString = (
  req: IRequest,
  key: 'traceId' | 'userId' | 'tenantId'
): string | undefined => {
  const anyReq = req as unknown as { context?: Record<string, unknown> };
  const value = anyReq.context?.[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
};

const setContextField = (
  req: IRequest,
  field: 'traceId' | 'userId' | 'tenantId',
  value: string | undefined
): void => {
  req.context ??= {};
  if (typeof value === 'string' && value.trim() !== '') {
    req.context[field] = value;
  }

  const ctx = RequestContext.get(req);
  if (ctx) {
    (ctx as unknown as Record<string, unknown>)[field] = value;
  }
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
    const requestId = requestIdFromHeader ?? generateUuid();

    const traceId =
      extractTraceIdFromTraceparent(getHeaderString(req, 'traceparent')) ??
      getHeaderString(req, 'x-trace-id') ??
      getTraceIdFromMicroserviceTraceContext(req) ??
      getOptionalContextString(req, 'traceId');

    const userId = getOptionalContextString(req, 'userId');
    const tenantId = getOptionalContextString(req, 'tenantId');

    const ctx: IRequestContext = {
      requestId,
      traceId,
      userId,
      tenantId,
      startTime: Date.now(),
      method: req.getMethod(),
      path: req.getPath(),
      userAgent: getHeaderString(req, 'user-agent'),
    };

    req.context['requestId'] = requestId;
    if (traceId !== undefined) req.context['traceId'] = traceId;
    if (userId !== undefined) req.context['userId'] = userId;
    if (tenantId !== undefined) req.context['tenantId'] = tenantId;
    req.context['requestContext'] = ctx;

    return ctx;
  },

  attach(req: IRequest, context: IRequestContext): void {
    req.context ??= {};
    req.context['requestContext'] = context;
    req.context['requestId'] = context.requestId;
    if (context.traceId !== undefined) req.context['traceId'] = context.traceId;
    if (context.userId !== undefined) req.context['userId'] = context.userId;
    if (context.tenantId !== undefined) req.context['tenantId'] = context.tenantId;
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

  setUserId(req: IRequest, userId: string | undefined): void {
    setContextField(req, 'userId', userId);
  },

  setTenantId(req: IRequest, tenantId: string | undefined): void {
    setContextField(req, 'tenantId', tenantId);
  },

  setTraceId(req: IRequest, traceId: string | undefined): void {
    setContextField(req, 'traceId', traceId);
  },
});

export default RequestContext;
