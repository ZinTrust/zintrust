/**
 * HTTP Kernel - Request handling and middleware pipeline
 */

import { Logger } from '@config/logger';
import { middlewareConfig } from '@config/middleware';
import type { IServiceContainer } from '@container/ServiceContainer';
import { ErrorRouting } from '@core-routes/error';
import type { IRouter, RouteMatch } from '@core-routes/Router';
import { Router } from '@core-routes/Router';
import type { IRequest } from '@http/Request';
import { Request } from '@http/Request';
import { RequestContext, type IRequestContext } from '@http/RequestContext';
import type { IResponse } from '@http/Response';
import { Response } from '@http/Response';
import type { IMiddlewareStack, Middleware } from '@middleware/MiddlewareStack';
import { MiddlewareStack } from '@middleware/MiddlewareStack';
import type { IncomingMessage, ServerResponse } from '@node-singletons/http';

import { OpenTelemetry } from '@/observability/OpenTelemetry';
import { PrometheusMetrics } from '@/observability/PrometheusMetrics';
import { create as createScheduleRunner } from '@/scheduler/ScheduleRunner';
import type { ISchedule, IScheduleKernel } from '@/scheduler/types';
import { Env } from '@config/env';

type GlobalMiddlewareRegistrarState = {
  __zintrust_register_global_middleware__?: (...middleware: Middleware[]) => void;
  __zintrust_pending_global_middlewares__?: Middleware[];
};

type GlobalTraceMiddlewareState = {
  __zintrust_trace_middleware_emit__?: (
    name: string,
    event: 'before' | 'after',
    duration?: number
  ) => void;
};

export interface IKernel {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  handleRequest(req: IRequest, res: IResponse): Promise<void>;
  terminate(req: IRequest, res: IResponse): void;
  registerGlobalMiddleware(...middleware: Middleware[]): void;
  registerRouteMiddleware(name: string, middleware: Middleware): void;
  getRouter(): IRouter;
  getContainer(): IServiceContainer;
  getMiddlewareStack(): IMiddlewareStack;

  // Scheduling API
  registerSchedule(schedule: ISchedule): void;
  startSchedules(): void;
  stopSchedules(): Promise<void>;
  runScheduleOnce(name: string): Promise<void>;
}

/**
 * Terminate request lifecycle
 */
function terminate(_req: IRequest, _res: IResponse): void {
  // Cleanup, logging, etc.
}

const isWritableEnded = (res: IResponse): boolean => {
  if (typeof res.getRaw !== 'function') return false;
  const raw = res.getRaw();
  if (typeof raw !== 'object' || raw === null) return false;
  if (!('writableEnded' in raw)) return false;
  return Boolean((raw as unknown as { writableEnded?: boolean }).writableEnded);
};

const getStatusSafe = (res: IResponse): number => {
  try {
    if (typeof res.getStatus === 'function') return res.getStatus();
  } catch {
    // ignore
  }

  try {
    if (typeof res.getRaw === 'function') {
      const raw = res.getRaw();
      const maybeStatusCode = (raw as unknown as { statusCode?: unknown }).statusCode;
      if (typeof maybeStatusCode === 'number') return maybeStatusCode;
    }
  } catch {
    // ignore
  }

  return 0;
};

const getRouteMiddlewareNames = (route: unknown): string[] => {
  const routeAny = route as { middleware?: unknown };
  return Array.isArray(routeAny.middleware)
    ? routeAny.middleware.filter((m): m is string => typeof m === 'string')
    : [];
};

const getTraceMiddlewareEmitter =
  (): GlobalTraceMiddlewareState['__zintrust_trace_middleware_emit__'] => {
    const globalState = globalThis as unknown as GlobalTraceMiddlewareState;
    return typeof globalState.__zintrust_trace_middleware_emit__ === 'function'
      ? globalState.__zintrust_trace_middleware_emit__
      : undefined;
  };

const PREFLIGHT_FALLBACK_METHODS = Object.freeze([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  '*',
]);

const resolveRouteWithPreflightFallback = (
  router: IRouter,
  method: string,
  path: string
): RouteMatch | null => {
  const direct = Router.match(router, method, path);
  if (direct !== null || method !== 'OPTIONS') return direct;

  for (const fallbackMethod of PREFLIGHT_FALLBACK_METHODS) {
    const matched = Router.match(router, fallbackMethod, path);
    if (matched === null) continue;

    return {
      ...matched,
      handler: async (): Promise<void> => {
        await Promise.resolve();
      },
    };
  }

  return null;
};

type KernelTraceSpan = ReturnType<typeof OpenTelemetry.startHttpServerSpan>;

const maybeStartKernelTraceSpan = (
  req: IRequest,
  context: IRequestContext
): KernelTraceSpan | undefined => {
  if (OpenTelemetry.isEnabled() === false) return undefined;

  try {
    return OpenTelemetry.startHttpServerSpan(req, {
      method: context.method,
      path: req.getPath(),
      requestId: context.requestId,
      serviceName: Env.APP_NAME,
      userAgent: context.userAgent,
      userId: context.userId,
      tenantId: context.tenantId,
    });
  } catch {
    return undefined;
  }
};

