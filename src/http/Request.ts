/**
 * Request - HTTP Request wrapper
 * Wraps Node.js IncomingMessage with additional utilities
 */

import * as http from 'node:http';

export class Request {
  private readonly req: http.IncomingMessage;
  private params: Record<string, string> = {};
  private query: Record<string, string | string[]> = {};
  private body: unknown = null;
  public context: Record<string, unknown> = {};

  constructor(req: http.IncomingMessage) {
    this.req = req;
    this.parseQuery();
  }

  /**
   * Get request method (GET, POST, etc.)
   */
  public getMethod(): string {
    return this.req.method ?? 'GET';
  }

  /**
   * Get request path
   */
  public getPath(): string {
    const url = this.req.url;
    return url === undefined ? '/' : url.split('?')[0];
  }

  /**
   * Get request headers
   */
  public getHeaders(): http.IncomingHttpHeaders {
    return this.req.headers;
  }

  /**
   * Get headers as property (for middleware compatibility)
   */
  public get headers(): http.IncomingHttpHeaders {
    return this.req.headers;
  }

  /**
   * Get a specific header
   */
  public getHeader(name: string): string | string[] | undefined {
    return this.req.headers[name.toLowerCase()];
  }

  /**
   * Get route parameters
   */
  public getParams(): Record<string, string> {
    return this.params;
  }

  /**
   * Get a route parameter
   */
  public getParam(key: string): string | undefined {
    return this.params[key];
  }

  /**
   * Set route parameters
   */
  public setParams(params: Record<string, string>): void {
    this.params = params;
  }

  /**
   * Get query parameters
   */
  public getQuery(): Record<string, string | string[]> {
    return this.query;
  }

  /**
   * Get a query parameter
   */
  public getQueryParam(key: string): string | string[] | undefined {
    return this.query[key];
  }

  /**
   * Set request body
   */
  public setBody(body: unknown): void {
    this.body = body;
  }

  /**
   * Get request body
   */
  public getBody(): unknown {
    return this.body;
  }

  /**
   * Check if request is JSON
   */
  public isJson(): boolean {
    const contentType = this.getHeader('content-type');
    return typeof contentType === 'string' && contentType.includes('application/json');
  }

  /**
   * Get the raw Node.js IncomingMessage
   */
  public getRaw(): http.IncomingMessage {
    return this.req;
  }

  /**
   * Parse query string from URL
   */
  private parseQuery(): void {
    const url = new URL(this.req.url ?? '/', 'http://localhost');
    url.searchParams.forEach((value, key) => {
      const existing = this.query[key];
      if (existing === undefined) {
        this.query[key] = value;
      } else if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        this.query[key] = [existing, value];
      }
    });
  }
}
