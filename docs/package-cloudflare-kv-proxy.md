---
title: Cloudflare KV Proxy
description: Cloudflare KV proxy adapter for ZinTrust
---

# Cloudflare KV Proxy

The `@zintrust/cloudflare-kv-proxy` package provides a Cloudflare KV proxy adapter for ZinTrust, enabling seamless integration with Cloudflare's key-value store.

## Installation

This proxy Worker is currently shipped from the ZinTrust repository and deployed with the ZinTrust CLI. It is not currently published as a standalone public npm package.

## Core Runtime Entry

```ts
import { ZintrustKvProxy } from '@zintrust/core/proxy/kv/ZintrustKvProxy';
```

## Deploy CLI

```bash
zin deploy kv-proxy
```

## Local CLI

```bash
zin proxy:kv
```

`zin proxy:kv` ensures `wrangler.jsonc` contains `env.kv-proxy` with `main` pointing to `./src/proxy/kv/ZintrustKvProxy.ts` before starting local Wrangler dev.

## Cloudflare Vars CLI

```bash
zin put cloudflare --wg kv-proxy --var kv_env --env_path .env
```

## Configuration

Add the Cloudflare KV proxy configuration to your environment:

```typescript
// config/cloudflare.ts
import { CloudflareConfig } from '@zintrust/core';

export const cloudflare: CloudflareConfig = {
  kv: {
    enabled: true,
    namespaceId: process.env.KV_NAMESPACE_ID,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    proxy: {
      enabled: true,
      timeout: 30000,
      retries: 3,
      cache: {
        enabled: true,
        ttl: 300000, // 5 minutes
        maxSize: 1000,
      },
    },
  },
};
```

## Environment Variables

```bash
KV_NAMESPACE_ID=your-namespace-id
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
KV_PROXY_ENABLED=true
```

## Usage

```typescript
import { CloudflareKVProxy } from '@zintrust/cloudflare-kv-proxy';

// Initialize proxy
const kvProxy = new CloudflareKVProxy({
  namespaceId: 'your-namespace-id',
  accountId: 'your-account-id',
  apiToken: 'your-api-token',
});

// Basic operations
await kvProxy.put('user:123', JSON.stringify({ name: 'John', email: 'john@example.com' }));
const userData = await kvProxy.get('user:123');
const exists = await kvProxy.has('user:123');
await kvProxy.delete('user:123');

// List keys
const keys = await kvProxy.list({ prefix: 'user:', limit: 100 });

// Bulk operations
const bulkData = {
  'user:123': JSON.stringify({ name: 'John' }),
  'user:124': JSON.stringify({ name: 'Jane' }),
  'user:125': JSON.stringify({ name: 'Bob' }),
};
await kvProxy.putMany(bulkData);
const bulkResults = await kvProxy.getMany(['user:123', 'user:124', 'user:125']);
```

## Features

- **KV Integration**: Full Cloudflare KV API integration
- **Key-Value Operations**: Complete CRUD operations
- **Bulk Operations**: Efficient bulk read/write operations
- **Namespace Management**: Multi-namespace support
- **Caching**: Intelligent local caching
- **Performance Monitoring**: Operation metrics and logging
- **Error Handling**: Comprehensive error handling and retry logic
- **Edge Optimization**: Optimized for edge performance

## Advanced Configuration

### Multiple Namespaces

```typescript
export const cloudflare: CloudflareConfig = {
  kv: {
    enabled: true,
    namespaces: {
      users: {
        namespaceId: process.env.USERS_KV_NAMESPACE_ID,
        ttl: 3600, // 1 hour default TTL
      },
      cache: {
        namespaceId: process.env.CACHE_KV_NAMESPACE_ID,
        ttl: 300, // 5 minutes default TTL
      },
      sessions: {
        namespaceId: process.env.SESSIONS_KV_NAMESPACE_ID,
        ttl: 86400, // 24 hours default TTL
      },
    },
    defaultNamespace: 'users',
  },
};
```

### Connection Optimization

```typescript
export const cloudflare: CloudflareConfig = {
  kv: {
    enabled: true,
    namespaceId: process.env.KV_NAMESPACE_ID,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    connection: {
      poolSize: 20,
      timeout: 30000,
      keepAlive: true,
      retries: 3,
      retryDelay: 1000,
    },
  },
};
```

