# Gateway Routing Architecture

This document describes a gateway-first microservice dispatch pattern that supports both a unified monolith mode and a distributed microservice mode from the same codebase. Any application adopting this pattern can switch between the two modes through environment configuration with no code changes.

---

## Overview

The architecture has three main layers:

1. **Gateway** — the single public-facing entry point. Every inbound HTTP request arrives at the gateway first.
2. **Route Map** — a static, compile-time table that maps URL path patterns to named downstream services.
3. **Service Manifest** — a runtime registry of all available services, their discovery metadata, and their route loader functions.

Whether a request ultimately runs inside the same process (monolith) or is forwarded to a separate worker/container (microservice) is transparent to the caller. Both paths share the same public API surface.

---

## Modes Of Operation

### Monolith Mode

When the `RUN_AS_MONOLITH` flag is enabled, the application can serve selected gateway-owned and service-owned routes directly from the same process. The gateway does not need a downstream network hop for routes that are mounted into the local runtime, and certain compatibility endpoints can be wired straight to their local controller handlers instead of passing through the proxy dispatcher.

```
Client → Gateway Router → (same-process) Controller Or Service Route → Response
```

This mode is enabled explicitly through environment configuration. It is useful for local development, staged extraction, and hybrid deployments where only part of the service surface is running out of process.

### Microservice Mode

When `RUN_AS_MONOLITH` is disabled, the gateway resolves the target service from the route map and forwards the full request to the downstream service over HTTP (or a direct runtime binding, see below).

```
Client → Gateway → Route Map Lookup → Service Registry → Downstream Service → Response
```

The gateway adds internal tracing headers and strips unsafe forwarded headers before the request leaves the process.

---

## The Route Map

The route map is a statically defined, ordered list of rules. Each rule pairs a logical service name with one or more URL path `RegExp` patterns.

```
Rule {
  service: string         // logical service name, e.g. "user", "billing"
  summary: string         // human-readable description for the API explorer
  patterns: RegExp[]      // matched against the stripped path (no leading slash, no query string)
}
```

### How Matching Works

1. The gateway trims leading and trailing slashes, strips the base API prefix (e.g. `/api/v1/`), and can also normalize legacy nested aliases such as `/api/...` before matching.
2. It iterates the rules list in order and returns the **first** rule whose `patterns` array contains a match.
3. If no rule matches, the gateway responds with `404` and a JSON error body.
4. If a rule matches but the named service is not registered at runtime, the gateway responds with `501`.

Rule ordering matters. More specific patterns (exact slug matches) should appear before broad catch-all patterns (e.g. `^auth(?:\/.*)?$`).

---

## The Service Manifest

The service manifest is a typed array loaded at bootstrap. Each entry describes one service:

```
ManifestEntry {
  id: string               // unique dot-notation identifier, e.g. "platform/billing"
  domain: string           // logical domain grouping, e.g. "platform"
  name: string             // short service name, matches the route map service key
  configRoot: string       // relative path to the service config directory
  prefix: string           // optional URL mount prefix for the service router
  port: number             // port used when running as a standalone Node process
  monolithEnabled: boolean // whether this service can be loaded in monolith mode
  loadRoutes: () => Promise<{ registerRoutes: (router) => void }>
                           // dynamic import of the service route file
}
```

The gateway filters out its own entry from the manifest before registering downstream services, preventing circular self-registration.

On first use, the gateway can also use the manifest as a runtime bootstrap source: it ensures the runtime is loaded, registers each service with the in-memory service manager, and in Node-style execution it may start the services lazily from the manifest metadata.

---

## Request Dispatch Flow

```
Inbound Request
      │
      ▼
[1] CORS preflight check
      │ (OPTIONS → 200, stop)
      ▼
[2] Route Map: match(path)
      │ (no match → 404)
      ▼
[3] Service Registry: ensure runtime + register services if needed
      │
      ▼
[4] Service Registry: is the service registered?
      │ (not registered → 501)
      ▼
[5] Runtime: Workers or Node?
      │
      ├─ Workers runtime ──► [6a] Worker Service Binding available?
      │                            │
      │                            ├─ Yes → forward via binding (no network hop)
      │                            └─ No  → fall through to manifest call
      │
      └─ Node runtime ─────► [6b] MicroserviceManager HTTP call
                                   (host resolved from manifest port)
      │
      ▼
[7] Normalize response (extract statusCode + data)
      │
      ▼
[8] Return proxied response to client
      │ (on error → 502)
```

