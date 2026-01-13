---
title: HTTP Client
description: HTTP client for making authenticated requests
---

# HTTP Client

ZinTrust provides a fluent, HTTP client for making authenticated requests to external APIs and services. Perfect for cloud logging, inter-service communication, and Redis HTTPS proxy requests.

## Interface Reference

```typescript
export interface IHttpRequest {
  withHeader(name: string, value: string): IHttpRequest;
  withHeaders(headers: Record\<string, string>): IHttpRequest;
  withAuth(token: string, scheme?: 'Bearer' | 'Basic'): IHttpRequest;
  withBasicAuth(username: string, password: string): IHttpRequest;
  withTimeout(ms: number): IHttpRequest;
  asJson(): IHttpRequest;
  asForm(): IHttpRequest;
  send(): Promise\<IHttpResponse>;
}

export interface IHttpResponse {
  status: number;
  statusText: string;
  headers: Record\<string, string>;
  body: string;
  ok(): boolean;
  json\<T = unknown>(): T;
  text(): string;
  throwIfError(): IHttpResponse;
}
```

## Features

- ✅ **Fluent API** – Chainable methods for configuration
- ✅ **Authentication** – Bearer tokens, Basic auth, custom headers
- ✅ **Timeouts** – Request timeouts with automatic abort
- ✅ **Convenience Methods** – GET, POST, PUT, PATCH, DELETE
- ✅ **JSON Parsing** – Automatic JSON response parsing
- ✅ **Response Utilities** – Status helpers, error throwing
- ✅ **Works Everywhere** – Node.js, Cloudflare Workers, Serverless
- ✅ **Type-Safe** – Full TypeScript support

## Installation

HTTP client is built into ZinTrust. No additional packages needed.

```typescript
import { HttpClient } from '@zintrust/core';
```

## Basic Usage

### GET Request

```typescript
import { HttpClient } from '@zintrust/core';

const response = await HttpClient.get('https://api.example.com/users/1').send();

console.log(response.status); // 200
console.log(response.json()); // { id: 1, name: 'Alice' }
```

### POST Request

```typescript
const response = await HttpClient.post('https://api.example.com/users', {
  name: 'Bob',
  email: 'bob@example.com',
}).send();

const newUser = response.json(); // { id: 2, name: 'Bob', ... }
```

### PUT / PATCH / DELETE

```typescript
// Update a resource
await HttpClient.put('https://api.example.com/users/1', {
  name: 'Alice Updated',
}).send();

// Partially update
await HttpClient.patch('https://api.example.com/users/1', {
  email: 'newemail@example.com',
}).send();

// Delete a resource
await HttpClient.delete('https://api.example.com/users/1').send();
```

## Authentication

### Bearer Token

```typescript
const response = await HttpClient.get('https://api.example.com/me')
  .withAuth('my-secret-token')
  .send();

// Authorization: Bearer my-secret-token
```

### Custom Scheme

```typescript
const response = await HttpClient.get('https://api.example.com/me')
  .withAuth('my-api-key', 'ApiKey')
  .send();

// Authorization: ApiKey my-api-key
```

### Basic Authentication

```typescript
const response = await HttpClient.get('https://api.example.com/protected')
  .withBasicAuth('username', 'password')
  .send();

// Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=
```

## Custom Headers

### Single Header

```typescript
const response = await HttpClient.get('https://api.example.com/data')
  .withHeader('X-API-Version', '2.0')
  .withHeader('X-Request-ID', 'req-123')
  .send();
```

### Multiple Headers

```typescript
const response = await HttpClient.get('https://api.example.com/data')
  .withHeaders({
    'X-API-Version': '2.0',
    'X-Request-ID': 'req-123',
    'X-Client-Info': 'my-app/1.0',
  })
  .send();
```

## Timeouts

Set request timeout in milliseconds:

```typescript
const response = await HttpClient.get('https://api.example.com/slow-endpoint')
  .withTimeout(5000) // 5 seconds
  .send();

// If request takes longer, throws ConnectionError
```

