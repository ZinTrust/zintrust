/**
 * Base Controller
 * All controllers extend this class
 */

import { IRequest } from '@http/Request';
import { IResponse } from '@http/Response';

export interface IController {
  json(res: IResponse, data: unknown, statusCode?: number): void;
  error(res: IResponse, message: string, statusCode?: number): void;
  redirect(res: IResponse, url: string, statusCode?: number): void;
  param(req: IRequest, name: string): string | undefined;
  query(req: IRequest, name: string): string | string[] | undefined;
  body(req: IRequest): unknown;
}

/**
 * Base Controller
 * Sealed namespace for immutability
 */
export const Controller: IController = Object.freeze({
  /**
   * Send JSON response
   */
  json(res: IResponse, data: unknown, statusCode: number = 200): void {
    res.setStatus(statusCode).json(data);
  },

  /**
   * Send error response
   */
  error(res: IResponse, message: string, statusCode: number = 400): void {
    res.setStatus(statusCode).json({ error: message });
  },

  /**
   * Redirect response
   */
  redirect(res: IResponse, url: string, statusCode: number = 302): void {
    res.redirect(url, statusCode);
  },

  /**
   * Get route parameter
   */
  param(req: IRequest, name: string): string | undefined {
    return req.getParam(name);
  },

  /**
   * Get query parameter
   */
  query(req: IRequest, name: string): string | string[] | undefined {
    return req.getQueryParam(name);
  },

  /**
   * Get request body
   */
  body(req: IRequest): unknown {
    return req.getBody();
  },
});
