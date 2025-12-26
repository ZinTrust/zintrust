/**
 * Response - HTTP Response wrapper
 * Wraps Node.js ServerResponse with additional utilities
 */

import { HTTP_HEADERS, MIME_TYPES } from '@config/constants';
import * as http from '@node-singletons/http';

export interface IResponse {
  status(code: number): IResponse;
  setStatus(code: number): IResponse;
  getStatus(): number;
  readonly statusCode: number;
  setHeader(name: string, value: string): IResponse;
  getHeader(name: string): string | undefined;
  json(data: unknown): void;
  text(text: string): void;
  html(html: string): void;
  send(data: string | Buffer): void;
  redirect(url: string, statusCode?: number): void;
  getRaw(): http.ServerResponse;
  locals: Record<string, unknown>;
}

/**
 * Response - HTTP Response wrapper
 * Refactored to Functional Object pattern
 */
export const Response = Object.freeze({
  /**
   * Create a new response instance
   */
  create(res: http.ServerResponse): IResponse {
    let statusCodeValue = 200;
    const headers: Record<string, string> = {};
    const locals: Record<string, unknown> = {};

    const response: IResponse = {
      locals,
      status(code: number): IResponse {
        return this.setStatus(code);
      },
      setStatus(code: number): IResponse {
        statusCodeValue = code;
        res.statusCode = code;
        return this;
      },
      getStatus(): number {
        return statusCodeValue;
      },
      get statusCode(): number {
        return statusCodeValue;
      },
      setHeader(name: string, value: string): IResponse {
        headers[name] = value;
        res.setHeader(name, value);
        return this;
      },
      getHeader(name: string): string | undefined {
        return headers[name];
      },
      json(data: unknown): void {
        this.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.JSON);
        res.end(JSON.stringify(data));
      },
      text(text: string): void {
        this.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.TEXT);
        res.end(text);
      },
      html(html: string): void {
        this.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.HTML);
        res.end(html);
      },
      send(data: string | Buffer): void {
        res.end(data);
      },
      redirect(url: string, statusCode: number = 302): void {
        this.setStatus(statusCode);
        this.setHeader('Location', url);
        res.end();
      },
      getRaw(): http.ServerResponse<http.IncomingMessage> {
        return res;
      },
    };

    response.setHeader(HTTP_HEADERS.CONTENT_TYPE, MIME_TYPES.JSON);

    return response;
  },
});

export default Response;