### Default Timeout

Configure default timeout via environment variable:

```env
HTTP_TIMEOUT=30000  # 30 seconds (default)
```

## Response Handling

### Status Checking

```typescript
const response = await HttpClient.get('https://api.example.com/users/999').send();

if (response.successful) {
  console.log('Success:', response.json());
} else if (response.clientError) {
  console.error('Client error:', response.status);
} else if (response.serverError) {
  console.error('Server error:', response.status);
}
```

### Status Helpers

```typescript
const response = await HttpClient.post('...').send();

response.ok; // true if status 2xx
response.successful; // true if status 200-299
response.failed; // true if not successful
response.clientError; // true if status 400-499
response.serverError; // true if status 500-599
```

### Error Throwing

Throw errors for problematic responses:

```typescript
const response = await HttpClient.get('https://api.example.com/users').send();

// Throw if 5xx status
response.throwIfServerError();

// Throw if 4xx status
response.throwIfClientError();
```

### Response Body

```typescript
const response = await HttpClient.get('...').send();

// Get raw body
const body = response.body; // string

// Parse as JSON
const data = response.json\<User>(); // Typed

// Get specific header
const contentType = response.header('content-type');
const hasAuth = response.hasHeader('authorization');
```

## Common Patterns

### External API with API Key

```typescript
import { HttpClient } from '@zintrust/core';
import { Env } from '@zintrust/core';

async function fetchGithubUser(username: string) {
  const response = await HttpClient.get(`https://api.github.com/users/${username}`)
    .withAuth(Env.get('GITHUB_TOKEN'))
    .withHeader('Accept', 'application/vnd.github.v3+json')
    .send();

  return response.json();
}
```

### Cloud Logging to Slack

```typescript
import { Env, HttpClient, Logger } from '@zintrust/core';

async function logToSlack(message: string, level: 'info' | 'error') {
  try {
    await HttpClient.post(Env.get('SLACK_WEBHOOK_URL'), {
      text: message,
      severity: level,
      timestamp: new Date().toISOString(),
    })
      .withTimeout(5000)
      .send();
  } catch (error) {
    Logger.warn('Failed to send Slack notification', { error });
  }
}
```

### Inter-Service Communication

```typescript
import { HttpClient } from '@zintrust/core';
import { Env } from '@zintrust/core';

async function callUserService(action: string, data: unknown) {
  const response = await HttpClient.post(`${Env.get('USER_SERVICE_URL')}/api/${action}`, data)
    .withAuth(Env.get('SERVICE_AUTH_TOKEN'))
    .withHeader('X-Service-Name', 'order-service')
    .withTimeout(10000)
    .send();

  response.throwIfServerError();
  response.throwIfClientError();

  return response.json();
}
```

### Redis HTTPS Proxy (Serverless)

```typescript
import { HttpClient } from '@zintrust/core';
import { Env } from '@zintrust/core';

async function publishEvent(channel: string, event: string, data: unknown) {
  const response = await HttpClient.post(Env.get('REDIS_HTTPS_ENDPOINT'), {
    command: 'PUBLISH',
    channel,
    message: JSON.stringify({ event, data }),
  })
    .withAuth(Env.get('REDIS_HTTPS_TOKEN'))
    .withTimeout(Env.getInt('REDIS_HTTPS_TIMEOUT', 5000))
    .send();

  response.throwIfServerError();
}
```

### GraphQL Query

```typescript
import { HttpClient } from '@zintrust/core';

