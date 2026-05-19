---
title: Cloudflare D1 Proxy
description: Cloudflare D1 proxy adapter for ZinTrust
---

# Cloudflare D1 Proxy

The `@zintrust/cloudflare-d1-proxy` package provides a Cloudflare D1 proxy adapter for ZinTrust, enabling seamless integration with Cloudflare's serverless SQLite database.

## Installation

This proxy Worker is currently shipped from the ZinTrust repository and deployed with the ZinTrust CLI. It is not currently published as a standalone public npm package.

## Core Runtime Entry

```ts
import { ZintrustD1Proxy } from '@zintrust/core/proxy';
```

## Deploy CLI

```bash
zin deploy d1-proxy
```

## Local CLI

```bash
zin proxy:d1
```

`zin proxy:d1` ensures `wrangler.jsonc` contains `env.d1-proxy` with `main` pointing to `./src/proxy/d1/ZintrustD1Proxy.ts` before starting local Wrangler dev.

## Cloudflare Vars CLI

```bash
zin put cloudflare --wg d1-proxy --var d1_env --env_path .env
zin put cloudflare --wg d1-proxy --var d1_env --bulk --env_path .env
zin put cloudflare --wg d1-proxy --key D1_REMOTE_SECRET --value "..."
```

Use `--bulk` when you want one Wrangler `secret bulk` call per target. Use `--key` / `--keys` for one-off secret rotation without expanding the whole group.

## Configuration

Add the Cloudflare D1 proxy configuration to your environment:

```typescript
// config/cloudflare.ts
import { CloudflareConfig } from '@zintrust/core';

export const cloudflare: CloudflareConfig = {
  d1: {
    enabled: true,
    databaseId: process.env.D1_DATABASE_ID,
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
D1_DATABASE_ID=your-database-id
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
D1_PROXY_ENABLED=true
```

## Usage

```typescript
import { CloudflareD1Proxy } from '@zintrust/cloudflare-d1-proxy';

// Initialize proxy
const d1Proxy = new CloudflareD1Proxy({
  databaseId: 'your-database-id',
  accountId: 'your-account-id',
  apiToken: 'your-api-token',
});

// Execute SQL queries
const users = await d1Proxy.query('SELECT * FROM users WHERE active = ?', [true]);

// Execute prepared statements
const result = await d1Proxy
  .prepare('INSERT INTO users (name, email) VALUES (?, ?)')
  .bind('John Doe', 'john@example.com')
  .run();

// Batch operations
const batch = [
  d1Proxy.prepare('INSERT INTO users (name, email) VALUES (?, ?)').bind('Jane', 'jane@example.com'),
  d1Proxy.prepare('INSERT INTO users (name, email) VALUES (?, ?)').bind('Bob', 'bob@example.com'),
];
const batchResult = await d1Proxy.batch(batch);
```

## Features

- **D1 Integration**: Full Cloudflare D1 API integration
- **SQL Support**: Complete SQLite SQL support
- **Prepared Statements**: Parameterized query support
- **Batch Operations**: Efficient batch query execution
- **Connection Pooling**: Optimized connection management
- **Query Caching**: Intelligent query result caching
- **Performance Monitoring**: Query performance metrics
- **Error Handling**: Comprehensive error handling and retry logic

## Advanced Configuration

### Connection Pooling

```typescript
export const cloudflare: CloudflareConfig = {
  d1: {
    enabled: true,
    databaseId: process.env.D1_DATABASE_ID,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    connectionPool: {
      enabled: true,
      maxConnections: 20,
      minConnections: 5,
      acquireTimeoutMillis: 30000,
      idleTimeoutMillis: 30000,
    },
  },
};
```

### Query Optimization

```typescript
export const cloudflare: CloudflareConfig = {
  d1: {
    enabled: true,
    // ... other config
    optimization: {
      queryCache: {
        enabled: true,
        ttl: 300000, // 5 minutes
        maxSize: 1000,
        keyGenerator: (query, params) => {
          return `${query}:${JSON.stringify(params)}`;
        },
      },
      preparedStatements: {
        enabled: true,
        cacheSize: 100,
      },
      compression: {
        enabled: true,
        threshold: 1024, // Compress results larger than 1KB
      },
    },
  },
};
```

