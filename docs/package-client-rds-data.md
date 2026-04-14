---
title: RDS Data Client
description: AWS RDS Data API client adapter for ZinTrust
---

# RDS Data Client

The `@zintrust/client-rds-data` package provides an AWS RDS Data API client adapter for ZinTrust, enabling secure and efficient database operations without managing database connections.

## Installation

```bash
npm install @zintrust/client-rds-data
```

## Configuration

Add the RDS Data client configuration to your environment:

```typescript
// config/database.ts
import { DatabaseConfig } from '@zintrust/core';

export const database: DatabaseConfig = {
  driver: 'rds-data',
  rdsData: {
    resourceArn: process.env.RDS_DATA_RESOURCE_ARN,
    secretArn: process.env.RDS_DATA_SECRET_ARN,
    database: process.env.RDS_DATA_DATABASE,
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    timeout: 30000,
    retries: 3,
  },
};
```

## Environment Variables

```bash
RDS_DATA_RESOURCE_ARN=arn:aws:rds:us-east-1:123456789012:cluster:my-cluster
RDS_DATA_SECRET_ARN=arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret
RDS_DATA_DATABASE=my_database
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_SESSION_TOKEN=your_session_token
```

## Usage

```typescript
import { Model } from '@zintrust/core';

// Define a model
const User = Model.define({
  tableName: 'users',
  schema: {
    id: { type: 'number', primary: true, autoIncrement: true },
    name: { type: 'string', required: true },
    email: { type: 'string', required: true, unique: true },
    created_at: { type: 'datetime', default: () => new Date() },
  },
});

// Create operations
const user = await User.create({
  name: 'John Doe',
  email: 'john@example.com',
});

// Query operations
const users = await User.where('name', 'John').get();
const user = await User.find(1);

// Update operations
await User.where('id', 1).update({ name: 'Jane Doe' });

// Delete operations
await User.where('id', 1).delete();

// Raw SQL queries
const results = await Model.raw('SELECT * FROM users WHERE active = ?', [true]);
```

## Features

- **RDS Data API**: Full AWS RDS Data API integration
- **Serverless**: No connection management required
- **Secure**: IAM-based authentication
- **Performance**: Optimized query execution
- **Transactions**: ACID transaction support
- **Batch Operations**: Efficient batch SQL execution
- **Type Safety**: Full TypeScript support
- **Error Handling**: Comprehensive error handling

## Advanced Configuration

### Multiple Database Clusters

```typescript
export const database: DatabaseConfig = {
  driver: 'rds-data',
  rdsData: {
    clusters: {
      primary: {
        resourceArn: process.env.PRIMARY_RDS_ARN,
        secretArn: process.env.PRIMARY_SECRET_ARN,
        database: 'primary_db',
      },
      readonly: {
        resourceArn: process.env.READONLY_RDS_ARN,
        secretArn: process.env.READONLY_SECRET_ARN,
        database: 'readonly_db',
      },
    },
    defaultCluster: 'primary',
  },
};
```

### Connection Pooling

```typescript
export const database: DatabaseConfig = {
  driver: 'rds-data',
  rdsData: {
    resourceArn: process.env.RDS_DATA_RESOURCE_ARN,
    secretArn: process.env.RDS_DATA_SECRET_ARN,
    database: process.env.RDS_DATA_DATABASE,
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
export const database: DatabaseConfig = {
  driver: 'rds-data',
  rdsData: {
    // ... other config
    optimization: {
      queryCache: {
        enabled: true,
        ttl: 300000, // 5 minutes
        maxSize: 1000,
      },
      preparedStatements: {
        enabled: true,
        cacheSize: 100,
      },
      batchOptimization: true,
    },
  },
};
```

## Database Operations

### Basic CRUD Operations

```typescript
// Create
const user = await User.create({
  name: 'John Doe',
  email: 'john@example.com',
});

// Read
const user = await User.find(1);
const users = await User.where('active', true).get();
const firstUser = await User.where('name', 'John').first();

// Update
await User.where('id', 1).update({ name: 'Jane Doe' });

// Delete
await User.where('id', 1).delete();
```

### Advanced Queries

```typescript
// Complex where conditions
const users = await User.where('active', true)
  .where('created_at', '>', new Date('2024-01-01'))
  .orderBy('created_at DESC')
  .limit(10)
  .get();

// Subqueries
const activeUsers = await User.where('id', 'IN', User.where('active', true).select('id')).get();

// Joins
const usersWithProfiles = await User.select('users.*', 'profiles.bio')
  .join('profiles', 'users.id', '=', 'profiles.user_id')
  .where('users.active', true)
  .get();
```