async function queryGraphQL(query: string, variables: unknown) {
  const response = await HttpClient.post('https://api.example.com/graphql', {
    query,
    variables,
  })
    .withAuth(Env.get('API_TOKEN'))
    .send();

  const result = response.json\<{ data: unknown; errors?: unknown[] }>();

  if (result.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(result.errors)}`);
  }

  return result.data;
}
```

## Environment Variables

```env
# Default timeout for all HTTP requests (ms)
HTTP_TIMEOUT=30000

# Cloud Logging Examples
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
DATADOG_LOG_ENDPOINT=https://http-intake.logs.datadoghq.com/v1/input
DATADOG_API_KEY=your-api-key

# Redis HTTPS (Serverless)
REDIS_HTTPS_ENDPOINT=https://your-redis-proxy.example.com
REDIS_HTTPS_TOKEN=your-bearer-token
REDIS_HTTPS_TIMEOUT=5000
REDIS_HTTPS_RETRIES=2
```

## Error Handling

HTTP client errors are thrown as `CatchError` or `ConnectionError`:

```typescript
import { HttpClient, Logger } from '@zintrust/core';

try {
  const response = await HttpClient.get('https://api.example.com/data').withTimeout(5000).send();

  response.throwIfServerError();
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes('timeout')) {
      Logger.warn('Request timeout');
    } else if (error.message.includes('HTTP')) {
      Logger.error('HTTP error', { error: error.message });
    }
  }
}
```

## Type Safety

Full TypeScript support for request and response:

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

interface CreateUserPayload {
  name: string;
  email: string;
}

async function createUser(data: CreateUserPayload) {
  const response = await HttpClient.post\<CreateUserPayload>(
    'https://api.example.com/users',
    data
  ).send();

  const user = response.json\<User>();
  return user;
}
```

## Testing

Mock `Http` requests in tests:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpClient } from '@zintrust/core';

describe('My API Client', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it('should call API', async () => {
    const mockResponse = {
      status: 200,
      ok: true,
      headers: new Map([['content-type', 'application/json']]),
      text: vi.fn().mockResolvedValue('{"id": 1}'),
    };

    vi.mocked(global.fetch).mockResolvedValue(mockResponse as any);

    const response = await HttpClient.get('https://api.example.com/users/1').send();

    expect(response.status).toBe(200);
    expect(response.json()).toEqual({ id: 1 });
  });
});
```

## Performance Tips

1. **Reuse connections** – HTTP client uses `fetch` which reuses connections automatically
2. **Set appropriate timeouts** – Don't wait forever for slow endpoints
3. **Batch requests** – Group multiple requests when possible
4. **Cache responses** – Use Storage or KV for frequently accessed data
5. **Retry failed requests** – Implement retry logic for transient failures

## Troubleshooting

### Timeout Errors

If requests are timing out, increase the timeout:

```typescript
await HttpClient.get('https://slow-api.example.com')
  .withTimeout(60000) // 60 seconds
  .send();
```

Or set a global default:

```env
HTTP_TIMEOUT=60000
```

### Authentication Failures

Verify your token or credentials:

```typescript
// Check if token is set
console.log(Env.get('API_TOKEN')); // Should not be undefined

// Verify token format
const token = Env.get('API_TOKEN');
await HttpClient.get('https://api.example.com/me').withAuth(token).send();
```

### CORS Issues

CORS applies only to browsers. Server-side requests should work fine:

```typescript
// This works fine from server/serverless
const response = await HttpClient.get('https://api.example.com/data').withAuth(token).send();
```

If you need CORS workarounds for browser requests, use a CORS proxy or configure CORS on your API server.

### Connection Refused

Check if the endpoint is reachable:

```bash
curl https://api.example.com/health
```

Verify the URL is correct and service is running.

## Migration from Node.js `http`/`https`

Switch from native Node.js HTTP modules:

```typescript
// ❌ Old way
import https from 'https';

https.get('https://api.example.com/data', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => console.log(JSON.parse(data)));
});

// ✅ New way
import { HttpClient } from '@zintrust/core';

const response = await HttpClient.get('https://api.example.com/data').send();
console.log(response.json());
```

## Related

- [Cloud Logging](./logging.md) – Uses HTTP client for log endpoints
- [Broadcasting](./broadcast.md) – Redis HTTPS driver uses HTTP client
- [Storage](./storage.md) – Cloud drivers use HTTP for signed URLs