### Caching Strategy

```typescript
export const cloudflare: CloudflareConfig = {
  kv: {
    enabled: true,
    // ... other config
    cache: {
      enabled: true,
      strategy: 'write-through', // or 'write-behind', 'cache-aside'
      ttl: 300000, // 5 minutes
      maxSize: 1000,
      evictionPolicy: 'lru', // or 'lfu', 'fifo'
      compression: {
        enabled: true,
        threshold: 1024, // Compress values larger than 1KB
      },
    },
  },
};
```

## Key-Value Operations

### Basic Operations

```typescript
// PUT operation
await kvProxy.put('user:123', JSON.stringify({ name: 'John', email: 'john@example.com' }), {
  expiration: 3600, // 1 hour TTL
  metadata: {
    contentType: 'application/json',
    lastModified: new Date().toISOString(),
  },
});

// GET operation
const userData = await kvProxy.get('user:123');
// Returns: string | null

// GET with type parsing
const user = await kvProxy.get('user:123', { type: 'json' });
// Returns: object | null

// HAS operation
const exists = await kvProxy.has('user:123');
// Returns: boolean

// DELETE operation
await kvProxy.delete('user:123');
```

### Advanced Operations

```typescript
// PUT with expiration
await kvProxy.put('session:abc123', JSON.stringify({ userId: 123 }), {
  expiration: 1800, // 30 minutes
  expirationTtl: 3600, // Extend TTL to 1 hour on access
});

// PUT with metadata
await kvProxy.put('config:app', JSON.stringify({ version: '1.0.0' }), {
  metadata: {
    version: '1.0.0',
    environment: 'production',
    lastUpdated: new Date().toISOString(),
  },
});

// GET with metadata
const result = await kvProxy.getWithMetadata('config:app');
// Returns: { value: string, metadata: object } | null
```

### Bulk Operations

```typescript
// Bulk PUT
const bulkData = {
  'user:123': JSON.stringify({ name: 'John' }),
  'user:124': JSON.stringify({ name: 'Jane' }),
  'user:125': JSON.stringify({ name: 'Bob' }),
};
await kvProxy.putMany(bulkData, {
  expiration: 3600,
  metadata: { contentType: 'application/json' },
});

// Bulk GET
const keys = ['user:123', 'user:124', 'user:125'];
const results = await kvProxy.getMany(keys, { type: 'json' });
// Returns: Record<string, object | null>

// Bulk DELETE
await kvProxy.deleteMany(['user:123', 'user:124', 'user:125']);
```

## List and Query Operations

### List Keys

```typescript
// Basic list
const keys = await kvProxy.list();
// Returns: { keys: Array<{ name: string, expiration?: number, metadata?: object }> }

// List with prefix
const userKeys = await kvProxy.list({ prefix: 'user:' });

// List with limit and cursor
const firstPage = await kvProxy.list({ limit: 100 });
const secondPage = await kvProxy.list({ limit: 100, cursor: firstPage.cursor });

// List with metadata
const keysWithMetadata = await kvProxy.list({ includeMetadata: true });
```

### Advanced Querying

```typescript
import { KVQueryBuilder } from '@zintrust/cloudflare-kv-proxy';

const builder = new KVQueryBuilder(kvProxy);

// Query by prefix with filtering
const activeUsers = await builder.prefix('user:').where('metadata.active', 'true').limit(10).get();

// Query by expiration
const expiringSoon = await builder
  .prefix('session:')
  .where('expiration', '<', Date.now() + 86400000) // Expires within 24 hours
  .get();
```

## Performance Optimization

### Local Caching

```typescript
const kvProxy = new CloudflareKVProxy({
  namespaceId: 'your-namespace-id',
  accountId: 'your-account-id',
  apiToken: 'your-api-token',
  localCache: {
    enabled: true,
    maxSize: 1000,
    ttl: 300000, // 5 minutes
    strategy: 'lru',
    compression: {
      enabled: true,
      threshold: 1024,
    },
  },
});
```

### Batch Optimization

```typescript
const kvProxy = new CloudflareKVProxy({
  namespaceId: 'your-namespace-id',
  accountId: 'your-account-id',
  apiToken: 'your-api-token',
  batchOptimization: {
    enabled: true,
    maxBatchSize: 100,
    batchTimeout: 100, // 100ms
    autoFlush: true,
  },
});
```