### Worker Service Bindings (Cloudflare Workers Runtime)

When running on a Workers-compatible edge runtime, the gateway attempts to resolve each downstream service through a **service binding** before falling back to a network call. Binding names are derived from the service name with a set of candidate suffixes:

```
BILLING_SERVICE
PLATFORM_BILLING_SERVICE
PLATFORM_BILLING
BILLING
```

The first environment binding whose name matches one of the candidates is used. Requests forwarded through bindings are processed in-process at the edge with no TCP overhead. An `X-Internal-Token` header and an `X-Internal-Service` header are injected so downstream services can verify the request origin.

If the binding is missing, throws, or returns a known local-development placeholder response, the gateway falls back to the manifest-driven service call instead of failing immediately. This allows local edge-style runtimes to keep working even when a particular bound service is not currently attached to a live dev session.

---

## Middleware Layers

The gateway applies middleware at the route registration level, not inside the dispatch function. This keeps the dispatch controller stateless and composable.

Typical middleware stack for a standard API route:

| Middleware | Purpose |
|---|---|
| XSS | Sanitize incoming request headers and body |
| runfrom | Enforce allowed-origin or environment-specific call guards |
| rateLimit | Per-IP or per-key throttle |

Specialised routes can substitute or extend these layers:

| Middleware | Purpose |
|---|---|
| adminip | Restrict to known admin IP ranges |
| authRateLimit | Stricter throttle for credential endpoints |
| optionalJwt | Attach a user context if a valid token is present, but do not block anonymous requests |

Services register their own per-route middleware independently. The gateway does not copy service-level middleware declarations — each service route file is the single source of truth for its own middleware.

Gateway-owned compatibility endpoints can also use dedicated stacks that differ from the general API proxy route. Common examples are:

| Route Family | Typical Purpose |
|---|---|
| compatibility aliases | Preserve legacy public entry points while reusing the same downstream service contract |
| broadcast auth aliases | Support duplicated or versioned channel-auth URLs through one normalized downstream target |
| websocket fallback routes | Preserve legacy socket upgrade and fallback endpoints when a unified socket runtime is disabled |
| local preview and debug routes | Expose non-production helpers that never enter the generic proxy flow |

---

## Monolith Bootstrap

In monolith mode, the bootstrap process:

1. Iterates the service manifest.
2. Calls `loadRoutes()` for each entry where `monolithEnabled: true`.
3. Registers the returned route set under the gateway router.
4. Lets the router match mounted local routes directly, while still allowing selected gateway-owned compatibility endpoints to choose between direct local handlers and proxy dispatch.

This means the same route file that a standalone microservice uses for its own router is also what the monolith loads. No duplication is needed.

---

## Health And Observability Endpoints

The gateway exposes a small set of management endpoints that do not go through the route map:

| Path | Description |
|---|---|
| `GET /` | Gateway root status and registered service list |
| `GET /health` | Liveness check with service registry state |
| `GET /api/v1` | JSON route map explorer (all rules and pattern sources) |
| `POST /broadcasting/auth` and aliases | Gateway-owned compatibility auth entry points for realtime channels |
| `GET /mail/preview` and variants | Local preview helpers that bypass the generic dispatch path |
| `GET /<domain>/<service>/` | Per-service root status |
| `GET /<domain>/<service>/health` | Per-service health check |

---

## Error Response Contract

All gateway-originated errors return JSON with a consistent shape so clients can distinguish gateway failures from downstream service errors:

```json
{
  "status": 0,
  "service": "gateway",
  "msg": "<human-readable reason>",
  "targetService": "<service name, if applicable>",
  "path": "<requested path>"
}
```

| HTTP Status | Condition |
|---|---|
| `404` | Path did not match any route map rule |
| `501` | Path matched a rule but the target service is not registered |
| `502` | Target service returned an error or was unreachable |

---

## Adding A New Service

1. Create the service under your services directory with its own `routes/api.ts` exporting `registerRoutes`.
2. Add a `ManifestEntry` for the service in the service manifest.
3. Add one or more `GatewayRouteRule` entries in the route map that point to the service's logical name.
4. In Workers mode, declare the corresponding service binding in the runtime config.
5. In Node mode, no additional wiring is needed; `MicroserviceManager` will discover the service from the manifest.

No changes to the gateway controller are required.

---

## Stage-By-Stage Code Samples