const maybeSetKernelTraceRoute = (
  traceSpan: KernelTraceSpan | undefined,
  method: string,
  routeLabel: string
): void => {
  if (!traceSpan) return;
  OpenTelemetry.setHttpRoute(traceSpan.span, method, routeLabel);
};

const runMiddlewareChain = async (
  middleware: Middleware[],
  req: IRequest,
  res: IResponse,
  terminal: () => Promise<void>
): Promise<void> => {
  let index = 0;
  const next = async (): Promise<void> => {
    if (index < middleware.length) {
      const mw = middleware[index++];
      await mw(req, res, next);
      return;
    }
    await terminal();
  };
  await next();
};

// Safe type guard to ensure route.routePath is a non-empty string before calling .trim()
const hasNonEmptyRoutePath = (r: unknown): r is { routePath: string } => {
  if (typeof r !== 'object' || r === null) return false;
  const rp = (r as { routePath?: unknown }).routePath;
  return typeof rp === 'string' && rp.trim() !== '';
};

type MatchedRoute = {
  params?: Record<string, unknown>;
  handler: (req: IRequest, res: IResponse) => Promise<void> | void;
  routePath?: string;
};

const coerceRouteParams = (params: Record<string, unknown> | undefined): Record<string, string> => {
  const safeParams: Record<string, string> = {};
  if (typeof params !== 'object' || params === null) return safeParams;
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    safeParams[k] = typeof v === 'string' ? v : String(v);
  }
  return safeParams;
};

const resolveWrappedRouteMiddleware = (
  routeMiddlewareNames: string[],
  routeMiddleware: Record<string, Middleware>
): Middleware[] => {
  const traceMiddlewareEmitter = getTraceMiddlewareEmitter();
  return routeMiddlewareNames
    .map((name) => ({ name, middleware: routeMiddleware[name] }))
    .filter(
      (entry): entry is { name: string; middleware: Middleware } =>
        typeof entry.middleware === 'function'
    )
    .map(({ name, middleware }) => {
      if (traceMiddlewareEmitter === undefined) return middleware;

      const wrapped: Middleware = async (request, response, next) => {
        const start = Date.now();
        traceMiddlewareEmitter(name, 'before');
        try {
          await middleware(request, response, next);
        } finally {
          traceMiddlewareEmitter(name, 'after', Date.now() - start);
        }
      };

      return wrapped;
    });
};

const runNotFoundPipeline = async (
  globalMiddleware: Middleware[],
  req: IRequest,
  res: IResponse,
  context: IRequestContext,
  traceSpan: KernelTraceSpan | undefined
): Promise<string> => {
  // Run global middleware (including HttpWatcher) so routing 404s are still observed.
  // Route middleware is intentionally skipped — there is no matched route.
  const routeLabel = 'not_found';
  maybeSetKernelTraceRoute(traceSpan, context.method, routeLabel);
  req.context['traceRouteMiddleware'] = [];
  const handleNotFound = ErrorRouting.handleNotFound as (
    request: IRequest,
    response: IResponse,
    requestId?: string
  ) => Promise<void>;

  await runMiddlewareChain(globalMiddleware, req, res, async () => {
    await handleNotFound(req, res, context.requestId);
  });
  return routeLabel;
};

const runKernelPipeline = async (
  router: IRouter,
  globalMiddleware: Middleware[],
  routeMiddleware: Record<string, Middleware>,
  req: IRequest,
  res: IResponse,
  context: IRequestContext,
  traceSpan: KernelTraceSpan | undefined
): Promise<string> => {
  const route = resolveRouteWithPreflightFallback(router, req.getMethod(), req.getPath());
  if (route === null) {
    return runNotFoundPipeline(globalMiddleware, req, res, context, traceSpan);
  }

  const matchedRoute = route as MatchedRoute;
  const routeLabel = hasNonEmptyRoutePath(matchedRoute) ? matchedRoute.routePath : req.getPath();
  maybeSetKernelTraceRoute(traceSpan, context.method, routeLabel);

  req.setParams(coerceRouteParams(matchedRoute.params));

  const routeMiddlewareNames = getRouteMiddlewareNames(matchedRoute);
  req.context['traceRouteMiddleware'] = routeMiddlewareNames;

  const middlewareToRun = [
    ...globalMiddleware,
    ...resolveWrappedRouteMiddleware(routeMiddlewareNames, routeMiddleware),
  ];

  await runMiddlewareChain(middlewareToRun, req, res, async () => {
    await matchedRoute.handler(req, res);
  });
  return routeLabel;
};

