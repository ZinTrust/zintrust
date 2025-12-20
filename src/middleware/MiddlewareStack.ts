/**
 * Middleware Stack
 * Manages middleware execution pipeline
 */

import { Request } from '@http/Request';
import { Response } from '@http/Response';

export type Middleware = (req: Request, res: Response, next: () => Promise<void>) => Promise<void>;

export class MiddlewareStack {
  private readonly middlewares: Array<{ name: string; handler: Middleware }> = [];

  /**
   * Register middleware
   */
  public register(name: string, handler: Middleware): void {
    this.middlewares.push({ name, handler });
  }

  /**
   * Execute middleware stack
   */
  public async execute(request: Request, response: Response, only?: string[]): Promise<void> {
    const middlewares = only
      ? this.middlewares.filter((m) => only.includes(m.name))
      : this.middlewares;

    let index = 0;

    const next = async (): Promise<void> => {
      if (index >= middlewares.length) return;
      const middleware = middlewares[index++];
      await middleware.handler(request, response, next);
    };

    await next();
  }

  /**
   * Get all middleware
   */
  public getMiddlewares(): Array<{ name: string; handler: Middleware }> {
    return this.middlewares;
  }
}