The samples below show one generic TypeScript implementation of the architecture described above. They are intentionally neutral: the names, routes, headers, and services are placeholders that can be adapted to any domain.

### Stage 1: Define The Route Map

This stage creates the static contract that maps inbound URL patterns to logical service names.

```ts
export type GatewayServiceName =
      | 'identity'
      | 'catalog'
      | 'payments'
      | 'notifications';

export type GatewayRouteRule = {
      service: GatewayServiceName;
      summary: string;
      patterns: ReadonlyArray<RegExp>;
};

const gatewayRouteRules: ReadonlyArray<GatewayRouteRule> = [
      {
            service: 'identity',
            summary: 'Authentication and profile endpoints',
            patterns: [/^auth(?:\/.*)?$/, /^profile$/],
      },
      {
            service: 'catalog',
            summary: 'Catalog browsing endpoints',
            patterns: [/^products(?:\/.*)?$/, /^categories(?:\/.*)?$/],
      },
      {
            service: 'payments',
            summary: 'Checkout and payment endpoints',
            patterns: [/^checkout$/, /^payments(?:\/.*)?$/],
      },
      {
            service: 'notifications',
            summary: 'Realtime and notification endpoints',
            patterns: [/^broadcasting\/auth$/, /^socket(?:\/.*)?$/],
      },
];

const trimSlashes = (value: string): string => {
      return value.replace(/^\/+|\/+$/g, '');
};

const normalizeGatewayPath = (path: string): string => {
      const trimmed = trimSlashes(path);
      const withoutBasePrefix = trimmed.startsWith('api/v1/')
            ? trimmed.slice('api/v1/'.length)
            : trimmed;

      const withoutLegacyAlias = withoutBasePrefix.startsWith('api/')
            ? withoutBasePrefix.slice('api/'.length)
            : withoutBasePrefix;

      return trimSlashes(withoutLegacyAlias);
};

const match = (path: string): GatewayRouteRule | undefined => {
      const normalizedPath = normalizeGatewayPath(path);
      return gatewayRouteRules.find((rule) => {
            return rule.patterns.some((pattern) => pattern.test(normalizedPath));
      });
};

export const GatewayRouteMap = Object.freeze({
      match,
      normalizePath: normalizeGatewayPath,
      rules: gatewayRouteRules,
      registeredTargets: Array.from(new Set(gatewayRouteRules.map((rule) => rule.service))),
});
```

### Stage 2: Define The Service Manifest

This stage tells the runtime which services exist, how they are loaded, and where they run in standalone mode.

```ts
export type ServiceManifestEntry = {
      id: string;
      domain: string;
      name: string;
      port: number;
      prefix: string;
      monolithEnabled: boolean;
      loadRoutes: () => Promise<{ registerRoutes: (router: unknown) => void }>;
};

export const serviceManifest: ReadonlyArray<ServiceManifestEntry> = [
      {
            id: 'platform/identity',
            domain: 'platform',
            name: 'identity',
            port: 3101,
            prefix: '',
            monolithEnabled: true,
            loadRoutes: async () => import('./services/identity/routes/api'),
      },
      {
            id: 'platform/catalog',
            domain: 'platform',
            name: 'catalog',
            port: 3102,
            prefix: '',
            monolithEnabled: true,
            loadRoutes: async () => import('./services/catalog/routes/api'),
      },
      {
            id: 'platform/payments',
            domain: 'platform',
            name: 'payments',
            port: 3103,
            prefix: '',
            monolithEnabled: true,
            loadRoutes: async () => import('./services/payments/routes/api'),
      },
      {
            id: 'platform/notifications',
            domain: 'platform',
            name: 'notifications',
            port: 3104,
            prefix: '',
            monolithEnabled: true,
            loadRoutes: async () => import('./services/notifications/routes/api'),
      },
];
```

### Stage 3: Register The Gateway Routes

This stage keeps the route file focused on registration only. It wires status routes, API dispatch, and compatibility surfaces.

