/**
 * Request - HTTP Request wrapper
 * Wraps Node.js IncomingMessage with additional utilities
 */

import type { FileUploadOptions, IFileUploadHandler, UploadedFile } from '@http/FileUpload';
import { FileUpload } from '@http/FileUpload';
import type * as http from '@node-singletons/http';
import type { JwtPayload } from '@security/JwtManager';

type HeadParam = string | string[] | undefined;

export interface IRequest {
  sessionId: HeadParam;
  user: JwtPayload | undefined;
  params: Record<string, string>;
  body: Record<string, unknown>;
  validated: {
    body?: unknown;
    query?: unknown;
    params?: unknown;
    headers?: unknown;
  };
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

  // File upload methods
  file(fieldName: string, options?: FileUploadOptions): UploadedFile | undefined;
  files(fieldName: string, options?: FileUploadOptions): UploadedFile[];
  hasFile(fieldName: string): boolean;
  fileUpload(): IFileUploadHandler;

  /**
   * Unified data access
   * Returns merged object from Body > Path Params > Query Params
   */
  data(): Record<string, unknown>;

  /**
   * Get specific field from unified data
   */
  get<T = unknown>(key: string, defaultValue?: T): T;
}

export type ValidatedRequest<
  TBody = unknown,
  TQuery = unknown,
  TParams = unknown,
  THeaders = unknown,
> = Omit<IRequest, 'validated'> & {
  validated: {
    body: TBody;
    query: TQuery;
    params: TParams;
    headers: THeaders;
  };
};

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
  validated: {
    body?: unknown;
    query?: unknown;
    params?: unknown;
    headers?: unknown;
  };
  _cachedData?: Record<string, unknown>;
};

const createRequestState = (req: http.IncomingMessage): RequestState => {
  return {
    sessionId: req.headers['x-session-id'],
    user: undefined,
    params: {},
    body: null,
    bodyRecord: {},
    validated: {},
    _cachedData: undefined,
  };
};

const setBodyState = (state: RequestState, newBody: unknown): void => {
  state.body = newBody;
  state.bodyRecord = toBodyRecord(newBody);
  state._cachedData = undefined; // Clear cache when body changes
};

const createRequestProperties = (
  state: RequestState,
  context: Record<string, unknown>
): Pick<IRequest, 'sessionId' | 'user' | 'params' | 'body' | 'validated' | 'context'> => {
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

    get validated(): IRequest['validated'] {
      return state.validated;
    },
    set validated(v: IRequest['validated']) {
      state.validated = v;
    },
  };
};

/**
 * Create HTTP method helpers
 */
function createHttpHelpers(req: http.IncomingMessage): {
  getMethod: () => string;
  getPath: () => string;
  getHeaders: () => http.IncomingHttpHeaders;
  headers: http.IncomingHttpHeaders;
  getHeader: (name: string) => HeadParam;
} {
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
  };
}

/**
 * Create parameter helpers
 */
function createParameterHelpers(
  state: RequestState,
  query: Record<string, string | string[]>
): {
  getParams: () => Record<string, string>;
  getParam: (key: string) => string | undefined;
  setParams: (newParams: Record<string, string>) => void;
  getQuery: () => Record<string, string | string[]>;
  getQueryParam: (key: string) => HeadParam;
} {
  return {
    getParams(): Record<string, string> {
      return state.params;
    },
    getParam(key: string): string | undefined {
      return state.params[key];
    },
    setParams(newParams: Record<string, string>): void {
      state.params = newParams;
      state._cachedData = undefined; // Clear cache when params change
    },
    getQuery(): Record<string, string | string[]> {
      return query;
    },
    getQueryParam(key: string): HeadParam {
      return query[key];
    },
  };
}

/**
 * Create body helpers
 */
function createBodyHelpers(
  state: RequestState,
  req: http.IncomingMessage
): {
  setBody: (newBody: unknown) => void;
  getBody: () => unknown;
  isJson: () => boolean;
} {
  return {
    setBody(newBody: unknown): void {
      setBodyState(state, newBody);
    },
    getBody(): unknown {
      return state.body;
    },
    isJson(): boolean {
      const contentType = req.headers['content-type'];
      return typeof contentType === 'string' && contentType.includes('application/json');
    },
  };
}

/**
 * Create file upload helpers
 */
function createFileHelpers(getCompleteRequest: () => IRequest): {
  file: (fieldName: string, options?: FileUploadOptions) => UploadedFile | undefined;
  files: (fieldName: string, options?: FileUploadOptions) => UploadedFile[];
  hasFile: (fieldName: string) => boolean;
  fileUpload: () => IFileUploadHandler;
} {
  return {
    file(fieldName: string, options?: FileUploadOptions) {
      const handler = FileUpload.createHandler(getCompleteRequest());
      return handler.file(fieldName, options);
    },
    files(fieldName: string, options?: FileUploadOptions) {
      const handler = FileUpload.createHandler(getCompleteRequest());
      return handler.files(fieldName, options);
    },
    hasFile(fieldName: string): boolean {
      const handler = FileUpload.createHandler(getCompleteRequest());
      return handler.hasFile(fieldName);
    },
    fileUpload() {
      return FileUpload.createHandler(getCompleteRequest());
    },
  };
}

/**
 * Create unified data helpers
 */
function createDataHelpers(
  state: RequestState,
  query: Record<string, string | string[]>
): {
  data: () => Record<string, unknown>;
  get: <T>(key: string, defaultValue?: T) => T;
} {
  return {
    data(): Record<string, unknown> {
      // Precedence: Body > Path Params > Query Params
      state._cachedData ??= {
        ...query,
        ...state.params,
        ...state.bodyRecord,
      };
      return state._cachedData;
    },
    get<T = unknown>(key: string, defaultValue?: T): T {
      const data = this.data();
      return (data[key] as T) ?? (defaultValue as T);
    },
  };
}

const createRequestMethods = (
  req: http.IncomingMessage,
  query: Record<string, string | string[]>,
  state: RequestState,
  context: Record<string, unknown>
): Omit<IRequest, 'sessionId' | 'user' | 'params' | 'body' | 'validated' | 'context'> => {
  return {
    ...createHttpHelpers(req),
    ...createParameterHelpers(state, query),
    ...createBodyHelpers(state, req),
    ...createFileHelpers(() => {
      // Create a complete request object for file handlers
      const completeRequest = {
        ...createHttpHelpers(req),
        ...createParameterHelpers(state, query),
        ...createBodyHelpers(state, req),
        ...createDataHelpers(state, query),
        getRaw: () => req,
        sessionId: state.sessionId,
        user: state.user,
        params: state.params,
        body: state.body,
        validated: state.validated,
        context,
      } as IRequest;
      return completeRequest;
    }),
    ...createDataHelpers(state, query),
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
    ...createRequestMethods(req, query, state, context),
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
