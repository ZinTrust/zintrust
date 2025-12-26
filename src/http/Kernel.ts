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

export interface IKernel {
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  handleRequest(req: IRequest, res: IResponse): Promise<void>;
  terminate(req: IRequest, res: IResponse): void;
  registerGlobalMiddleware(...middleware: Middleware[]): void;
  registerRouteMiddleware(name: string, middleware: Middleware): void;
  getRouter(): IRouter;
  getContainer(): IServiceContainer;
  getMiddlewareStack(): IMiddlewareStack;
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

/**
 * HTTP Kernel Factory
 */
const create = (router: IRouter, container: IServiceContainer): IKernel => {
  const globalMiddleware: Middleware[] = <Middleware[]>[];
  const routeMiddleware: Record<string, Middleware> = {};
  const middlewareStack = MiddlewareStack.create();

  // Register default middleware config
  globalMiddleware.push(...middlewareConfig.global);
  for (const [name, mw] of Object.entries(middlewareConfig.route)) {
    routeMiddleware[name] = mw;
  }

  /**
   * Handle incoming HTTP request (Node.js entry point)
   */
  const handle = async (nodeReq: IncomingMessage, nodeRes: ServerResponse): Promise<void> => {
    const req = Request.create(nodeReq);
    const res = Response.create(nodeRes);
    await handleRequest(req, res);
  };

  /**
   * Handle wrapped request/response
   */
  const handleRequest = async (req: IRequest, res: IResponse): Promise<void> => {
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

        const routeAny = route as unknown as { middleware?: unknown };
        const routeMiddlewareNames = Array.isArray(routeAny.middleware)
          ? routeAny.middleware.filter((m): m is string => typeof m === 'string')
          : [];

        const resolvedRouteMiddleware = routeMiddlewareNames
          .map((name) => routeMiddleware[name])
          .filter((mw): mw is Middleware => typeof mw === 'function');

        const middlewareToRun = [...globalMiddleware, ...resolvedRouteMiddleware];

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
  };
};

export const Kernel = Object.freeze({
  create,
});

export default Kernel;