```ts
type MiddlewareKey = 'sanitize' | 'rateLimit' | 'adminOnly' | 'optionalSession';

type IRouter = unknown;

const Router = {
      get: <T>(_router: IRouter, _path: string, _handler: unknown, _options?: { middleware?: T[] }) => undefined,
      post: <T>(_router: IRouter, _path: string, _handler: unknown, _options?: { middleware?: T[] }) => undefined,
      any: <T>(_router: IRouter, _path: string, _handler: unknown, _options?: { middleware?: T[] }) => undefined,
};

const shouldRunAsMonolith = (): boolean => process.env.RUN_AS_MONOLITH === 'true';
const shouldUseUnifiedSocketRuntime = (): boolean => process.env.SOCKET_ENABLED === 'true';

export function registerRoutes(router: IRouter): void {
      const gatewayController = GatewayController.create();
      const realtimeController = RealtimeController.create();
      const previewController = PreviewController.create();

      Router.get(router, '/', gatewayController.index);
      Router.get(router, '/health', gatewayController.health);
      Router.get<MiddlewareKey>(router, '/api/v1', gatewayController.describeApi, {
            middleware: ['sanitize', 'rateLimit'],
      });

      Router.get(router, '/preview/mail', previewController.index);
      Router.get(router, '/preview/mail/:template', previewController.show);

      const bypassProxy = shouldRunAsMonolith();
      const useUnifiedSocketRuntime = shouldUseUnifiedSocketRuntime();

      Router.post<MiddlewareKey>(
            router,
            '/broadcasting/auth',
            bypassProxy ? realtimeController.authorize : gatewayController.dispatch,
            { middleware: bypassProxy ? ['sanitize', 'rateLimit', 'optionalSession'] : ['sanitize', 'rateLimit'] },
      );

      if (!bypassProxy) {
            Router.any<MiddlewareKey>(router, '/api/v1/:path*', gatewayController.dispatch, {
                  middleware: ['sanitize', 'rateLimit'],
            });
      }

      if (!useUnifiedSocketRuntime) {
            Router.any<MiddlewareKey>(router, '/socket/:path*', gatewayController.dispatch, {
                  middleware: ['rateLimit'],
            });
      }
}
```

### Stage 4: Implement The Gateway Controller

This stage owns CORS, route lookup, service registration, binding fallback, and downstream proxying.

```ts
type IRequest = {
      getMethod(): string;
      getPath(): string;
      getBody(): unknown;
      getHeaders(): Record<string, string | string[] | undefined>;
      getHeader(name: string): string | string[] | undefined;
};

type IResponse = {
      setHeader(name: string, value: string): IResponse;
      setStatus(code: number): IResponse;
      json(payload: unknown): void;
};

type ProxiedResponse = {
      statusCode: number;
      data: unknown;
};

type WorkerServiceBinding = {
      fetch(request: Request): Promise<Response>;
};

const serviceRegistry = new Map<string, { port: number; domain: string; id: string }>();
let registryReady = false;

const applyCorsHeaders = (req: IRequest, res: IResponse): void => {
      const requestOrigin = String(req.getHeader('origin') ?? '').trim();
      res.setHeader('Access-Control-Allow-Origin', requestOrigin === '' ? '*' : requestOrigin);
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Internal-Token');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Vary', 'Origin');
};

const isCorsPreflightRequest = (req: IRequest): boolean => {
      return req.getMethod().toUpperCase() === 'OPTIONS'
            && String(req.getHeader('access-control-request-method') ?? '').trim() !== '';
};

const buildForwardHeaders = (req: IRequest): Record<string, string> => {
      const result: Record<string, string> = {};

      for (const [key, rawValue] of Object.entries(req.getHeaders())) {
            if (rawValue === undefined) {
                  continue;
            }

            const normalizedKey = key.toLowerCase();
            if (normalizedKey === 'host' || normalizedKey === 'content-length' || normalizedKey === 'connection') {
                  continue;
            }

            result[key] = Array.isArray(rawValue) ? rawValue.join(', ') : rawValue;
      }

      return result;
};

const ensureServiceRegistry = async (): Promise<ReadonlyArray<string>> => {
      if (!registryReady) {
            for (const entry of serviceManifest) {
                  serviceRegistry.set(entry.name, {
                        id: entry.id,
                        domain: entry.domain,
                        port: entry.port,
                  });

                  if (process.env.RUNTIME_TARGET !== 'workers') {
                        await MicroserviceManager.startService(entry.id);
                  }
            }

            registryReady = true;
      }

      return Array.from(serviceRegistry.keys());
};

const getWorkerServiceBinding = (serviceName: string): WorkerServiceBinding | null => {
      const workersEnv = (globalThis as { __WORKERS_ENV__?: Record<string, unknown> }).__WORKERS_ENV__;
      if (!workersEnv) {
            return null;
      }

      const candidates = [
            `${serviceName.toUpperCase()}_SERVICE`,
            `PLATFORM_${serviceName.toUpperCase()}_SERVICE`,
      ];

      for (const bindingName of candidates) {
            const candidate = workersEnv[bindingName] as { fetch?: unknown } | undefined;
            if (candidate && typeof candidate.fetch === 'function') {
                  return candidate as WorkerServiceBinding;
            }
      }

      return null;
};

const normalizeBindingResponse = async (response: Response): Promise<ProxiedResponse> => {
      const contentType = response.headers.get('content-type') ?? '';
      const data = contentType.includes('application/json')
            ? await response.json().catch(() => null)
            : await response.text();

      return {
            statusCode: response.status,
            data,
      };
};

const callBoundService = async (serviceName: string, req: IRequest): Promise<ProxiedResponse | null> => {
      if (process.env.RUNTIME_TARGET !== 'workers') {
            return null;
      }

      const binding = getWorkerServiceBinding(serviceName);
      if (!binding) {
            return null;
      }

      const headers = buildForwardHeaders(req);
      headers['X-Internal-Token'] = process.env.INTERNAL_SERVICE_TOKEN ?? 'development-token';
      headers['X-Internal-Service'] = 'gateway';

      try {
            const response = await binding.fetch(new Request(`https://internal${req.getPath()}`, {
                  method: req.getMethod().toUpperCase(),
                  headers,
                  body: req.getMethod().toUpperCase() === 'GET' ? undefined : JSON.stringify(req.getBody()),
            }));

            const normalizedResponse = await normalizeBindingResponse(response);
            const isLocalPlaceholder = normalizedResponse.statusCode === 503
                  && typeof normalizedResponse.data === 'string'
                  && normalizedResponse.data.includes("Couldn't find a local dev session");

            return isLocalPlaceholder ? null : normalizedResponse;
      } catch {
            return null;
      }
};

