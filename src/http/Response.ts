/**
 * Response - HTTP Response wrapper
 * Wraps Node.js ServerResponse with additional utilities
 */

import * as http from 'node:http';

export class Response {
  private readonly res: http.ServerResponse;
  private statusCodeValue = 200;
  private headers: Record<string, string> = {};
  public locals: Record<string, unknown> = {};

  constructor(res: http.ServerResponse) {
    this.res = res;
    this.setHeader('Content-Type', 'application/json');
  }

  /**
   * Set response status code
   */
  public setStatus(code: number): this {
    this.statusCodeValue = code;
    this.res.statusCode = code;
    return this;
  }

  /**
   * Get response status code
   */
  public getStatus(): number {
    return this.statusCodeValue;
  }

  /**
   * Get status code as property (for middleware compatibility)
   */
  public get statusCode(): number {
    return this.statusCodeValue;
  }

  /**
   * Set a response header
   */
  public setHeader(name: string, value: string): this {
    this.headers[name] = value;
    this.res.setHeader(name, value);
    return this;
  }

  /**
   * Get a response header
   */
  public getHeader(name: string): string | undefined {
    return this.headers[name];
  }

  /**
   * Send JSON response
   */
  public json(data: unknown): void {
    this.setHeader('Content-Type', 'application/json');
    this.res.end(JSON.stringify(data));
  }

  /**
   * Send text response
   */
  public text(text: string): void {
    this.setHeader('Content-Type', 'text/plain');
    this.res.end(text);
  }

  /**
   * Send HTML response
   */
  public html(html: string): void {
    this.setHeader('Content-Type', 'text/html');
    this.res.end(html);
  }

  /**
   * Send raw response
   */
  public send(data: string | Buffer): void {
    this.res.end(data);
  }

  /**
   * Redirect to another URL
   */
  public redirect(url: string, statusCode: number = 302): void {
    this.setStatus(statusCode);
    this.setHeader('Location', url);
    this.res.end();
  }

  /**
   * Get the raw Node.js ServerResponse
   */
  public getRaw(): http.ServerResponse {
    return this.res;
  }
}
