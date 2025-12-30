/**
 * HTTP Kernel - Request handling and middleware pipeline
 */

import { Logger } from '@config/logger';
import { middlewareConfig } from '@config/middleware';
import { IServiceContainer } from '@container/ServiceContainer';
import { ErrorResponse } from '@http/ErrorResponse';
import { IRequest, Request } from '@http/Request';
import { RequestContext } from '@http/RequestContext';
import { IResponse, Response } from '@http/Response';
import { IMiddlewareStack, Middleware, MiddlewareStack } from '@middleware/MiddlewareStack';
import type { IncomingMessage, ServerResponse } from '@node-singletons/http';
import { IRouter, Router } from '@routing/Router';

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

const createHandleRequest = (
  router: IRouter,
  globalMiddleware: Middleware[],
  routeMiddleware: Record<string, Middleware>
): ((req: IRequest, res: IResponse) => Promise<void>) => {
  return async (req: IRequest, res: IResponse): Promise<void> => {
    const context = RequestContext.create(req);
    try {
      await RequestContext.run(context, async () => {
        Logger.info(`[${req.getMethod()}] ${req.getPath()}`);

        // Match route
        const route = Router.match(router, req.getMethod(), req.getPath());

        if (!route) {
          res.setStatus(404).json(ErrorResponse.notFound('Route', context.requestId));
          return;
        }

        req.setParams(route.params);

        const middlewareToRun = resolveMiddlewareForRoute(route, globalMiddleware, routeMiddleware);

        let index = 0;
        const next = async (): Promise<void> => {
          if (index < middlewareToRun.length) {
            const mw = middlewareToRun[index++];
            await mw(req, res, next);
            return;
          }
          await route.handler(req, res);
        };

        await next();
      });
    } catch (error) {
      Logger.error('Kernel error:', error as Error);
      if (!isWritableEnded(res)) {
        res
          .setStatus(500)
          .json(ErrorResponse.internalServerError('Internal server error', context.requestId));
      }
    } finally {
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
