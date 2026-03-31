---
title: Cloudflare Containers Proxy
description: Cloudflare Containers proxy adapter for ZinTrust
---

# Cloudflare Containers Proxy

The `@zintrust/cloudflare-containers-proxy` package provides a Cloudflare Containers proxy adapter for ZinTrust, enabling seamless integration with Cloudflare's container runtime environment.

## Installation

```bash
npm install @zintrust/cloudflare-containers-proxy
```

## Deploy CLI

```bash
zin deploy:ccp
```

`zin deploy:ccp` now uses the same `.zintrust.json` Cloudflare manifest as `zin put cloudflare` before running `wrangler deploy`. By default it resolves `cloudflare.shared_env`, `cloudflare.targets["containers-proxy"]`, and `cloudflare.wrangler_envs["<env>"]`, then uploads the selected secrets from `.env`.

Useful flags:

```bash
zin deploy:ccp --env staging
zin deploy:ccp --env production --env-path .env.production
zin deploy:ccp --target containers-proxy
zin deploy:ccp --no-sync-secrets
```

## Local CLI

```bash
npm run dev:cp
```

## Cloudflare Vars CLI

```bash
zin put cloudflare --wg staging --var proxy_env --config wrangler.containers-proxy.jsonc
```

Use `zin put cloudflare` when you want a manual sync only. For normal deploys, `zin deploy:ccp` now performs the same manifest-driven secret sync automatically unless you opt out with `--no-sync-secrets`.

## Configuration

Add the Cloudflare Containers proxy configuration to your environment:

```typescript
// config/cloudflare.ts
import { CloudflareConfig } from '@zintrust/core';

export const cloudflare: CloudflareConfig = {
  containers: {
    enabled: true,
    proxy: {
      target: process.env.CONTAINER_TARGET || 'http://localhost:8080',
      timeout: 30000,
      retries: 3,
      healthCheck: {
        path: '/health',
        interval: 30000,
        timeout: 5000,
      },
    },
    routing: {
      enabled: true,
      prefix: '/api/container',
      stripPrefix: true,
    },
  },
};
```

## Environment Variables

```bash
CONTAINER_TARGET=http://localhost:8080
CONTAINER_PROXY_ENABLED=true
CONTAINER_HEALTH_CHECK_PATH=/health
```

## Usage

```typescript
import { CloudflareContainersProxy } from '@zintrust/cloudflare-containers-proxy';

// Initialize proxy
const proxy = new CloudflareContainersProxy({
  target: 'http://container-service:8080',
  timeout: 30000,
});

// Proxy requests
app.use('/api/container', proxy.middleware());

// Direct proxy calls
const response = await proxy.request('/users', {
  method: 'GET',
  headers: { Authorization: 'Bearer token' },
});

// Health check
const isHealthy = await proxy.healthCheck();
```

## Features

- **Container Integration**: Seamless integration with Cloudflare Containers
- **Request Proxying**: HTTP request forwarding to container services
- **Health Monitoring**: Container health check capabilities
- **Load Balancing**: Multiple container instance support
- **Circuit Breaker**: Automatic failover for unhealthy containers
- **Request Routing**: Intelligent request routing and filtering
- **Performance Monitoring**: Request/response metrics and logging
- **Security**: Request validation and sanitization

## Advanced Configuration

### Multiple Container Targets

```typescript
export const cloudflare: CloudflareConfig = {
  containers: {
    enabled: true,
    proxy: {
      targets: [
        { url: 'http://container-1:8080', weight: 1 },
        { url: 'http://container-2:8080', weight: 1 },
        { url: 'http://container-3:8080', weight: 2 },
      ],
      loadBalancing: {
        strategy: 'round-robin', // or 'weighted', 'least-connections'
        healthCheck: {
          path: '/health',
          interval: 15000,
          timeout: 3000,
          unhealthyThreshold: 3,
          healthyThreshold: 2,
        },
      },
    },
  },
};
```

### Request Routing

```typescript
export const cloudflare: CloudflareConfig = {
  containers: {
    enabled: true,
    routing: {
      rules: [
        {
          path: '/api/users/*',
          target: 'http://user-service:8080',
          methods: ['GET', 'POST', 'PUT', 'DELETE'],
        },
        {
          path: '/api/orders/*',
          target: 'http://order-service:8080',
          methods: ['GET', 'POST'],
        },
        {
          path: '/api/notifications/*',
          target: 'http://notification-service:8080',
          timeout: 10000, // Custom timeout for notifications
        },
      ],
    },
  },
};
```

### Circuit Breaker Configuration

```typescript
export const cloudflare: CloudflareConfig = {
  containers: {
    enabled: true,
    circuitBreaker: {
      enabled: true,
      threshold: 5, // Fail after 5 consecutive failures
      timeout: 60000, // Reset after 60 seconds
      resetTimeout: 30000, // Try to reset after 30 seconds
      monitoringPeriod: 10000, // Check every 10 seconds
    },
  },
};
```