### Retry Configuration

```typescript
export const cloudflare: CloudflareConfig = {
  d1: {
    enabled: true,
    // ... other config
    retry: {
      enabled: true,
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoff: 'exponential',
      retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'RATE_LIMITED'],
    },
  },
};
```

## Query Operations

### Basic Queries

```typescript
// SELECT queries
const users = await d1Proxy.query('SELECT * FROM users WHERE active = ?', [true]);
// Returns: { results: Array<{ id: number, name: string, email: string, active: boolean }> }

// INSERT queries
const insertResult = await d1Proxy.query(
  'INSERT INTO users (name, email, active) VALUES (?, ?, ?)',
  ['John Doe', 'john@example.com', true]
);
// Returns: { meta: { changes: 1, last_row_id: 123 } }

// UPDATE queries
const updateResult = await d1Proxy.query('UPDATE users SET active = ? WHERE id = ?', [false, 123]);
// Returns: { meta: { changes: 1 } }

// DELETE queries
const deleteResult = await d1Proxy.query('DELETE FROM users WHERE id = ?', [123]);
// Returns: { meta: { changes: 1 } }
```

### Prepared Statements

```typescript
// Create prepared statement
const stmt = d1Proxy.prepare('SELECT * FROM users WHERE email = ?');

// Execute with parameters
const user = await stmt.bind('john@example.com').first();

// Execute multiple times
const users = await Promise.all([
  stmt.bind('john@example.com').first(),
  stmt.bind('jane@example.com').first(),
  stmt.bind('bob@example.com').first(),
]);
```

### Batch Operations

```typescript
// Batch insert
const insertBatch = [
  d1Proxy.prepare('INSERT INTO users (name, email) VALUES (?, ?)').bind('John', 'john@example.com'),
  d1Proxy.prepare('INSERT INTO users (name, email) VALUES (?, ?)').bind('Jane', 'jane@example.com'),
  d1Proxy.prepare('INSERT INTO users (name, email) VALUES (?, ?)').bind('Bob', 'bob@example.com'),
];

const batchResult = await d1Proxy.batch(insertBatch);
// Returns: { results: Array<{ meta: { changes: number } }> }

// Batch update
const updateBatch = [
  d1Proxy.prepare('UPDATE users SET active = ? WHERE id = ?').bind(true, 1),
  d1Proxy.prepare('UPDATE users SET active = ? WHERE id = ?').bind(false, 2),
];

const updateResult = await d1Proxy.batch(updateBatch);
```

## Advanced Features

### Transactions

```typescript
// Begin transaction
const transaction = await d1Proxy.beginTransaction();

try {
  // Execute multiple statements
  await transaction.run('INSERT INTO users (name, email) VALUES (?, ?)', [
    'John',
    'john@example.com',
  ]);
  await transaction.run('INSERT INTO profiles (user_id, bio) VALUES (?, ?)', [
    1,
    'Software developer',
  ]);

  // Commit transaction
  await transaction.commit();
} catch (error) {
  // Rollback on error
  await transaction.rollback();
  throw error;
}
```

### Query Builder

```typescript
import { D1QueryBuilder } from '@zintrust/cloudflare-d1-proxy';

const builder = new D1QueryBuilder(d1Proxy);

// Build complex queries
const users = await builder
  .select('*')
  .from('users')
  .where('active = ?', [true])
  .where('created_at > ?', [new Date('2024-01-01')])
  .orderBy('created_at DESC')
  .limit(10)
  .offset(0)
  .get();

// Count queries
const count = await builder.count('id').from('users').where('active = ?', [true]).first();
```

### Schema Management

```typescript
import { D1Schema } from '@zintrust/cloudflare-d1-proxy';

const schema = new D1Schema(d1Proxy);

// Create table
await schema.createTable('users', (table) => {
  table.integer('id').primary().autoIncrement();
  table.string('name', 255).notNull();
  table.string('email', 255).unique().notNull();
  table.boolean('active').default(true);
  table.timestamps(true, true);
});

// Add column
await schema.addColumn('users', 'bio', 'text');

// Create index
await schema.createIndex('users_email_index', 'users', ['email']);

// Drop table
await schema.dropTable('users');
```

