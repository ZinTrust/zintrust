import { IRequest } from '@http/Request';
import { IResponse } from '@http/Response';

/**
 * Middleware Stack
 * Manages middleware execution pipeline
 */

export type Middleware = (
  req: IRequest,
  res: IResponse,
  next: () => Promise<void>
) => Promise<void>;

export interface IMiddlewareStack {
  register(name: string, handler: Middleware): void;
  execute(request: IRequest, response: IResponse, only?: string[] | Middleware[]): Promise<void>;
  getMiddlewares(): Array<{ name: string; handler: Middleware }>;
}

/**
 * Middleware Stack
 * Refactored to Functional Object pattern
 */
export const MiddlewareStack = Object.freeze({
  /**
   * Create a new middleware stack instance
   */
  create(): IMiddlewareStack {
    const middlewares: Array<{ name: string; handler: Middleware }> = [];

    return {
      /**
       * Register middleware
       */
      register(name: string, handler: Middleware): void {
        middlewares.push({ name, handler });
      },

      /**
       * Execute middleware stack
       */
      async execute(request: IRequest, response: IResponse, only?: string[]): Promise<void> {
        const filteredMiddlewares = only
          ? middlewares.filter((m) => only.includes(m.name))
          : middlewares;

        let index = 0;

        const next = async (): Promise<void> => {
          if (index >= filteredMiddlewares.length) return;
          const middleware = filteredMiddlewares[index++];
          await middleware.handler(request, response, next);
        };

        await next();
      },

      /**
       * Get all middleware
       */
      getMiddlewares(): Array<{ name: string; handler: Middleware }> {
        return middlewares;
      },
    };
  },
});

export default MiddlewareStack;