## Request/Response Handling

### Request Transformation

```typescript
const proxy = new CloudflareContainersProxy({
  target: 'http://container-service:8080',
  requestTransform: (req) => {
    // Add custom headers
    req.headers['X-Request-ID'] = generateRequestId();
    req.headers['X-Forwarded-For'] = req.ip;

    // Transform request body
    if (req.body && typeof req.body === 'object') {
      req.body.timestamp = new Date().toISOString();
    }

    return req;
  },
  responseTransform: (res, req) => {
    // Add response headers
    res.headers['X-Response-Time'] = Date.now() - req.startTime;

    // Transform response body
    if (res.data && typeof res.data === 'object') {
      res.data.processedAt = new Date().toISOString();
    }

    return res;
  },
});
```

### Error Handling

```typescript
const proxy = new CloudflareContainersProxy({
  target: 'http://container-service:8080',
  errorHandler: (error, req, res) => {
    console.log('Proxy error:', error.message);

    if (error.code === 'ECONNREFUSED') {
      res.status(503).json({
        error: 'Service Unavailable',
        message: 'Container service is not responding',
      });
    } else if (error.code === 'ETIMEDOUT') {
      res.status(504).json({
        error: 'Gateway Timeout',
        message: 'Container service timed out',
      });
    } else {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Proxy request failed',
      });
    }
  },
});
```

## Health Monitoring

### Health Checks

```typescript
import { ContainerHealthMonitor } from '@zintrust/cloudflare-containers-proxy';

const monitor = new ContainerHealthMonitor({
  targets: [
    { url: 'http://container-1:8080', name: 'container-1' },
    { url: 'http://container-2:8080', name: 'container-2' },
  ],
  healthCheck: {
    path: '/health',
    interval: 30000,
    timeout: 5000,
    expectedStatus: 200,
  },
});

// Get health status
const health = await monitor.getHealth();
// Returns: { healthy: boolean, targets: Array<{ name: string, healthy: boolean, responseTime: number }> }

// Health events
monitor.on('health-change', (target, healthy) => {
  console.log(`Target ${target.name} is now ${healthy ? 'healthy' : 'unhealthy'}`);
});

monitor.on('all-unhealthy', () => {
  console.log('All targets are unhealthy - triggering alert');
  sendAlert('All container targets are down');
});
```

### Custom Health Checks

```typescript
const monitor = new ContainerHealthMonitor({
  targets: [{ url: 'http://container:8080', name: 'main' }],
  healthCheck: {
    custom: async (target) => {
      try {
        const response = await fetch(`${target.url}/health/detailed`);
        const data = await response.json();

        return {
          healthy: response.ok && data.status === 'healthy',
          responseTime: response.headers.get('x-response-time'),
          details: data,
        };
      } catch (error) {
        return { healthy: false, error: error.message };
      }
    },
  },
});
```

## Performance Optimization

### Connection Pooling

```typescript
const proxy = new CloudflareContainersProxy({
  target: 'http://container-service:8080',
  connectionPool: {
    enabled: true,
    maxConnections: 100,
    minConnections: 10,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
  },
});
```

### Caching

```typescript
const proxy = new CloudflareContainersProxy({
  target: 'http://container-service:8080',
  cache: {
    enabled: true,
    ttl: 300000, // 5 minutes
    maxSize: 1000, // Max 1000 cached responses
    keyGenerator: (req) => {
      return `${req.method}:${req.url}:${JSON.stringify(req.body)}`;
    },
    shouldCache: (req, res) => {
      return req.method === 'GET' && res.status === 200;
    },
  },
});
```

### Compression

```typescript
const proxy = new CloudflareContainersProxy({
  target: 'http://container-service:8080',
  compression: {
    enabled: true,
    threshold: 1024, // Compress responses larger than 1KB
    algorithms: ['gzip', 'br'], // gzip and brotli
  },
});
```

## Security

### Request Validation

```typescript
const proxy = new CloudflareContainersProxy({
  target: 'http://container-service:8080',
  security: {
    requestValidation: {
      maxPayloadSize: 10 * 1024 * 1024, // 10MB
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      rateLimit: {
        windowMs: 60000, // 1 minute
        max: 100, // 100 requests per minute
      },
    },
    sanitization: {
      removeHeaders: ['cookie', 'x-forwarded-for'],
      sanitizeBody: true,
    },
  },
});
```

### Authentication

```typescript
const proxy = new CloudflareContainersProxy({
  target: 'http://container-service:8080',
  authentication: {
    type: 'jwt',
    secret: process.env.JWT_SECRET,
    algorithms: ['HS256'],
    required: false, // Optional authentication
    onVerified: (payload, req) => {
      req.user = payload;
      req.headers['X-User-ID'] = payload.sub;
    },
  },
});
```

