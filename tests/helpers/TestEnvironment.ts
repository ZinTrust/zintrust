import { ServiceContainer, type IServiceContainer } from '@/container/ServiceContainer';
import { Kernel, type IKernel } from '@/http/Kernel';
import { Request } from '@/http/Request';
import { Response } from '@/http/Response';
import { Router, type IRouter } from '@core-routes/Router';
import type * as http from '@node-singletons/http';

export type TestHeaders = Record<string, string>;

export type TestRequestInput = {
  method: string;
  path: string;
  headers?: TestHeaders;
  body?: unknown;
  validated?: {
    body?: unknown;
    query?: unknown;
    params?: unknown;
    headers?: unknown;
  };
};

export type TestResponse = {
  status: number;
  headers: Record<string, string | string[]>;
  bodyText: string;
  json: unknown;
  cookies: Record<string, string>;
};

export type TestEnvironmentOptions = {
  router?: IRouter;
  container?: IServiceContainer;
  registerRoutes?: (router: IRouter) => void;
};

type NodeResStub = {
  statusCode: number;
  writableEnded: boolean;
  setHeader: (name: string, value: string | string[]) => void;
  end: (data?: string | Buffer) => void;
};

const lowerCaseHeaders = (headers: TestHeaders | undefined): Record<string, string> => {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = v;
  return out;
};

const createNodeResStub = (): {
  raw: NodeResStub;
  headers: Record<string, string | string[]>;
  getBody: () => string;
} => {
  const headers: Record<string, string | string[]> = {};
  let body = '';

  const raw: NodeResStub = {
    statusCode: 200,
    writableEnded: false,
    setHeader(name, value) {
      headers[name] = value;
    },
    end(data) {
      raw.writableEnded = true;
      if (data === undefined) return;
      body += Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
    },
  };

  return { raw, headers, getBody: () => body };
};

const parseJsonBody = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

const cookiesFromSetCookieHeader = (setCookie: unknown): Record<string, string> => {
  const values: string[] = [];
  if (Array.isArray(setCookie)) {
    values.push(...setCookie.map(String));
  } else if (setCookie) {
    values.push(String(setCookie));
  }

  const result: Record<string, string> = {};

  for (const cookie of values) {
    const firstPart = cookie.split(';')[0] ?? '';
    const idx = firstPart.indexOf('=');
    if (idx <= 0) continue;
    const name = firstPart.slice(0, idx).trim();
    const value = firstPart.slice(idx + 1).trim();
    if (name !== '') result[name] = value;
  }

  return result;
};

const createOverridableContainer = (
  base: IServiceContainer
): IServiceContainer & {
  swapSingleton: <T>(key: string, instance: T) => () => void;
  swapFactory: <T>(key: string, factory: () => T) => () => void;
} => {
  type OverrideBinding =
    | { kind: 'singleton'; value: unknown }
    | { kind: 'factory'; factory: () => unknown };

  const overrides = new Map<string, OverrideBinding>();

  const swapSingleton = <T>(key: string, instance: T): (() => void) => {
    overrides.set(key, { kind: 'singleton', value: instance });
    return () => {
      overrides.delete(key);
    };
  };

  const swapFactory = <T>(key: string, factory: () => T): (() => void) => {
    overrides.set(key, { kind: 'factory', factory });
    return () => {
      overrides.delete(key);
    };
  };

  return {
    bind: (key, factory) => base.bind(key, factory),
    singleton: (key, factoryOrInstance) => base.singleton(key, factoryOrInstance as any),
    resolve: (key) => {
      const override = overrides.get(key);
      if (override) {
        return (override.kind === 'singleton' ? override.value : override.factory()) as any;
      }
      return base.resolve(key);
    },
    has: (key) => overrides.has(key) || base.has(key),
    get: (key) => {
      const override = overrides.get(key);
      if (override) {
        return (override.kind === 'singleton' ? override.value : override.factory()) as any;
      }
      return base.get(key);
    },
    flush: () => {
      overrides.clear();
      base.flush();
    },
    swapSingleton,
    swapFactory,
  };
};

export interface ITestEnvironment {
  router: IRouter;
  container: IServiceContainer;
  kernel: IKernel;
  request(input: TestRequestInput): Promise<TestResponse>;
  swapSingleton<T>(key: string, instance: T): () => void;
  swapFactory<T>(key: string, factory: () => T): () => void;
}

export const TestEnvironment = Object.freeze({
  create(options: TestEnvironmentOptions = {}): ITestEnvironment {
    const router = options.router ?? Router.createRouter();
    if (typeof options.registerRoutes === 'function') options.registerRoutes(router);

    const baseContainer = options.container ?? ServiceContainer.create();
    const container = createOverridableContainer(baseContainer);

    const kernel = Kernel.create(router, container);

    return {
      router,
      container,
      kernel,
      async request(input: TestRequestInput): Promise<TestResponse> {
        const nodeReq = {
          method: input.method,
          url: input.path,
          headers: lowerCaseHeaders(input.headers),
        } as unknown as http.IncomingMessage;

        const nodeRes = createNodeResStub();

        const req = Request.create(nodeReq);
        if (input.body !== undefined) req.setBody(input.body);
        if (input.validated !== undefined) req.validated = input.validated;

        const res = Response.create(nodeRes.raw as unknown as http.ServerResponse);

        await kernel.handleRequest(req, res);

        const bodyText = nodeRes.getBody();
        const headers = nodeRes.headers;

        return {
          status: nodeRes.raw.statusCode,
          headers,
          bodyText,
          json: parseJsonBody(bodyText),
          cookies: cookiesFromSetCookieHeader(headers['Set-Cookie']),
        };
      },
      swapSingleton: container.swapSingleton,
      swapFactory: container.swapFactory,
    };
  },
});