## Performance Optimization

### Query Caching

```typescript
const d1Proxy = new CloudflareD1Proxy({
  databaseId: 'your-database-id',
  accountId: 'your-account-id',
  apiToken: 'your-api-token',
  cache: {
    enabled: true,
    ttl: 300000, // 5 minutes
    maxSize: 1000,
    strategies: {
      read: 'cache-first', // or 'cache-only', 'network-first'
      write: 'network-only', // Don't cache write operations
    },
    invalidation: {
      onWrite: true, // Invalidate cache on write operations
      ttl: 60000, // Cache invalidation TTL
    },
  },
});
```

### Connection Optimization

```typescript
const d1Proxy = new CloudflareD1Proxy({
  databaseId: 'your-database-id',
  accountId: 'your-account-id',
  apiToken: 'your-api-token',
  optimization: {
    connectionPooling: {
      enabled: true,
      maxConnections: 20,
      minConnections: 5,
      idleTimeout: 30000,
    },
    queryTimeout: 30000,
    batchOptimization: true,
  },
});
```

### Query Analysis

```typescript
// Enable query analysis
const d1Proxy = new CloudflareD1Proxy({
  databaseId: 'your-database-id',
  accountId: 'your-account-id',
  apiToken: 'your-api-token',
  analysis: {
    enabled: true,
    slowQueryThreshold: 1000, // Log queries slower than 1 second
    logLevel: 'info',
    includeStackTrace: false,
  },
});

// Get query statistics
const stats = await d1Proxy.getQueryStats();
// Returns: { totalQueries: number, averageTime: number, slowQueries: number, cacheHitRate: number }
```

## Security

### Query Validation

```typescript
const d1Proxy = new CloudflareD1Proxy({
  databaseId: 'your-database-id',
  accountId: 'your-account-id',
  apiToken: 'your-api-token',
  security: {
    queryValidation: {
      enabled: true,
      allowedOperations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
      blockedPatterns: [/DROP\s+TABLE/i, /TRUNCATE/i, /ALTER\s+TABLE/i],
      maxQueryLength: 10000,
    },
    parameterValidation: {
      enabled: true,
      maxParameters: 100,
      parameterSizeLimit: 1024 * 1024, // 1MB per parameter
    },
  },
});
```

### Access Control

```typescript
const d1Proxy = new CloudflareD1Proxy({
  databaseId: 'your-database-id',
  accountId: 'your-account-id',
  apiToken: 'your-api-token',
  accessControl: {
    enabled: true,
    permissions: {
      read: ['users', 'profiles'],
      write: ['users'],
      admin: [], // No admin access
    },
    rowLevelSecurity: {
      enabled: true,
      userIdColumn: 'user_id',
      getCurrentUser: (req) => req.user?.id,
    },
  },
});
```

## Monitoring and Metrics

### Performance Metrics

```typescript
import { D1Metrics } from '@zintrust/cloudflare-d1-proxy';

const metrics = new D1Metrics(d1Proxy);

// Get performance metrics
const performanceMetrics = await metrics.getPerformanceMetrics();
// Returns: {
//   queryCount: number,
//   averageQueryTime: number,
//   slowQueries: number,
//   errorRate: number,
//   cacheHitRate: number
// }

// Get database statistics
const dbStats = await metrics.getDatabaseStats();
// Returns: {
//   totalRows: number,
//   tableSizes: Record<string, number>,
//   indexSizes: Record<string, number>
// }
```

### Health Monitoring

```typescript
import { D1HealthMonitor } from '@zintrust/cloudflare-d1-proxy';

const healthMonitor = new D1HealthMonitor(d1Proxy, {
  interval: 30000, // Check every 30 seconds
  timeout: 5000,
  query: 'SELECT 1 as health_check',
});

// Health events
healthMonitor.on('healthy', () => {
  console.log('D1 database is healthy');
});

healthMonitor.on('unhealthy', (error) => {
  console.log('D1 database is unhealthy:', error.message);
  sendAlert('D1 database health check failed');
});

// Get current health status
const health = await healthMonitor.getHealth();
// Returns: { healthy: boolean, responseTime: number, lastCheck: Date, error?: string }
```

