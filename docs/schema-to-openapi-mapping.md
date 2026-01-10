# Schema to OpenAPI mapping

ZinTrust generates an OpenAPI 3.0.3 document at runtime from the **registered routes** plus each route’s metadata.

The generator is intentionally pragmatic: it aims to produce a useful spec that matches how requests are validated and how handlers are shaped, but it does not try to perfectly model every runtime behavior.

Core implementation lives in `src/openapi/OpenApiGenerator.ts`.

## What the generator consumes

OpenAPI output is driven by the route records stored in `RouteRegistry`.

- Route registration happens through the `Router.*` helpers.
- Each registration records: HTTP method, path, tags, middleware names, and (optionally) schemas.

The generator uses that registry to build:

- `paths` and `operations` (per method)
- `parameters` (path/query/header)
- `requestBody`
- `responses`

## Path normalization

ZinTrust uses Express-style route params (e.g. `/:id`).

OpenAPI requires `{id}` placeholders.

The generator normalizes paths by converting `/:param` to `/{param}` and then uses the normalized path as the OpenAPI `paths` key.

## operationId generation

To keep `operationId` stable and deterministic, the generator derives it from:

- the HTTP method
- the normalized path

This avoids accidental churn in generated client SDKs.

## Parameters

ZinTrust supports generating OpenAPI parameters from route schemas.

### Path parameters

If the route declares a params/path schema, the generator emits OpenAPI parameters with:

- `in: "path"`
- `required: true`
- `name: <paramName>`

Important: OpenAPI requires that **every** `{param}` in the path has a corresponding `path` parameter. If you use route params but omit a params schema, your spec may be incomplete.

### Query parameters

If the route declares a query schema, its properties are emitted as:

- `in: "query"`
- `required` derived from schema requirements

### Header parameters

If the route declares a headers schema, its properties are emitted as:

- `in: "header"`

Notes:

- Header names are treated as case-insensitive by HTTP, but OpenAPI parameter names are case-sensitive strings; use consistent casing.
- Some headers are typically set by middleware/proxies (e.g. auth headers); documenting them is still useful.

## Request body

If the route declares a body schema, the generator emits a JSON `requestBody`:

- `content["application/json"].schema` is derived from the body schema
- `required` depends on how the schema is declared

If your route accepts other content types (multipart, form-encoded, etc.), you must document that yourself; the built-in generator currently focuses on JSON.

## Responses

Routes can declare response schemas and status codes.

The generator maps these into `responses` entries. If a schema is present, it is emitted as JSON content:

- `content["application/json"].schema` derived from the response schema

If a route doesn’t provide explicit response metadata, the generator will still emit a response entry so the operation isn’t “schema-less”, but it may be generic.

## Schema conversion (high level)

ZinTrust’s validation system is richer than vanilla JSON Schema; OpenAPI uses a JSON Schema dialect.

The generator therefore does a **best-effort conversion** from ZinTrust schema objects into OpenAPI-compatible schema fragments.

In practice:

- primitives become `type: string|number|integer|boolean`
- objects become `type: object` with `properties` + `required`
- arrays become `type: array` with `items`

## Limitations and gotchas

These are the most common mismatches between runtime behavior and what the OpenAPI generator can express:

- **Runtime-only validation**: custom validators, cross-field rules, or dynamic rules may not be representable.
- **Coercion and parsing**: if middleware parses/coerces values (e.g. strings to numbers), OpenAPI may still show the original wire type unless your schema encodes it.
- **Unions/discriminators**: complex union types may degrade to looser schemas.
- **Non-JSON bodies**: multipart uploads and form bodies require manual documentation.
- **Auth/permissions**: middleware-enforced auth/roles are not automatically modeled as OpenAPI `security` requirements unless you encode them in route metadata.

## Recommendations

- Always provide a params schema for routes that use `/:param` segments.
- Treat the generated spec as a living artifact: keep route schemas close to handlers so docs don’t drift.
- If you need strict OpenAPI output for SDK generation, validate `/openapi.json` in CI and add targeted metadata for edge cases.

- `required` → field listed in `required[]`
- `string` → `{ type: 'string' }`
- `email` → `{ type: 'string', format: 'email' }`
- `uuid` → `{ type: 'string', format: 'uuid' }`
- `url` → `{ type: 'string', format: 'uri' }`
- `integer`/`digits` → `{ type: 'integer' }`
- `number`/`decimal` → `{ type: 'number' }`
- `min`/`max` → `minimum`/`maximum`
- `minLength`/`maxLength` → `minLength`/`maxLength`
- `regex` → `pattern`
- `in([...])` → `enum` (JSON primitives only)

## Limitations

- Array element typing is not currently inferred (arrays become `items: {}`).
- Deep/nested object schemas are not automatically derived.
- Response schemas are only included if you set `meta.response.schema`.
