# Multi-tenancy

Multi-tenancy is an application-level concern, but ZinTrust provides a clean place to store and propagate tenant identity: **`RequestContext.tenantId`**.

The goal is that every request handler (and observability signal) can reliably access the current tenant without re-parsing headers or tokens.

## Tenant identity in RequestContext

`tenantId` is an optional string on `RequestContext` and is mirrored to `req.context['tenantId']`.

How it gets set:

- Your app (or auth middleware) calls `RequestContext.setTenantId(req, tenantId)`.
- The framework’s `JwtAuthMiddleware` will set it automatically when a JWT includes a tenant claim.

## Built-in JWT behavior

`src/middleware/JwtAuthMiddleware.ts` maps these claim keys:

- `tenantId`
- `tenant_id`

If either is present (string or number), it is converted to a string and stored via `RequestContext.setTenantId(...)`.

This means you can standardize your downstream logic on `RequestContext.tenantId` even if upstream token shapes vary.

## Choosing a canonical tenant source

Pick one canonical tenant source per request and stick to it.

Common options:

- **JWT claim** (recommended): hard to spoof when signature is verified.
- **Subdomain** (e.g. `tenant.example.com`): friendly UX; still validate against auth.
- **Header** (e.g. `x-tenant-id`): easy for internal APIs; must be authenticated and validated.

Recommendation:

- Use JWT claims for public APIs.
- Only allow `x-tenant-id` in trusted/internal contexts.

## Enforcement layers (defense-in-depth)

ZinTrust does not automatically scope queries by tenant. You should enforce multi-tenancy at multiple layers:

1. **Authentication:** reject requests missing tenant context if the route requires it.
2. **Authorization:** verify the user is allowed to access the tenant.
3. **Data access:** scope queries by `tenantId` (don’t rely solely on middleware checks).
4. **Background jobs:** include tenant context in job payloads and validate when executing.

### Data isolation patterns

Choose one based on your risk profile and scaling requirements:

- **Shared tables with `tenant_id` column**
  - Pros: simplest operations.
  - Cons: easiest to accidentally leak data if you miss a WHERE clause.

- **Shared database, separate schemas per tenant/service**
  - Pros: stronger isolation than a column.
  - Cons: more operational complexity.

- **Isolated database per tenant**
  - Pros: strongest isolation.
  - Cons: highest cost and operational overhead.

Regardless of approach, aim for a single helper/util that applies tenant scoping consistently.

## Observability and privacy

### Logs

It’s often useful to include `tenantId` in logs for debugging.

- Prefer hashing/pseudonymizing tenant identifiers if they are considered sensitive.
- Do not log tenant secrets, tokens, or raw JWTs.

### Traces

When OpenTelemetry is enabled, ZinTrust records tenant information on spans:

- `zintrust.tenant_id` is set from request context (late-bound in the request lifecycle).

See [docs/opentelemetry.md](docs/opentelemetry.md) for how spans are created.

### Metrics

Avoid using `tenantId` as a Prometheus label. Tenant IDs are typically high-cardinality and can overload time series storage.

If you need per-tenant metrics, aggregate at a higher level (plan, region, shard) or use logs/traces for tenant-specific drill-down.

## Troubleshooting

If `tenantId` is missing in handlers:

- Confirm your auth middleware runs before route handlers.
- Confirm the JWT contains `tenantId`/`tenant_id` (or that your custom middleware sets it).
- Ensure middleware uses `RequestContext.setTenantId(...)` so both `RequestContext` and `req.context` stay in sync.
