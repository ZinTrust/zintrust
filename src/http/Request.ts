/**
 * Request - HTTP Request wrapper
 * Wraps Node.js IncomingMessage with additional utilities
 */

import * as http from '@node-singletons/http';

type HeadParam = string | string[] | undefined;
type JwtPayload = import('/opt/homebrew/var/www/Sites/zintrust/src/index').JwtPayload;

export interface IRequest {
  sessionId: HeadParam;
  user: JwtPayload | undefined;
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

type RequestState = {
  sessionId: HeadParam;
  user: JwtPayload | undefined;
  params: Record<string, string>;
  body: unknown;
  bodyRecord: Record<string, unknown>;
};

const createRequestState = (req: http.IncomingMessage): RequestState => {
  return {
    sessionId: req.headers['x-session-id'],
    user: undefined,
    params: {},
    body: null,
    bodyRecord: {},
  };
};

const setBodyState = (state: RequestState, newBody: unknown): void => {
  state.body = newBody;
  state.bodyRecord = toBodyRecord(newBody);
};

const createRequestProperties = (
  state: RequestState,
  context: Record<string, unknown>
): Pick<IRequest, 'sessionId' | 'user' | 'params' | 'body' | 'context'> => {
  return {
    get sessionId(): HeadParam {
      return state.sessionId;
    },
    set sessionId(newSessionId: HeadParam) {
      state.sessionId = newSessionId;
    },

    get user(): JwtPayload | undefined {
      return state.user;
    },
    set user(newUser: JwtPayload | undefined) {
      state.user = newUser;
    },

    context,

    get params(): Record<string, string> {
      return state.params;
    },
    set params(newParams: Record<string, string>) {
      state.params = newParams;
    },

    get body(): Record<string, unknown> {
      return state.bodyRecord;
    },
    set body(newBody: Record<string, unknown>) {
      setBodyState(state, newBody);
    },
  };
};

const createRequestMethods = (
  req: http.IncomingMessage,
  query: Record<string, string | string[]>,
  state: RequestState
): Omit<IRequest, 'sessionId' | 'user' | 'params' | 'body' | 'context'> => {
  return {
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
      return state.params;
    },
    getParam(key: string): string | undefined {
      return state.params[key];
    },
    setParams(newParams: Record<string, string>): void {
      state.params = newParams;
    },

    getQuery(): Record<string, string | string[]> {
      return query;
    },
    getQueryParam(key: string): HeadParam {
      return query[key];
    },

    setBody(newBody: unknown): void {
      setBodyState(state, newBody);
    },
    getBody(): unknown {
      return state.body;
    },

    isJson(): boolean {
      const contentType = this.getHeader('content-type');
      return typeof contentType === 'string' && contentType.includes('application/json');
    },
    getRaw(): http.IncomingMessage {
      return req;
    },
  };
};

const createRequestApi = (
  req: http.IncomingMessage,
  query: Record<string, string | string[]>,
  context: Record<string, unknown>,
  state: RequestState
): IRequest => {
  return {
    ...createRequestProperties(state, context),
    ...createRequestMethods(req, query, state),
  };
};

export const Request = Object.freeze({
  /**
   * Create a new request instance
   */
  create(req: http.IncomingMessage): IRequest {
    const query = parseQuery(req.url ?? '/');
    const context: Record<string, unknown> = {};
    const state = createRequestState(req);

    return createRequestApi(req, query, context, state);
  },
});

export default Request;
