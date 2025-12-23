/**
 * Request - HTTP Request wrapper
 * Wraps Node.js IncomingMessage with additional utilities
 */

import * as http from 'node:http';

type HeadParam = string | string[] | undefined;

export interface IRequest {
  params: Record<string, string>;
  body: Record<string, unknown>;
  getMethod(): string;
  getPath(): string;
  getHeaders(): http.IncomingHttpHeaders;
  readonly headers: http.IncomingHttpHeaders;
  getHeader(name: string): HeadParam;
  getParams(): Record<string, string>;
  getParam(key: string): string | undefined;
  setParams(params: Record<string, string>): void;
  getQuery(): Record<string, string | string[]>;
  getQueryParam(key: string): HeadParam;
  setBody(body: unknown): void;
  getBody(): unknown;
  isJson(): boolean;
  getRaw(): http.IncomingMessage;
  context: Record<string, unknown>;
}

/**
 * Request - HTTP Request wrapper
 * Refactored to Functional Object pattern
 */
/**
 * Parse query string from URL
 */
const parseQuery = (urlStr: string): Record<string, string | string[]> => {
  const query: Record<string, string | string[]> = {};
  const url = new URL(urlStr, 'http://localhost');
  url.searchParams.forEach((value, key) => {
    const existing = query[key];
    if (existing === undefined) {
      query[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      query[key] = [existing, value];
    }
  });
  return query;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const toBodyRecord = (value: unknown): Record<string, unknown> => {
  return isPlainObject(value) ? value : {};
};

export const Request = Object.freeze({
  /**
   * Create a new request instance
   */
  create(req: http.IncomingMessage): IRequest {
    const query = parseQuery(req.url ?? '/');
    const context: Record<string, unknown> = {};

    let paramsState: Record<string, string> = {};
    let bodyState: unknown = null;
    let bodyRecordState: Record<string, unknown> = {};

    return {
      context,
      get params(): Record<string, string> {
        return paramsState;
      },
      set params(newParams: unknown) {
        if (isPlainObject(newParams)) {
          paramsState = newParams as unknown as Record<string, string>;
        }
      },
      get body(): Record<string, unknown> {
        return bodyRecordState;
      },
      set body(newBody: Record<string, unknown>) {
        bodyState = newBody;
        bodyRecordState = toBodyRecord(newBody);
      },
      getMethod(): string {
        return req.method ?? 'GET';
      },
      getPath(): string {
        const url = req.url;
        return url === undefined ? '/' : url.split('?')[0];
      },
      getHeaders(): http.IncomingHttpHeaders {
        return req.headers;
      },
      get headers(): http.IncomingHttpHeaders {
        return req.headers;
      },
      getHeader(name: string): HeadParam {
        return req.headers[name.toLowerCase()];
      },
      getParams(): Record<string, string> {
        return paramsState;
      },
      getParam(key: string): string | undefined {
        return paramsState[key];
      },
      setParams(newParams: Record<string, string>): void {
        paramsState = newParams;
      },
      getQuery(): Record<string, string | string[]> {
        return query;
      },
      getQueryParam(key: string): HeadParam {
        return query[key];
      },
      setBody(newBody: unknown): void {
        bodyState = newBody;
        bodyRecordState = toBodyRecord(newBody);
      },
      getBody(): unknown {
        return bodyState;
      },
      isJson(): boolean {
        const contentType = this.getHeader('content-type');
        return typeof contentType === 'string' && contentType.includes('application/json');
      },
      getRaw(): http.IncomingMessage {
        return req;
      },
    };
  },
});

export default Request;
