/**
 * HTTP Kernel - Request handling and middleware pipeline
 */

import { Logger } from '@config/logger';
import { middlewareConfig } from '@config/middleware';
import type { IServiceContainer } from '@container/ServiceContainer';
import { ErrorRouting } from '@core-routes/error';
import type { IRouter } from '@core-routes/Router';
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

const resolveMiddlewareForRoute = (
  route: unknown,
  globalMiddleware: Middleware[],
  routeMiddleware: Record<string, Middleware>
): Middleware[] => {
  const routeAny = route as { middleware?: unknown };
  const routeMiddlewareNames = Array.isArray(routeAny.middleware)
    ? routeAny.middleware.filter((m): m is string => typeof m === 'string')
    : [];

  const resolvedRouteMiddleware = routeMiddlewareNames
    .map((name) => routeMiddleware[name])
    .filter((mw): mw is Middleware => typeof mw === 'function');

  return [...globalMiddleware, ...resolvedRouteMiddleware];
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

const runKernelPipeline = async (
  router: IRouter,
  globalMiddleware: Middleware[],
  routeMiddleware: Record<string, Middleware>,
  req: IRequest,
  res: IResponse,
  context: IRequestContext,
  traceSpan: KernelTraceSpan | undefined
): Promise<string> => {
  Logger.info(`[${req.getMethod()}] ${req.getPath()}`);

  const route = Router.match(router, req.getMethod(), req.getPath());
  if (!route) {
    const routeLabel = 'not_found';
    maybeSetKernelTraceRoute(traceSpan, context.method, routeLabel);
    const handleNotFound = ErrorRouting.handleNotFound as (
      request: IRequest,
      response: IResponse,
      requestId?: string
    ) => Promise<void>;
    await handleNotFound(req, res, context.requestId);
    return routeLabel;
  }

  // Safe type guard to ensure route.routePath is a non-empty string before calling .trim()
  const hasNonEmptyRoutePath = (r: unknown): r is { routePath: string } => {
    if (typeof r !== 'object' || r === null) return false;
    const rp = (r as { routePath?: unknown }).routePath;
    return typeof rp === 'string' && rp.trim() !== '';
  };

  const routeLabel = hasNonEmptyRoutePath(route) ? route.routePath : req.getPath();

  maybeSetKernelTraceRoute(traceSpan, context.method, routeLabel);

  // Use a typed view of the matched route to avoid unsafe member access
  const matchedRoute = route as {
    params?: Record<string, unknown>;
    handler: (req: IRequest, res: IResponse) => Promise<void> | void;
    routePath?: string;
  };

  // Coerce route params (which may be undefined or non-string) into the
  // expected Record<string, string> shape required by Request.setParams.
  const safeParams: Record<string, string> = {};
  if (typeof matchedRoute.params === 'object' && matchedRoute.params !== null) {
    for (const [k, v] of Object.entries(matchedRoute.params)) {
      if (v === undefined || v === null) continue;
      safeParams[k] = typeof v === 'string' ? v : String(v);
    }
  }
  req.setParams(safeParams);

  const middlewareToRun = resolveMiddlewareForRoute(
    matchedRoute,
    globalMiddleware,
    routeMiddleware
  );

  let index = 0;
  const next = async (): Promise<void> => {
    if (index < middlewareToRun.length) {
      const mw = middlewareToRun[index++];
      await mw(req, res, next);
      return;
    }
    await matchedRoute.handler(req, res);
  };

  await next();
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

  // Scheduling runner (for long-running runtimes)
  const scheduleRunner = createScheduleRunner();

  const scheduleKernel: IScheduleKernel = Object.freeze({
    getContainer: () => container,
    getRouter: () => router,
  });

  // Register default middleware config
  globalMiddleware.push(...middlewareConfig.global);
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