### Raw SQL Operations

```typescript
// Execute raw SQL
const results = await Model.raw(
  `
  SELECT u.*, p.bio
  FROM users u
  LEFT JOIN profiles p ON u.id = p.user_id
  WHERE u.active = ?
`,
  [true]
);

// Execute stored procedures
const procedureResult = await Model.raw('CALL get_user_by_email(?)', ['john@example.com']);

// Batch SQL execution
const batchResults = await Model.batch(
  [
    'INSERT INTO users (name, email) VALUES (?, ?)',
    'INSERT INTO profiles (user_id, bio) VALUES (?, ?)',
  ],
  [
    ['John Doe', 'john@example.com'],
    [1, 'Software developer'],
  ]
);
```

## Transactions

### Simple Transactions

```typescript
import { Database, QueryBuilder } from '@zintrust/core';

await Database.transaction(async (trx) => {
  const user = await QueryBuilder.create('users', trx).insert({
    name: 'John',
    email: 'john@example.com',
  });
  await QueryBuilder.create('profiles', trx).insert({ user_id: user.id, bio: 'Developer' });
});
```

### Manual Transaction Control

```typescript
const trx = await Database.beginTransaction();
try {
  const user = await QueryBuilder.create('users', trx).insert({
    name: 'John',
    email: 'john@example.com',
  });
  await QueryBuilder.create('profiles', trx).insert({ user_id: user.id, bio: 'Developer' });
  await trx.commit();
} catch (error) {
  await trx.rollback();
  throw error;
}
```

### Savepoints

```typescript
await Database.transaction(async (trx) => {
  const user = await QueryBuilder.create('users', trx).insert({
    name: 'John',
    email: 'john@example.com',
  });

  await trx.savepoint('user_created');

  try {
    await QueryBuilder.create('profiles', trx).insert({ user_id: user.id, bio: 'Developer' });
    await trx.release('user_created');
  } catch (error) {
    await trx.rollbackToSavepoint('user_created');
  }
});
```

## Performance Optimization

### Query Caching

```typescript
const user = await User.find(1, {
  cache: {
    ttl: 300000, // 5 minutes
    key: 'user:1',
  },
});
```

### Batch Operations

```typescript
// Batch insert
const users = [
  { name: 'John', email: 'john@example.com' },
  { name: 'Jane', email: 'jane@example.com' },
  { name: 'Bob', email: 'bob@example.com' },
];

const insertedUsers = await User.insertMany(users);

// Batch update
await User.updateMany(
  { active: false },
  { where: { last_login: { '<', new Date('2024-01-01') } } }
);
```

### Connection Optimization

```typescript
export const database: DatabaseConfig = {
  driver: 'rds-data',
  rdsData: {
    // ... other config
    performance: {
      connectionTimeout: 30000,
      queryTimeout: 10000,
      maxRetries: 3,
      retryDelay: 1000,
      keepAlive: true,
    },
  },
};
```

## Security

### IAM Authentication

```typescript
export const database: DatabaseConfig = {
  driver: 'rds-data',
  rdsData: {
    resourceArn: process.env.RDS_DATA_RESOURCE_ARN,
    secretArn: process.env.RDS_DATA_SECRET_ARN,
    database: process.env.RDS_DATA_DATABASE,
    iamAuth: {
      enabled: true,
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    },
  },
};
```

### Query Validation

```typescript
export const database: DatabaseConfig = {
  driver: 'rds-data',
  rdsData: {
    // ... other config
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
  },
};
```

## Monitoring and Metrics

### Performance Metrics

```typescript
import { RDSDataMetrics } from '@zintrust/client-rds-data';

const metrics = new RDSDataMetrics();

// Get performance metrics
const performanceMetrics = await metrics.getPerformanceMetrics();
// Returns: {
//   totalQueries: number,
//   averageQueryTime: number,
//   slowQueries: number,
//   errorRate: number,
//   connectionPoolUtilization: number
// }

// Get database statistics
const dbStats = await metrics.getDatabaseStats();
// Returns: {
//   activeConnections: number,
//   totalConnections: number,
//   queryCount: number,
//   averageExecutionTime: number
// }
```

### Health Monitoring