### Connection Pooling

```typescript
const kvProxy = new CloudflareKVProxy({
  namespaceId: 'your-namespace-id',
  accountId: 'your-account-id',
  apiToken: 'your-api-token',
  connectionPool: {
    enabled: true,
    maxConnections: 20,
    minConnections: 5,
    acquireTimeout: 30000,
    idleTimeout: 30000,
  },
});
```

## Security

### Access Control

```typescript
const kvProxy = new CloudflareKVProxy({
  namespaceId: 'your-namespace-id',
  accountId: 'your-account-id',
  apiToken: 'your-api-token',
  security: {
    keyValidation: {
      enabled: true,
      maxLength: 512,
      allowedPattern: /^[a-zA-Z0-9:_\-\.]+$/,
    },
    valueValidation: {
      enabled: true,
      maxSize: 25 * 1024 * 1024, // 25MB
      allowedTypes: ['string', 'object', 'number', 'boolean'],
    },
    rateLimit: {
      enabled: true,
      windowMs: 60000, // 1 minute
      maxRequests: 1000,
    },
  },
});
```

### Encryption

```typescript
const kvProxy = new CloudflareKVProxy({
  namespaceId: 'your-namespace-id',
  accountId: 'your-account-id',
  apiToken: 'your-api-token',
  encryption: {
    enabled: true,
    algorithm: 'aes-256-gcm',
    keyId: 'encryption-key-1',
    keyRotation: {
      enabled: true,
      interval: 86400000, // 24 hours
    },
  },
});
```

## Monitoring and Metrics

### Performance Metrics

```typescript
import { KVMetrics } from '@zintrust/cloudflare-kv-proxy';

const metrics = new KVMetrics(kvProxy);

// Get performance metrics
const performanceMetrics = await metrics.getPerformanceMetrics();
// Returns: {
//   totalOperations: number,
//   averageLatency: number,
//   hitRate: number,
//   errorRate: number,
//   operationsPerSecond: number
// }

// Get operation-specific metrics
const getMetrics = await metrics.getOperationMetrics('get');
const putMetrics = await metrics.getOperationMetrics('put');
```

### Health Monitoring

```typescript
import { KVHealthMonitor } from '@zintrust/cloudflare-kv-proxy';

const healthMonitor = new KVHealthMonitor(kvProxy, {
  interval: 30000, // Check every 30 seconds
  timeout: 5000,
  testKey: 'health-check',
  testValue: 'ok',
});

// Health events
healthMonitor.on('healthy', () => {
  console.log('KV namespace is healthy');
});

healthMonitor.on('unhealthy', (error) => {
  console.log('KV namespace is unhealthy:', error.message);
  sendAlert('KV namespace health check failed');
});

// Get current health status
const health = await healthMonitor.getHealth();
// Returns: { healthy: boolean, responseTime: number, lastCheck: Date, error?: string }
```

## Advanced Features

### Namespaces Management

```typescript
import { KVNamespaceManager } from '@zintrust/cloudflare-kv-proxy';

const manager = new KVNamespaceManager({
  accountId: 'your-account-id',
  apiToken: 'your-api-token',
});

// List namespaces
const namespaces = await manager.listNamespaces();

// Create namespace
const newNamespace = await manager.createNamespace({
  title: 'User Data',
  description: 'User profile and session data',
});

// Delete namespace
await manager.deleteNamespace('namespace-id');
```

### Data Migration

```typescript
import { KVMigrator } from '@zintrust/cloudflare-kv-proxy';

const migrator = new KVMigrator({
  source: sourceKVProxy,
  target: targetKVProxy,
});

// Migrate all data
await migrator.migrate({
  batchSize: 100,
  preserveTTL: true,
  preserveMetadata: true,
  onProgress: (progress) => {
    console.log(`Migration progress: ${progress.percentage}%`);
  },
});

// Migrate with filtering
await migrator.migrate({
  filter: (key, value) => key.startsWith('user:'),
  transform: (key, value) => {
    return { key: `migrated:${key}`, value };
  },
});
```

### Backup and Restore