## Monitoring and Metrics

### Request Metrics

```typescript
import { ContainerMetrics } from '@zintrust/cloudflare-containers-proxy';

const metrics = new ContainerMetrics();

// Get request metrics
const requestMetrics = await metrics.getRequestMetrics();
// Returns: { totalRequests: number, averageResponseTime: number, errorRate: number, requestsPerSecond: number }

// Get target-specific metrics
const targetMetrics = await metrics.getTargetMetrics('container-1');
// Returns: { requests: number, errors: number, averageResponseTime: number, uptime: number }

// Custom metrics
metrics.recordCustomMetric('business-logic-calls', 1, {
  target: 'container-1',
  operation: 'process-order',
});
```

### Performance Monitoring

```typescript
const proxy = new CloudflareContainersProxy({
  target: 'http://container-service:8080',
  monitoring: {
    enabled: true,
    metrics: {
      requestCount: true,
      responseTime: true,
      errorRate: true,
      targetHealth: true,
    },
    logging: {
      level: 'info',
      includeRequestBody: false,
      includeResponseBody: false,
      customFields: ['request-id', 'user-id'],
    },
  },
});
```

## Testing

### Mock Container

```typescript
import { ContainerMock } from '@zintrust/cloudflare-containers-proxy';

// Use mock for testing
const mockContainer = new ContainerMock({
  responses: {
    '/health': { status: 200, body: { healthy: true } },
    '/users': { status: 200, body: [{ id: 1, name: 'John' }] },
  },
});

// Test proxy with mock
const proxy = new CloudflareContainersProxy({
  target: mockContainer.url,
});

const response = await proxy.request('/users');
expect(response.data).toEqual([{ id: 1, name: 'John' }]);
```

### Integration Testing

```typescript
import { TestContainer } from '@zintrust/cloudflare-containers-proxy';

// Use test container for integration tests
const testContainer = new TestContainer({
  image: 'your-container-image:latest',
  port: 8080,
  environment: {
    NODE_ENV: 'test',
    DATABASE_URL: 'sqlite::memory:',
  },
});

// Start test container
await testContainer.start();

// Run tests
const proxy = new CloudflareContainersProxy({
  target: testContainer.url,
});

// Cleanup
await testContainer.stop();
```

## Error Handling

### Circuit Breaker Events

```typescript
const proxy = new CloudflareContainersProxy({
  target: 'http://container-service:8080',
  circuitBreaker: {
    enabled: true,
    onCircuitOpen: () => {
      console.log('Circuit breaker opened - failing fast');
      sendAlert('Container service circuit breaker opened');
    },
    onCircuitClose: () => {
      console.log('Circuit breaker closed - requests allowed');
    },
    onHalfOpen: () => {
      console.log('Circuit breaker half-open - testing connection');
    },
  },
});
```

### Retry Logic

```typescript
const proxy = new CloudflareContainersProxy({
  target: 'http://container-service:8080',
  retry: {
    enabled: true,
    attempts: 3,
    delay: 1000,
    maxDelay: 10000,
    backoff: 'exponential',
    retryCondition: (error) => {
      return error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';
    },
  },
});
```

## Best Practices

1. **Health Monitoring**: Implement comprehensive health checks
2. **Circuit Breaker**: Use circuit breakers to prevent cascading failures
3. **Load Balancing**: Distribute load across multiple container instances
4. **Timeout Configuration**: Set appropriate timeouts for different operations
5. **Monitoring**: Monitor request metrics and container health
6. **Security**: Validate and sanitize all requests
7. **Error Handling**: Implement robust error handling and retry logic
8. **Performance**: Use connection pooling and caching for better performance

## Limitations

- **Network Latency**: Network latency between Cloudflare and containers
- **Cold Starts**: Container cold start latency
- **Resource Limits**: Container resource limitations
- **Connection Limits**: Maximum concurrent connections
- **Protocol Support**: Limited to HTTP/HTTPS protocols
- **Memory Usage**: Proxy memory usage for large requests/responses

## Troubleshooting

### Common Issues

1. **Connection Refused**: Check if container is running and accessible
2. **Timeout Errors**: Increase timeout values or optimize container performance
3. **Health Check Failures**: Verify health check endpoint and expected responses
4. **Circuit Breaker Tripping**: Check container health and adjust thresholds
5. **High Latency**: Optimize container performance or use edge caching

### Debug Mode

```typescript
const proxy = new CloudflareContainersProxy({
  target: 'http://container-service:8080',
  debug: process.env.NODE_ENV === 'development',
  logging: {
    level: 'debug',
    logRequests: true,
    logResponses: true,
    logErrors: true,
  },
});
```