const GatewayController = Object.freeze({
      create() {
            return Object.freeze({
                  async index(req: IRequest, res: IResponse): Promise<void> {
                        applyCorsHeaders(req, res);
                        res.json({
                              service: 'gateway',
                              status: 'ok',
                              routeTargets: GatewayRouteMap.registeredTargets,
                        });
                  },

                  async health(req: IRequest, res: IResponse): Promise<void> {
                        applyCorsHeaders(req, res);
                        const registeredServices = await ensureServiceRegistry();
                        res.json({
                              service: 'gateway',
                              healthy: true,
                              registeredServices,
                        });
                  },

                  async describeApi(req: IRequest, res: IResponse): Promise<void> {
                        applyCorsHeaders(req, res);
                        res.json({
                              service: 'gateway',
                              basePath: '/api/v1',
                              routes: GatewayRouteMap.rules,
                        });
                  },

                  async dispatch(req: IRequest, res: IResponse): Promise<void> {
                        applyCorsHeaders(req, res);

                        if (isCorsPreflightRequest(req)) {
                              res.setStatus(200).json({});
                              return;
                        }

                        const requestPath = req.getPath();
                        const routeRule = GatewayRouteMap.match(requestPath);
                        if (!routeRule) {
                              res.setStatus(404).json({
                                    status: 0,
                                    service: 'gateway',
                                    msg: 'Gateway route not mapped',
                                    path: requestPath,
                              });
                              return;
                        }

                        const registeredServices = await ensureServiceRegistry();
                        if (!registeredServices.includes(routeRule.service)) {
                              res.setStatus(501).json({
                                    status: 0,
                                    service: 'gateway',
                                    msg: `Target service '${routeRule.service}' is not registered yet`,
                                    targetService: routeRule.service,
                                    path: requestPath,
                              });
                              return;
                        }

                        try {
                              const boundResponse = await callBoundService(routeRule.service, req);
                              const response = boundResponse ?? await MicroserviceManager.callService(routeRule.service, {
                                    method: req.getMethod().toUpperCase(),
                                    path: requestPath,
                                    headers: buildForwardHeaders(req),
                                    body: req.getMethod().toUpperCase() === 'GET' ? undefined : req.getBody(),
                                    timeout: 5000,
                              });

                              const normalizedResponse: ProxiedResponse = typeof response === 'object' && response !== null && 'statusCode' in response
                                    ? response as ProxiedResponse
                                    : { statusCode: 200, data: response };

                              res.setStatus(normalizedResponse.statusCode).json(normalizedResponse.data);
                        } catch {
                              res.setStatus(502).json({
                                    status: 0,
                                    service: 'gateway',
                                    msg: 'Downstream service unavailable',
                                    targetService: routeRule.service,
                                    path: requestPath,
                              });
                        }
                  },
            });
      },
});