```typescript
import { KVBackup } from '@zintrust/cloudflare-kv-proxy';

const backup = new KVBackup(kvProxy);

// Create backup
const backupData = await backup.create({
  includeMetadata: true,
  compression: true,
  encryption: {
    enabled: true,
    password: 'backup-password',
  },
});

// Restore from backup
await backup.restore(backupData, {
  overwrite: false, // Don't overwrite existing keys
  transform: (key, value) => {
    return { key: `restored:${key}`, value };
  },
});
```

## Error Handling

### Custom Error Handler

```typescript
const kvProxy = new CloudflareKVProxy({
  namespaceId: 'your-namespace-id',
  accountId: 'your-account-id',
  apiToken: 'your-api-token',
  errorHandler: (error, operation, key) => {
    console.log(`KV ${operation} error for key ${key}:`, error.message);

    // Log to monitoring system
    logError(error, { operation, key });

    // Send alert for critical errors
    if (error.severity === 'critical') {
      sendAlert('KV namespace error', error);
    }
  },
});
```

### Error Types

```typescript
try {
  await kvProxy.get('user:123');
} catch (error) {
  if (error.code === 'NAMESPACE_NOT_FOUND') {
    console.log('Namespace does not exist');
  } else if (error.code === 'KEY_NOT_FOUND') {
    console.log('Key does not exist');
  } else if (error.code === 'RATE_LIMITED') {
    console.log('Rate limit exceeded');
  } else if (error.code === 'VALUE_TOO_LARGE') {
    console.log('Value exceeds size limit');
  } else {
    console.log('KV error:', error.message);
  }
}
```

## Testing

### Mock KV

```typescript
import { KVMock } from '@zintrust/cloudflare-kv-proxy';

// Use mock for testing
const mockKV = new KVMock({
  data: {
    'user:123': JSON.stringify({ name: 'John', email: 'john@example.com' }),
    'config:app': JSON.stringify({ version: '1.0.0' }),
  },
});

// Test operations
await mockKV.put('test:key', 'test-value');
const value = await mockKV.get('test:key');
expect(value).toBe('test-value');

const exists = await mockKV.has('test:key');
expect(exists).toBe(true);
```

### Integration Testing

```typescript
import { TestKV } from '@zintrust/cloudflare-kv-proxy';

// Use test KV instance
const testKV = new TestKV({
  namespaceId: 'test-namespace-id',
  accountId: 'test-account-id',
  apiToken: 'test-token',
  // Use local storage for testing
  localMode: true,
  storagePath: './test-kv.json',
});

// Setup test data
await testKV.put('user:test', JSON.stringify({ name: 'Test User' }));

// Run tests
const result = await testKV.get('user:test');
expect(result).toBe(JSON.stringify({ name: 'Test User' }));

// Cleanup
await testKV.cleanup();
```

## Best Practices

1. **Use Appropriate TTL**: Set appropriate expiration times for different data types
2. **Implement Caching**: Use local caching for frequently accessed data
3. **Batch Operations**: Use bulk operations for better performance
4. **Key Naming**: Use consistent and descriptive key naming conventions
5. **Monitor Performance**: Track operation latency and error rates
6. **Handle Errors**: Implement comprehensive error handling
7. **Security**: Validate and sanitize all inputs
8. **Data Size**: Be mindful of KV value size limitations

## Limitations

- **Value Size**: Maximum 25MB per value
- **Key Size**: Maximum 512 bytes per key
- **Namespace Count**: Limited by account quotas
- **API Rate Limits**: Rate limits apply to KV API
- **Consistency**: Eventual consistency model
- **Network Latency**: Network latency to Cloudflare edge locations

## Troubleshooting

### Common Issues

1. **Connection Errors**: Check API token and namespace ID
2. **Rate Limiting**: Implement request throttling and caching
3. **Value Size**: Ensure values don't exceed 25MB limit
4. **Key Not Found**: Handle missing keys gracefully
5. **Performance Issues**: Use local caching and batch operations

### Debug Mode

```typescript
const kvProxy = new CloudflareKVProxy({
  namespaceId: 'your-namespace-id',
  accountId: 'your-account-id',
  apiToken: 'your-api-token',
  debug: process.env.NODE_ENV === 'development',
  logging: {
    level: 'debug',
    logOperations: true,
    logParameters: false,
    logResults: false,
    logPerformance: true,
  },
});
```
