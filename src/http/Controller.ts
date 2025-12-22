/**
 * Base Controller
 * All controllers extend this class
 */

import { Request } from '@http/Request';
import { Response } from '@http/Response';

export class Controller {
  /**
   * Send JSON response
   */
  protected json(data: unknown, statusCode: number = 200): (_req: Request, res: Response) => void {
    return (_req: Request, res: Response) => {
      res.setStatus(statusCode).json(data);
    };
  }

  /**
   * Send error response
   */
  protected error(
    message: string,
    statusCode: number = 400
  ): (_req: Request, res: Response) => void {
    return (_req: Request, res: Response) => {
      res.setStatus(statusCode).json({ error: message });
    };
  }

  /**
   * Redirect response
   */
  protected redirect(
    url: string,
    statusCode: number = 302
  ): (_req: Request, res: Response) => void {
    return (_req: Request, res: Response) => {
      res.redirect(url, statusCode);
    };
  }

  /**
   * Get route parameter
   */
  protected param(req: Request, name: string): string | undefined {
    return req.getParam(name);
  }

  /**
   * Get query parameter
   */
  protected query(req: Request, name: string): string | string[] | undefined {
    return req.getQueryParam(name);
  }

  /**
   * Get request body
   */
  protected body(req: Request): unknown {
    return req.getBody();
  }
}
