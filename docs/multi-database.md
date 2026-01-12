# Multi-Database Connections

ZinTrust supports multiple database connections simultaneously, allowing you to:

- Connect to different databases (read/write separation, sharding, external services)
- Route models to specific databases
- Use different databases within the same request
- Mix connections per-query, per-model, or per-operation

This guide covers everything from configuration to advanced patterns.

## Table of Contents

- [Configuration](#configuration)
- [Using Models with Different Connections](#using-models-with-different-connections)
- [Using QueryBuilder with Different Connections](#using-querybuilder-with-different-connections)
- [In Controllers](#in-controllers)
- [Advanced Patterns](#advanced-patterns)
- [Read/Write Separation](#readwrite-separation)
- [Best Practices](#best-practices)

## Configuration

### Define Database Connections

Edit `src/config/database.ts` to define your connections:

```typescript
import { Env } from '@config/env';

const connections = {
  // Primary database
  sqlite: {
    driver: 'sqlite' as const,
    database: '.zintrust/dbs/zintrust.sqlite',
    migrations: 'database/migrations',
  },

  // Production database
  postgresql: {
    driver: 'postgresql' as const,
    host: Env.DB_HOST,
    port: Env.DB_PORT,
    database: Env.DB_DATABASE,
    username: Env.DB_USERNAME,
    password: Env.DB_PASSWORD,
    ssl: Env.getBool('DB_SSL', false),
  },

  // Analytics database (read-only)
  analytics: {
    driver: 'postgresql' as const,
    host: Env.DB_ANALYTICS_HOST,
    port: Env.DB_ANALYTICS_PORT,
    database: Env.DB_ANALYTICS_DATABASE,
    username: Env.DB_ANALYTICS_USERNAME,
    password: Env.DB_ANALYTICS_PASSWORD,
    ssl: Env.getBool('DB_ANALYTICS_SSL', false),
  },

  // Users shard database
  users_db: {
    driver: 'mysql' as const,
    host: Env.DB_USERS_HOST,
    port: Env.DB_USERS_PORT,
    database: Env.DB_USERS_DATABASE,
    username: Env.DB_USERS_USERNAME,
    password: Env.DB_USERS_PASSWORD,
  },

  // Orders shard database
  orders_db: {
    driver: 'mysql' as const,
    host: Env.DB_ORDERS_HOST,
    port: Env.DB_ORDERS_PORT,
    database: Env.DB_ORDERS_DATABASE,
    username: Env.DB_ORDERS_USERNAME,
    password: Env.DB_ORDERS_PASSWORD,
  },
} satisfies DatabaseConnections;

export const DatabaseConfig = Object.freeze({
  default: getDefaultConnection(connections),
  connections,
  // ... rest of config
});
```

**✅ Automatic Registration:** Connections are automatically registered during application boot via `registerDatabasesFromRuntimeConfig()`. You don't need to manually register them—just define them in `database.ts` and they're ready to use.

### Environment Variables

Set up your environment variables:

```bash
# Primary connection
DB_CONNECTION=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=zintrust_main
DB_USERNAME=postgres
DB_PASSWORD=secret
DB_SSL=false

# Analytics connection
DB_ANALYTICS_HOST=analytics.example.com
DB_ANALYTICS_PORT=5432
DB_ANALYTICS_DATABASE=analytics_db
DB_ANALYTICS_USERNAME=analytics_user
DB_ANALYTICS_PASSWORD=analytics_secret

# Sharded connections
DB_USERS_HOST=users-shard-1.example.com
DB_USERS_PORT=3306
DB_USERS_DATABASE=users_shard_1
DB_USERS_USERNAME=shard_user
DB_USERS_PASSWORD=shard_secret

DB_ORDERS_HOST=orders-shard-1.example.com
DB_ORDERS_PORT=3306
DB_ORDERS_DATABASE=orders_shard_1
DB_ORDERS_USERNAME=shard_user
DB_ORDERS_PASSWORD=shard_secret
```

## Using Models with Different Connections

### Method 1: Define Connection in Model Config

Specify the connection directly in your model definition:

```typescript
// app/Models/User.ts
import { Model } from '@zintrust/core';

export const User = Model.define(
  {
    table: 'users',
    fillable: ['name', 'email', 'password'],
    timestamps: true,
    // All User operations use the 'users_db' connection
    connection: 'users_db',
  },
  {
    isAdmin(model: IModel) {
      return model.getAttribute('is_admin') === 1;
    },
  }
);
```

**Usage:**

```typescript
// All queries automatically use 'users_db' connection
const user = await User.find(1);
const admins = await User.where('is_admin', '=', 1).get();
const newUser = await User.create({ name: 'John', email: 'john@example.com' });
await newUser.save(); // Saves to users_db
```

### Method 2: Switch Connection at Runtime with `.db()`

Use the `.db()` method to temporarily switch to a different connection for a specific operation:

```typescript
// app/Models/AnalyticsEvent.ts
import { Model } from '@zintrust/core';

export const AnalyticsEvent = Model.define(
  {
    table: 'events',
    fillable: ['event_type', 'user_id', 'data'],
    timestamps: true,
    // Default connection
    connection: 'postgresql',
  },
  {}
);
```

**Usage:**

```typescript
// Use primary connection (postgresql)
const recentEvents = await AnalyticsEvent.where('created_at', '>', oneHourAgo).get();

// Switch to analytics database for this operation
const analyticsEvents = await AnalyticsEvent.db('analytics')
  .where('event_type', '=', 'purchase')
  .orderBy('created_at', 'DESC')
  .limit(100)
  .get();

// Back to primary connection
const allEvents = await AnalyticsEvent.all();
```

### Method 3: Model with Different Connections per Relationship

Models can load relationships from different databases:

```typescript
// app/Models/User.ts
import { Model } from '@zintrust/core';
import { Post } from '@app/Models/Post';
import { AnalyticsEvent } from '@app/Models/AnalyticsEvent';

export const User = Model.define(
  {
    table: 'users',
    fillable: ['name', 'email'],
    timestamps: true,
    connection: 'users_db', // Primary connection
  },
  {
    // Posts from same database
    posts(model: IModel) {
      return model.hasMany(Post); // Post uses users_db too
    },

    // Analytics from different database
    analytics(model: IModel) {
      // Manually load from analytics database
      // See "Advanced Patterns" section
      return model.hasMany(AnalyticsEvent);
    },
  }
);

// app/Models/Post.ts
export const Post = Model.define(
  {
    table: 'posts',
    fillable: ['title', 'content', 'user_id'],
    timestamps: true,
    connection: 'users_db', // Same as User
  },
  {
    author(model: IModel) {
      return model.belongsTo(User);
    },
  }
);

// app/Models/AnalyticsEvent.ts
export const AnalyticsEvent = Model.define(
  {
    table: 'events',
    fillable: ['event_type', 'user_id', 'data'],
    timestamps: true,
    connection: 'analytics', // Different database
  },
  {}
);
```

## Using QueryBuilder with Different Connections

### Method 1: Direct QueryBuilder with Specific Connection

Use `QueryBuilder.create()` with a specific database instance:

```typescript
import { useDatabase } from '@zintrust/core';
import { QueryBuilder } from '@zintrust/core';

export const ReportController = {
  async getUserMetrics(req: IRequest, res: IResponse): Promise<void> {
    try {
      // Get specific database connection
      const analyticsDb = await useEnsureDbConnected(undefined, 'analytics');

      // Use QueryBuilder with analytics database
      const metrics = await QueryBuilder.create('user_metrics', analyticsDb)
        .select('user_id', 'total_purchases', 'avg_purchase_amount', 'last_purchase_date')
        .where('total_purchases', '>', 0)
        .orderBy('total_purchases', 'DESC')
        .limit(100)
        .get();

      res.json({ data: metrics });
    } catch (error) {
      Logger.error('Error fetching metrics:', error);
      res.setStatus(500).json({ error: 'Failed to fetch metrics' });
    }
  },
};
```

### Method 2: Query Helper with Connection Parameter

```typescript
import { query } from '@zintrust/core';

export const ShardController = {
  async getUserFromShard(req: IRequest, res: IResponse): Promise<void> {
    try {
      const userId = req.params.id;

      // Query users_db shard database
      const user = await query('users', 'users_db').where('id', '=', userId).limit(1).first();

      if (!user) {
        return res.setStatus(404).json({ error: 'User not found' });
      }

      res.json({ data: user });
    } catch (error) {
      Logger.error('Error fetching user:', error);
      res.setStatus(500).json({ error: 'Failed to fetch user' });
    }
  },
};
```

### Method 3: Direct Database API

Access any configured database directly:

```typescript
import { useDatabase } from '@zintrust/core';

export const CustomQueryController = {
  async complexAnalysis(req: IRequest, res: IResponse): Promise<void> {
    try {
      const analyticsDb = await useEnsureDbConnected(undefined, 'analytics');

      // ⚠️ Raw SQL - Use only when QueryBuilder doesn't support your needs
      // Raw SQL should be avoided when possible. Use QueryBuilder instead.
      const results = await analyticsDb.query(
        `
        SELECT
          DATE(created_at) as date,
          COUNT(*) as total_events,
          COUNT(DISTINCT user_id) as unique_users,
          SUM(CASE WHEN event_type = 'purchase' THEN 1 ELSE 0 END) as purchases
        FROM events
        WHERE created_at >= $1
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        `,
        [new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] // Last 30 days
      );

      res.json({ data: results });
    } catch (error) {
      Logger.error('Error running analysis:', error);
      res.setStatus(500).json({ error: 'Analysis failed' });
    }
  },
};
```

## In Controllers

### Complete Controller Example with Multiple Databases

```typescript
import { useEnsureDbConnected } from '@zintrust/core';
import { QueryBuilder } from '@zintrust/core';
import { User } from '@app/Models/User';
import { Order } from '@app/Models/Order';
import { AnalyticsEvent } from '@app/Models/AnalyticsEvent';
import type { IRequest, IResponse } from '@zintrust/core';

export const MultiDbController = Object.freeze({
  create() {
    return {
      /**
       * Create user (users_db) and log event (analytics)
       */
      async createUserWithAnalytics(req: IRequest, res: IResponse): Promise<void> {
        try {
          const { name, email } = req.getBody() as {
            name: string;
            email: string;
          };

          // Create user in users_db (defined in model config)
          const user = User.create({ name, email });
          await user.save();

          // Log event in analytics database
          const analyticsDb = await useEnsureDbConnected(undefined, 'analytics');
          await QueryBuilder.create('events', analyticsDb).insert({
            event_type: 'user_created',
            user_id: user.getAttribute('id'),
            data: JSON.stringify({ name, email }),
            created_at: new Date().toISOString(),
          });

          res.setStatus(201).json({
            message: 'User created',
            data: user.toJSON(),
          });
        } catch (error) {
          Logger.error('Error creating user:', error);
          res.setStatus(500).json({ error: 'Failed to create user' });
        }
      },

      /**
       * Get user with order count from different shards
       */
      async getUserWithOrderStats(req: IRequest, res: IResponse): Promise<void> {
        try {
          const userId = req.params.id;

          // Get user from users_db
          const user = await User.find(userId);
          if (!user) {
            return res.setStatus(404).json({ error: 'User not found' });
          }

          // Get order stats from orders_db
          const ordersDb = await useEnsureDbConnected(undefined, 'orders_db');
          const stats = await QueryBuilder.create('orders', ordersDb)
            .select(
              QueryBuilder.raw('COUNT(*) as total_orders'),
              QueryBuilder.raw('SUM(total_amount) as total_spent'),
              QueryBuilder.raw('AVG(total_amount) as avg_order_value'),
              QueryBuilder.raw('MAX(created_at) as last_order_date')
            )
            .where('user_id', '=', userId)
            .first();

          res.json({
            data: {
              user: user.toJSON(),
              order_stats: stats,
            },
          });
        } catch (error) {
          Logger.error('Error fetching user stats:', error);
          res.setStatus(500).json({ error: 'Failed to fetch stats' });
        }
      },

      /**
       * Get analytics across multiple sources
       */
      async getDashboard(req: IRequest, res: IResponse): Promise<void> {
        try {
          const analyticsDb = await useEnsureDbConnected(undefined, 'analytics');

          // Get from analytics database
          const [userGrowth, purchaseMetrics, topEvents] = await Promise.all([
            QueryBuilder.create('user_growth', analyticsDb)
              .select('date', 'new_users', 'active_users')
              .where('date', '>=', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
              .orderBy('date', 'DESC')
              .get(),

            QueryBuilder.create('purchase_metrics', analyticsDb)
              .select(
                QueryBuilder.raw('SUM(amount) as total_revenue'),
                QueryBuilder.raw('COUNT(DISTINCT user_id) as unique_buyers'),
                QueryBuilder.raw('AVG(amount) as avg_purchase')
              )
              .where('date', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
              .first(),

            QueryBuilder.create('events', analyticsDb)
              .select('event_type', QueryBuilder.raw('COUNT(*) as count'))
              .where('created_at', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
              .groupBy('event_type')
              .orderBy('count', 'DESC')
              .limit(10)
              .get(),
          ]);

          res.json({
            dashboard: {
              user_growth: userGrowth,
              purchase_metrics: purchaseMetrics,
              top_events: topEvents,
            },
          });
        } catch (error) {
          Logger.error('Error generating dashboard:', error);
          res.setStatus(500).json({ error: 'Failed to generate dashboard' });
        }
      },

      /**
       * Search across multiple databases
       */
      async globalSearch(req: IRequest, res: IResponse): Promise<void> {
        try {
          const query = req.query.q as string;
          if (!query || query.length < 3) {
            return res.setStatus(400).json({
              error: 'Search query must be at least 3 characters',
            });
          }

          // Search users in users_db
          const users = await User.where('name', 'LIKE', `%${query}%`).limit(10).get();

          // Search orders in orders_db
          const ordersDb = await useEnsureDbConnected(undefined, 'orders_db');
          const orders = await QueryBuilder.create('orders', ordersDb)
            .select('id', 'user_id', 'total_amount', 'created_at')
            .where(QueryBuilder.raw(`CONCAT(id, '-', user_id) LIKE ?`, [`%${query}%`]))
            .limit(10)
            .get();

          // Search events in analytics
          const analyticsDb = await useEnsureDbConnected(undefined, 'analytics');
          const events = await QueryBuilder.create('events', analyticsDb)
            .select('id', 'event_type', 'user_id', 'data', 'created_at')
            .where('event_type', 'LIKE', `%${query}%`)
            .limit(10)
            .get();

          res.json({
            results: {
              users,
              orders,
              events,
            },
          });
        } catch (error) {
          Logger.error('Error performing global search:', error);
          res.setStatus(500).json({ error: 'Search failed' });
        }
      },
    };
  },
});
```

## Advanced Patterns

### Pattern 1: Dynamic Shard Selection

```typescript
// utils/ShardRouter.ts
import { useDatabase } from '@zintrust/core';

export const ShardRouter = Object.freeze({
  /**
   * Determine which shard a user belongs to
   */
  getUserShard(userId: number): string {
    const shardCount = 4; // Number of shards
    const shardIndex = userId % shardCount;
    return `users_shard_${shardIndex + 1}`;
  },

  /**
   * Get database instance for user's shard
   */
  async getUserDb(userId: number) {
    const shardName = ShardRouter.getUserShard(userId);
    return useEnsureDbConnected(undefined, shardName);
  },

  /**
   * Determine which shard an order belongs to
   */
  getOrderShard(orderId: number): string {
    const shardCount = 8;
    const shardIndex = orderId % shardCount;
    return `orders_shard_${shardIndex + 1}`;
  },

  /**
   * Get database instance for order's shard
   */
  async getOrderDb(orderId: number) {
    const shardName = ShardRouter.getOrderShard(orderId);
    return useEnsureDbConnected(undefined, shardName);
  },
});
```

**Usage:**

```typescript
import { ShardRouter } from '@utils/ShardRouter';
import { QueryBuilder } from '@zintrust/core';

export const ShardedController = {
  async getUserFromShard(req: IRequest, res: IResponse): Promise<void> {
    try {
      const userId = parseInt(req.params.id);

      // Get the correct shard for this user
      const userDb = await ShardRouter.getUserDb(userId);

      const user = await QueryBuilder.create('users', userDb).where('id', '=', userId).first();

      if (!user) {
        return res.setStatus(404).json({ error: 'User not found' });
      }

      res.json({ data: user });
    } catch (error) {
      Logger.error('Error fetching user:', error);
      res.setStatus(500).json({ error: 'Failed to fetch user' });
    }
  },

  async createOrderInShard(req: IRequest, res: IResponse): Promise<void> {
    try {
      const { user_id, total_amount } = req.getBody() as {
        user_id: number;
        total_amount: number;
      };

      // Use first shard initially (order ID not yet known)
      const ordersDb = await useEnsureDbConnected(undefined, 'orders_shard_1');

      const result = await QueryBuilder.create('orders', ordersDb).insert({
        user_id,
        total_amount,
        created_at: new Date().toISOString(),
      });

      // After getting order ID, could redistribute to correct shard if needed
      const orderId = result.insertId;

      res.setStatus(201).json({
        message: 'Order created',
        data: { id: orderId, user_id, total_amount },
      });
    } catch (error) {
      Logger.error('Error creating order:', error);
      res.setStatus(500).json({ error: 'Failed to create order' });
    }
  },
};
```

### Pattern 2: Cross-Database Transactions

```typescript
export const CrossDbService = Object.freeze({
  /**
   * Transfer data between databases with consistency checks
   */
  async transferUserData(
    userId: number,
    fromConnection: string,
    toConnection: string
  ): Promise<void> {
    const fromDb = await useEnsureDbConnected(undefined, fromConnection);
    const toDb = await useEnsureDbConnected(undefined, toConnection);

    // Read from source
    const user = await QueryBuilder.create('users', fromDb).where('id', '=', userId).first();

    if (!user) {
      throw new Error('User not found in source database');
    }

    // Write to destination with transaction
    await toDb.transaction(async (db) => {
      // Check if already exists
      const existing = await QueryBuilder.create('users', db).where('id', '=', userId).first();

      if (existing) {
        throw new Error('User already exists in destination database');
      }

      // Insert
      await QueryBuilder.create('users', db).insert(user);
    });

    Logger.info('User transferred successfully', {
      userId,
      from: fromConnection,
      to: toConnection,
    });
  },

  /**
   * Sync data between databases
   */
  async syncUserDataToAnalytics(userId: number): Promise<void> {
    const mainDb = await useEnsureDbConnected(undefined, 'postgresql');
    const analyticsDb = await useEnsureDbConnected(undefined, 'analytics');

    // Get user data
    const user = await QueryBuilder.create('users', mainDb).where('id', '=', userId).first();

    if (!user) return;

    // Upsert in analytics
    await analyticsDb.transaction(async (db) => {
      const existing = await QueryBuilder.create('user_snapshot', db)
        .where('user_id', '=', userId)
        .first();

      if (existing) {
        // Update
        await QueryBuilder.create('user_snapshot', db)
          .where('user_id', '=', userId)
          .update({
            ...user,
            synced_at: new Date().toISOString(),
          });
      } else {
        // Insert
        await QueryBuilder.create('user_snapshot', db).insert({
          ...user,
          synced_at: new Date().toISOString(),
        });
      }
    });
  },
});
```

### Pattern 3: Fallback Database Strategy

```typescript
export const ResilientController = {
  /**
   * Try primary database, fallback to replica
   */
  async getUserResilient(req: IRequest, res: IResponse): Promise<void> {
    try {
      const userId = req.params.id;

      try {
        // Try primary first
        const user = await User.find(userId);
        return res.json({ data: user, source: 'primary' });
      } catch (primaryError) {
        Logger.warn('Primary database failed, trying replica', {
          error: primaryError.message,
        });

        // Fallback to replica
        const replicaDb = await useEnsureDbConnected(undefined, 'replica');
        const user = await QueryBuilder.create('users', replicaDb).where('id', '=', userId).first();

        if (!user) {
          return res.setStatus(404).json({ error: 'User not found' });
        }

        res.json({ data: user, source: 'replica' });
      }
    } catch (error) {
      Logger.error('Error fetching user:', error);
      res.setStatus(500).json({ error: 'Failed to fetch user' });
    }
  },
};
```

## Read/Write Separation

### Model-Level Read/Write Split

```typescript
// Models automatically handle read/write separation if configured

// src/config/database.ts
const connections = {
  postgresql: {
    driver: 'postgresql' as const,
    host: 'write.db.example.com', // Write host
    port: 5432,
    database: 'zintrust',
    username: 'app_user',
    password: process.env.DB_PASSWORD,

    // Read replicas (optional)
    readHosts: [
      'read-replica-1.db.example.com',
      'read-replica-2.db.example.com',
      'read-replica-3.db.example.com',
    ],
  },
};
```

**Automatic behavior:**

- `Model.create()`, `model.save()`, `model.delete()` → Write host
- `Model.find()`, `Model.where()`, `Model.all()` → Read replica (round-robin)
- `QueryBuilder` respects the `isRead` parameter automatically

### Manual Read/Write Control

```typescript
export const PerformanceController = {
  async getAnalytics(req: IRequest, res: IResponse): Promise<void> {
    try {
      const db = await useEnsureDbConnected();

      // ⚠️ Raw SQL - Use only when QueryBuilder doesn't support your needs
      // Raw SQL should be avoided when possible. Use QueryBuilder instead.
      const heavyAnalysis = await db.query(
        `
        SELECT
          DATE(created_at) as date,
          COUNT(*) as total,
          SUM(amount) as revenue
        FROM orders
        WHERE created_at >= $1
        GROUP BY DATE(created_at)
        `,
        [new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)],
        true // isRead = true, use read replica
      );

      res.json({ data: heavyAnalysis });
    } catch (error) {
      Logger.error('Error fetching analytics:', error);
      res.setStatus(500).json({ error: 'Failed to fetch analytics' });
    }
  },
};
```

## Best Practices

### 1. Always Define Connection in Model Config

```typescript
// ✅ Good - explicitly specify connection
export const User = Model.define(
  {
    table: 'users',
    fillable: ['name', 'email'],
    connection: 'users_db', // Explicit
  },
  {}
);

// ❌ Avoid - ambiguous which database is used
export const User = Model.define(
  {
    table: 'users',
    fillable: ['name', 'email'],
    // connection not specified, uses default
  },
  {}
);
```

### 2. Document Database Ownership

```typescript
/**
 * User Model
 *
 * **Database**: users_db (MySQL shard)
 * **Replication**: Master-slave with 3 read replicas
 * **Failover**: Automatic via HAProxy
 * **Retention**: 2 years
 *
 * Related models:
 * - Post (same shard)
 * - UserPreferences (same shard)
 * - AnalyticsEvent (analytics database)
 */
export const User = Model.define(
  {
    table: 'users',
    fillable: ['name', 'email', 'password'],
    connection: 'users_db',
    timestamps: true,
  },
  {}
);
```

### 3. Handle Connection Failures Gracefully

```typescript
export const SafeController = {
  async getUser(req: IRequest, res: IResponse): Promise<void> {
    try {
      const user = await User.find(req.params.id);
      res.json({ data: user });
    } catch (error) {
      // Distinguish between different error types
      if (error.code === 'ECONNREFUSED') {
        Logger.error('Database connection refused:', error);
        return res.setStatus(503).json({
          error: 'Service temporarily unavailable',
        });
      }

      if (error.code === 'PROTOCOL_CONNECTION_LOST') {
        Logger.error('Database connection lost:', error);
        return res.setStatus(503).json({
          error: 'Database connection lost',
        });
      }

      Logger.error('Unexpected error:', error);
      res.setStatus(500).json({ error: 'Internal server error' });
    }
  },
};
```

### 4. Use Transactions for Cross-Database Consistency

```typescript
export const TransactionController = {
  /**
   * When writing to multiple databases, use transactions per database
   */
  async createUserWithOrders(req: IRequest, res: IResponse): Promise<void> {
    try {
      const { name, email, orders } = req.getBody() as {
        name: string;
        email: string;
        orders: Array<{ product_id: number; quantity: number }>;
      };

      // Transaction 1: User creation
      const user = await User.create({ name, email });
      await user.save(); // Implicit transaction

      // Transaction 2: Order creation in separate shard
      const ordersDb = await useEnsureDbConnected(undefined, 'orders_db');
      await ordersDb.transaction(async (db) => {
        for (const order of orders) {
          await QueryBuilder.create('orders', db).insert({
            user_id: user.getAttribute('id'),
            product_id: order.product_id,
            quantity: order.quantity,
            created_at: new Date().toISOString(),
          });
        }
      });

      res.setStatus(201).json({
        message: 'User and orders created',
        data: { user: user.toJSON() },
      });
    } catch (error) {
      Logger.error('Error creating user with orders:', error);
      // Note: User was created in one DB, orders may not be created
      // Consider implementing compensation logic or distributed transactions
      res.setStatus(500).json({ error: 'Failed to create user' });
    }
  },
};
```

### 5. Monitor Connection Pool Usage

```typescript
import { Logger } from '@zintrust/core';

export const HealthController = {
  async checkDatabaseHealth(req: IRequest, res: IResponse): Promise<void> {
    try {
      const mainDb = await useEnsureDbConnected(undefined, 'postgresql');
      const analyticsDb = await useEnsureDbConnected(undefined, 'analytics');
      const usersDb = await useEnsureDbConnected(undefined, 'users_db');

      const health = {
        databases: {
          postgresql: {
            connected: mainDb.isConnected(),
            type: mainDb.getType(),
          },
          analytics: {
            connected: analyticsDb.isConnected(),
            type: analyticsDb.getType(),
          },
          users_db: {
            connected: usersDb.isConnected(),
            type: usersDb.getType(),
          },
        },
        timestamp: new Date().toISOString(),
      };

      const allConnected = Object.values(health.databases).every((db) => db.connected);

      res.json({
        status: allConnected ? 'healthy' : 'degraded',
        ...health,
      });
    } catch (error) {
      Logger.error('Health check failed:', error);
      res.setStatus(500).json({ status: 'unhealthy', error: error.message });
    }
  },
};
```

### 6. Logging and Debugging

```typescript
// Enable query logging for specific databases during development
export const setupDbLogging = () => {
  const mainDb = useDatabase(undefined, 'postgresql');
  const analyticsDb = useDatabase(undefined, 'analytics');

  // Log all queries to primary database
  mainDb.onBeforeQuery((sql, params) => {
    Logger.debug('PostgreSQL Query', { sql, params });
  });

  mainDb.onAfterQuery((sql, params, duration) => {
    if (duration > 1000) {
      Logger.warn('Slow query detected', {
        sql,
        duration: `${duration}ms`,
      });
    }
  });

  // Log analytics queries only if slow
  analyticsDb.onAfterQuery((sql, params, duration) => {
    if (duration > 5000) {
      Logger.warn('Slow analytics query', {
        sql,
        duration: `${duration}ms`,
      });
    }
  });
};
```

## Summary

| Task                            | Method                         | Example                                        |
| ------------------------------- | ------------------------------ | ---------------------------------------------- |
| Define connection               | Model config                   | `connection: 'users_db'`                       |
| Switch connection temporarily   | `.db()` method                 | `User.db('analytics').find(1)`                 |
| Use QueryBuilder on specific DB | Pass DB instance               | `QueryBuilder.create('table', db)`             |
| Access any database             | `useDatabase()`                | `useDatabase(config, 'connection_name')`       |
| Read/write split                | `readHosts` in config          | Automatic, read queries→replicas               |
| Shard routing                   | Custom function                | Calculate shard ID, use appropriate connection |
| Cross-DB consistency            | Transactions per DB            | Use `db.transaction()` for each database       |
| Handle failures                 | Try/catch with specific errors | Fallback to replica on primary failure         |

ZinTrust makes multi-database architectures seamless while maintaining type safety and performance across your entire application.