## Error Handling

### Custom Error Handler

```typescript
const d1Proxy = new CloudflareD1Proxy({
  databaseId: 'your-database-id',
  accountId: 'your-account-id',
  apiToken: 'your-api-token',
  errorHandler: (error, query, params) => {
    console.log('D1 query error:', error.message);
    console.log('Query:', query);
    console.log('Params:', params);

    // Log to monitoring system
    logError(error, { query, params });

    // Send alert for critical errors
    if (error.severity === 'critical') {
      sendAlert('D1 database error', error);
    }
  },
});
```

### Error Types

```typescript
try {
  await d1Proxy.query('SELECT * FROM users');
} catch (error) {
  if (error.code === 'DATABASE_NOT_FOUND') {
    console.log('Database does not exist');
  } else if (error.code === 'QUERY_TIMEOUT') {
    console.log('Query timed out');
  } else if (error.code === 'RATE_LIMITED') {
    console.log('Rate limit exceeded');
  } else if (error.code === 'SYNTAX_ERROR') {
    console.log('SQL syntax error');
  } else {
    console.log('D1 error:', error.message);
  }
}
```

## Testing

### Mock D1

```typescript
import { D1Mock } from '@zintrust/cloudflare-d1-proxy';

// Use mock for testing
const mockD1 = new D1Mock({
  data: {
    users: [
      { id: 1, name: 'John', email: 'john@example.com', active: true },
      { id: 2, name: 'Jane', email: 'jane@example.com', active: false },
    ],
  },
});

// Test queries
const users = await mockD1.query('SELECT * FROM users WHERE active = ?', [true]);
expect(users.results).toHaveLength(1);
expect(users.results[0].name).toBe('John');
```

### Integration Testing

```typescript
import { TestD1 } from '@zintrust/cloudflare-d1-proxy';

// Use test D1 instance
const testD1 = new TestD1({
  databaseId: 'test-database-id',
  accountId: 'test-account-id',
  apiToken: 'test-token',
  // Use local SQLite for testing
  localMode: true,
  databasePath: './test.db',
});

// Setup test data
await testD1.query('INSERT INTO users (name, email) VALUES (?, ?)', [
  'Test User',
  'test@example.com',
]);

// Run tests
const result = await testD1.query('SELECT * FROM users');
expect(result.results).toHaveLength(1);

// Cleanup
await testD1.cleanup();
```

## Best Practices

1. **Use Prepared Statements**: Always use prepared statements for parameterized queries
2. **Implement Caching**: Cache frequently accessed read queries
3. **Monitor Performance**: Track query performance and slow queries
4. **Use Transactions**: Use transactions for multi-statement operations
5. **Optimize Queries**: Use appropriate indexes and query optimization
6. **Handle Errors**: Implement comprehensive error handling
7. **Security**: Validate and sanitize all inputs
8. **Connection Pooling**: Use connection pooling for better performance

## Limitations

- **Query Size**: Maximum query size limitations
- **Result Size**: Maximum result set size limitations
- **Concurrent Queries**: Limited concurrent query execution
- **API Rate Limits**: Cloudflare API rate limits apply
- **Network Latency**: Network latency to Cloudflare edge locations
- **SQLite Limitations**: Subject to SQLite limitations and constraints

## Troubleshooting

### Common Issues

1. **Connection Errors**: Check API token and database ID
2. **Query Timeouts**: Increase timeout values or optimize queries
3. **Rate Limiting**: Implement query throttling and caching
4. **Syntax Errors**: Validate SQL syntax before execution
5. **Performance Issues**: Use query analysis and optimization

### Debug Mode

```typescript
const d1Proxy = new CloudflareD1Proxy({
  databaseId: 'your-database-id',
  accountId: 'your-account-id',
  apiToken: 'your-api-token',
  debug: process.env.NODE_ENV === 'development',
  logging: {
    level: 'debug',
    logQueries: true,
    logParameters: true,
    logResults: false,
    logPerformance: true,
  },
});
```