const finalizeKernelObservability = (
  context: IRequestContext,
  res: IResponse,
  routeLabel: string,
  thrown: unknown,
  traceSpan: KernelTraceSpan | undefined
): void => {
  if (Env.getBool('METRICS_ENABLED', false)) {
    const status = getStatusSafe(res);
    const durationMs = Date.now() - context.startTime;
    void PrometheusMetrics.observeHttpRequest({
      method: context.method,
      route: routeLabel,
      status,
      durationMs,
    }).catch(() => {
      // best-effort
    });
  }

  if (traceSpan) {
    const status = getStatusSafe(res);

    // Late-bind context-derived attributes so auth/tenant middleware can populate them.
    try {
      if (typeof context.userId === 'string' && context.userId.trim() !== '') {
        traceSpan.span.setAttribute('enduser.id', context.userId);
      }
      if (typeof context.tenantId === 'string' && context.tenantId.trim() !== '') {
        traceSpan.span.setAttribute('zintrust.tenant_id', context.tenantId);
      }
      if (typeof context.traceId === 'string' && context.traceId.trim() !== '') {
        traceSpan.span.setAttribute('zintrust.trace_id', context.traceId);
      }
    } catch {
      // best-effort
    }

    OpenTelemetry.endHttpServerSpan(traceSpan.span, {
      route: routeLabel,
      status,
      error: thrown,
    });
  }
};

const createHandleRequest = (
  router: IRouter,
  globalMiddleware: Middleware[],
  routeMiddleware: Record<string, Middleware>
): ((req: IRequest, res: IResponse) => Promise<void>) => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    const context = RequestContext.create(req);
    let routeLabel = 'unmatched';
    let traceSpan: KernelTraceSpan | undefined;
    let thrown: unknown;
    try {
      await RequestContext.run(context, async () => {
        traceSpan = maybeStartKernelTraceSpan(req, context);

        const run = async (): Promise<string> =>
          runKernelPipeline(
            router,
            globalMiddleware,
            routeMiddleware,
            req,
            res,
            context,
            traceSpan
          );

        routeLabel = traceSpan
          ? await OpenTelemetry.runWithContext(traceSpan.context, run)
          : await run();
      });
    } catch (error) {
      thrown = error;
      Logger.error('Kernel error:', error as Error);
      if (!isWritableEnded(res)) {
        ErrorRouting.handleInternalServerErrorWithWrappers(req, res, error, context.requestId);
      }
    } finally {
      finalizeKernelObservability(context, res, routeLabel, thrown, traceSpan);
      terminate(req, res);
    }
  };
};

const createHandle =
  (handleRequest: (req: IRequest, res: IResponse) => Promise<void>) =>
  async (nodeReq: IncomingMessage, nodeRes: ServerResponse): Promise<void> => {
    const req = Request.create(nodeReq);
    const res = Response.create(nodeRes);
    await handleRequest(req, res);
  };

/**
 * HTTP Kernel Factory
 */
const create = (router: IRouter, container: IServiceContainer): IKernel => {
  const globalMiddleware: Middleware[] = <Middleware[]>[];
  const routeMiddleware: Record<string, Middleware> = {};
  const middlewareStack = MiddlewareStack.create();
  const globalMiddlewareRegistrarState = globalThis as unknown as GlobalMiddlewareRegistrarState;

  // Scheduling runner (for long-running runtimes)
  const scheduleRunner = createScheduleRunner();

  const scheduleKernel: IScheduleKernel = Object.freeze({
    getContainer: () => container,
    getRouter: () => router,
  });

  // Register default middleware config
  globalMiddleware.push(...middlewareConfig.global);
  if (Array.isArray(globalMiddlewareRegistrarState.__zintrust_pending_global_middlewares__)) {
    globalMiddleware.push(
      ...globalMiddlewareRegistrarState.__zintrust_pending_global_middlewares__
    );
    globalMiddlewareRegistrarState.__zintrust_pending_global_middlewares__ = [];
  }
  globalMiddlewareRegistrarState.__zintrust_register_global_middleware__ = (
    ...middleware: Middleware[]
  ): void => {
    globalMiddleware.push(...middleware);
  };

  for (const [name, mw] of Object.entries(middlewareConfig.route)) {
    routeMiddleware[name] = mw;
  }

  const handleRequest = createHandleRequest(router, globalMiddleware, routeMiddleware);
  const handle = createHandle(handleRequest);

  return {
    handle,
    handleRequest,
    terminate,
    registerGlobalMiddleware(...middleware: Middleware[]): void {
      globalMiddleware.push(...middleware);
    },
    registerRouteMiddleware(name: string, middleware: Middleware): void {
      routeMiddleware[name] = middleware;
    },
    getRouter: (): IRouter => router,
    getContainer: (): IServiceContainer => container,
    getMiddlewareStack: (): IMiddlewareStack => middlewareStack,

    // Scheduling API
    registerSchedule(schedule: ISchedule): void {
      scheduleRunner.register(schedule);
    },

    startSchedules(): void {
      // Delegated to the internal ScheduleRunner. Kernel will call startSchedules
      // during boot for long-running runtimes (Node / Fargate).
      scheduleRunner.start(scheduleKernel);
    },

    async stopSchedules(): Promise<void> {
      const timeoutMs = Env.getInt('SCHEDULE_SHUTDOWN_TIMEOUT_MS', 30000);
      await scheduleRunner.stop(timeoutMs);
    },

    async runScheduleOnce(name: string): Promise<void> {
      await scheduleRunner.runOnce(name, scheduleKernel);
    },
  };
};

export const Kernel = Object.freeze({
  create,
});

export default Kernel;
