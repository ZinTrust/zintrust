/**
 * HTTP Kernel - Request handling and middleware pipeline
 */

import { Logger } from '@config/logger';
import { IServiceContainer } from '@container/ServiceContainer';
import { IRequest, Request } from '@http/Request';
import { IResponse, Response } from '@http/Response';
import { IMiddlewareStack, Middleware, MiddlewareStack } from '@middleware/MiddlewareStack';
import { IRouter, Router } from '@routing/Router';
import { IncomingMessage, ServerResponse } from 'node:http';

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

/**
 * HTTP Kernel Factory
 */
const create = (router: IRouter, container: IServiceContainer): IKernel => {
  const globalMiddleware: Middleware[] = <Middleware[]>[];
  const routeMiddleware: Record<string, Middleware> = {};
  const middlewareStack = MiddlewareStack.create();

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
    try {
      Logger.info(`[${req.getMethod()}] ${req.getPath()}`);

      // Match route
      const route = Router.match(router, req.getMethod(), req.getPath());

      if (!route) {
        res.setStatus(404).json({ error: 'Not Found' });
        return;
      }

      // Execute middleware and handler
      await route.handler(req, res);
    } catch (error) {
      Logger.error('Kernel error:', error as Error);
      res.setStatus(500).json({ error: 'Internal Server Error' });
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