const MicroserviceManager = {
      async startService(_id: string): Promise<void> {
            return undefined;
      },
      async callService(_serviceName: string, _request: unknown): Promise<unknown> {
            return { statusCode: 200, data: { ok: true } };
      },
};

const RealtimeController = Object.freeze({
      create: () => Object.freeze({ authorize: async (_req: IRequest, res: IResponse) => res.json({ authorized: true }) }),
});

const PreviewController = Object.freeze({
      create: () => Object.freeze({
            index: async (_req: IRequest, res: IResponse) => res.json({ templates: [] }),
            show: async (_req: IRequest, res: IResponse) => res.json({ html: '<html></html>' }),
      }),
});
```

### Stage 5: Implement One Downstream Service

This stage shows the shape of a service route file and its local controller. The same route file can be used in monolith mode and in standalone service mode.

```ts
type ServiceRouter = unknown;

const ServiceRouterApi = {
      get: (_router: ServiceRouter, _path: string, _handler: unknown) => undefined,
      post: (_router: ServiceRouter, _path: string, _handler: unknown) => undefined,
      group: (_router: ServiceRouter, _prefix: string, callback: (router: ServiceRouter) => void) => callback({}),
};

const ProductController = Object.freeze({
      create() {
            return Object.freeze({
                  async list(_req: IRequest, res: IResponse): Promise<void> {
                        res.json({ data: [{ id: 'prod_1', name: 'Example Product' }] });
                  },

                  async show(_req: IRequest, res: IResponse): Promise<void> {
                        res.json({ data: { id: 'prod_1', name: 'Example Product' } });
                  },

                  async create(_req: IRequest, res: IResponse): Promise<void> {
                        res.setStatus(201).json({ data: { id: 'prod_2', name: 'New Product' } });
                  },
            });
      },
});

export function registerProductRoutes(router: ServiceRouter): void {
      const controller = ProductController.create();

      ServiceRouterApi.group(router, '/api/v1', (apiRouter) => {
            ServiceRouterApi.get(apiRouter, '/products', controller.list);
            ServiceRouterApi.get(apiRouter, '/products/:id', controller.show);
            ServiceRouterApi.post(apiRouter, '/products', controller.create);
      });

      ServiceRouterApi.group(router, '/platform/catalog', (serviceRouter) => {
            ServiceRouterApi.get(serviceRouter, '/', async (_req: IRequest, res: IResponse) => {
                  res.json({ service: 'catalog', status: 'ok' });
            });

            ServiceRouterApi.get(serviceRouter, '/health', async (_req: IRequest, res: IResponse) => {
                  res.json({ service: 'catalog', healthy: true });
            });
      });
}
```

### Stage 6: Bootstrap In Monolith Mode

This stage shows the minimal loader that mounts service routes locally when monolith mode is enabled.

```ts
export async function bootstrapMonolith(router: unknown): Promise<void> {
      if (process.env.RUN_AS_MONOLITH !== 'true') {
            return;
      }

      for (const entry of serviceManifest) {
            if (!entry.monolithEnabled) {
                  continue;
            }

            const module = await entry.loadRoutes();
            module.registerRoutes(router);
      }
}
```

Together, these stages give one complete generic implementation path:

1. The route map decides ownership.
2. The manifest defines availability and loading.
3. The gateway route file exposes the public surface.
4. The gateway controller applies the dispatch policy.
5. Each service owns its own route and controller logic.
6. Monolith bootstrap mounts local services without changing the public API.

---

## Switching Between Modes

| Environment Variable | Effect |
|---|---|
| `RUN_AS_MONOLITH=true` | Local route mounting and selected direct-handler bypass paths are enabled |
| `RUN_AS_MONOLITH=false` (default) | Gateway proxies each request to the matching downstream service |
| `SOCKET_ENABLED=true` | Unified WebSocket runtime is used; legacy WebSocket upgrade routes are excluded from the router |
| `TRACE_ENABLED=true` | Trace dashboard is mounted at the configured base path |

Combining `RUN_AS_MONOLITH=true` with individual `monolithEnabled: false` manifest entries allows selective extraction: some services can stay mounted locally while others continue to flow through the gateway's normal downstream dispatch path.