```typescript
import { RDSDataHealthMonitor } from '@zintrust/client-rds-data';

const healthMonitor = new RDSDataHealthMonitor({
  interval: 30000, // Check every 30 seconds
  timeout: 5000,
  query: 'SELECT 1 as health_check',
});

// Health events
healthMonitor.on('healthy', () => {
  console.log('RDS Data API is healthy');
});

healthMonitor.on('unhealthy', (error) => {
  console.log('RDS Data API is unhealthy:', error.message);
  sendAlert('RDS Data API health check failed');
});

// Get current health status
const health = await healthMonitor.getHealth();
// Returns: { healthy: boolean, responseTime: number, lastCheck: Date, error?: string }
```

## Error Handling

### Custom Error Handler

```typescript
export const database: DatabaseConfig = {
  driver: 'rds-data',
  rdsData: {
    // ... other config
    errorHandler: (error, query, params) => {
      console.log('RDS Data query error:', error.message);
      console.log('Query:', query);
      console.log('Params:', params);

      // Log to monitoring system
      logError(error, { query, params });

      // Send alert for critical errors
      if (error.severity === 'critical') {
        sendAlert('RDS Data API error', error);
      }
    },
  },
};
```

### Error Types

```typescript
try {
  await User.find(1);
} catch (error) {
  if (error.code === 'ACCESS_DENIED') {
    console.log('Access denied - check IAM permissions');
  } else if (error.code === 'RESOURCE_NOT_FOUND') {
    console.log('Database resource not found');
  } else if (error.code === 'QUERY_TIMEOUT') {
    console.log('Query timed out');
  } else if (error.code === 'SECRET_NOT_FOUND') {
    console.log('Database secret not found');
  } else {
    console.log('RDS Data error:', error.message);
  }
}
```

## Testing

### Mock RDS Data

```typescript
import { RDSDataMock } from '@zintrust/client-rds-data';

// Use mock for testing
const mockRDS = new RDSDataMock({
  data: {
    users: [
      { id: 1, name: 'John', email: 'john@example.com', active: true },
      { id: 2, name: 'Jane', email: 'jane@example.com', active: false },
    ],
  },
});

// Test queries
const users = await mockRDS.query('SELECT * FROM users WHERE active = ?', [true]);
expect(users).toHaveLength(1);
expect(users[0].name).toBe('John');
```

### Integration Testing

```typescript
import { TestRDSData } from '@zintrust/client-rds-data';

// Use test RDS Data instance
const testRDS = new TestRDSData({
  resourceArn: 'test-resource-arn',
  secretArn: 'test-secret-arn',
  database: 'test_db',
  // Use local SQLite for testing
  localMode: true,
  databasePath: './test.db',
});

// Setup test data
await testRDS.query('INSERT INTO users (name, email) VALUES (?, ?)', [
  'Test User',
  'test@example.com',
]);

// Run tests
const result = await testRDS.query('SELECT * FROM users');
expect(result).toHaveLength(1);

// Cleanup
await testRDS.cleanup();
```

## Best Practices

1. **Use Transactions**: Use transactions for multi-statement operations
2. **Parameterized Queries**: Always use parameterized queries to prevent SQL injection
3. **Connection Pooling**: Configure appropriate connection pool settings
4. **Monitor Performance**: Track query performance and slow queries
5. **Error Handling**: Implement comprehensive error handling
6. **Security**: Use IAM authentication and proper access controls
7. **Batch Operations**: Use batch operations for better performance
8. **Query Optimization**: Optimize queries and use appropriate indexes

## Limitations

- **Query Size**: Maximum query size limitations
- **Result Size**: Maximum result set size limitations
- **Concurrent Queries**: Limited concurrent query execution
- **API Rate Limits**: AWS API rate limits apply
- **Network Latency**: Network latency to AWS RDS endpoints
- **Database Support**: Limited to supported database engines

## Troubleshooting

### Common Issues

1. **Access Denied**: Check IAM permissions and secret ARN
2. **Resource Not Found**: Verify resource ARN and database name
3. **Query Timeouts**: Increase timeout values or optimize queries
4. **Connection Errors**: Check network connectivity and credentials
5. **Performance Issues**: Use query optimization and connection pooling

### Debug Mode

```typescript
export const database: DatabaseConfig = {
  driver: 'rds-data',
  rdsData: {
    // ... other config
    debug: process.env.NODE_ENV === 'development',
    logging: {
      level: 'debug',
      logQueries: true,
      logParameters: false,
      logResults: false,
      logPerformance: true,
    },
  },
};
```
