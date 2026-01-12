# Database config

- Source: `src/config/database.ts`

## What this file does

`src/config/database.ts` is the single source-of-truth for **named database connections**.

- `connections` is a map of **connection name → connection config**.
  - Names are arbitrary keys like `sqlite`, `postgresql`, `mysql`, `auth`, `tasks`, `mysql2`, `mysql3`, etc.
- `default` picks which configured name is considered the default.
  - `DB_CONNECTION` can point to _any_ key that exists in `connections`.

At runtime, ZinTrust automatically registers all configured connections during application boot.
That means once the app has booted, you can use those names with `Model.db('name')` (or `useDatabase(undefined, 'name')`).

## Example: two MySQL pools (`mysql2` and `mysql3`)

Yes — a developer can do this in `src/config/database.ts`:

```ts
const connections = {
  mysql: {
    driver: 'mysql' as const,
    host: Env.DB_HOST,
    port: Env.DB_PORT,
    database: Env.DB_DATABASE,
    username: Env.DB_USERNAME,
    password: Env.DB_PASSWORD,
    pooling: {
      enabled: Env.getBool('DB_POOLING', true),
      min: Env.getInt('DB_POOL_MIN', 5),
      max: Env.getInt('DB_POOL_MAX', 20),
    },
  },

  mysql2: {
    driver: 'mysql' as const,
    host: Env.get('DB2_HOST', Env.DB_HOST),
    port: Env.getInt('DB2_PORT', Env.DB_PORT),
    database: Env.get('DB2_DATABASE', Env.DB_DATABASE),
    username: Env.get('DB2_USERNAME', Env.DB_USERNAME),
    password: Env.get('DB2_PASSWORD', Env.DB_PASSWORD),
    pooling: {
      enabled: Env.getBool('DB2_POOLING', true),
      min: Env.getInt('DB2_POOL_MIN', 5),
      max: Env.getInt('DB2_POOL_MAX', 20),
    },
  },

  mysql3: {
    driver: 'mysql' as const,
    host: Env.get('DB3_HOST', Env.DB_HOST),
    port: Env.getInt('DB3_PORT', Env.DB_PORT),
    database: Env.get('DB3_DATABASE', Env.DB_DATABASE),
    username: Env.get('DB3_USERNAME', Env.DB_USERNAME),
    password: Env.get('DB3_PASSWORD', Env.DB_PASSWORD),
    pooling: {
      enabled: Env.getBool('DB3_POOLING', true),
      min: Env.getInt('DB3_POOL_MIN', 5),
      max: Env.getInt('DB3_POOL_MAX', 20),
    },
  },
} as const;
```

Notes:

- If `mysql2/mysql3` reuse the exact same host/port/database/credentials, they will connect to the same DB.
  Use different env vars (as above) if you want different targets or independent pools.
- `DB_CONNECTION` can be set to `mysql`, `mysql2`, or `mysql3` (as long as that key exists in `connections`).

## Usage: route a model operation to `mysql3`

After application boot, this works:

```ts
import { User } from '@app/Models/User';

await User.db('mysql3').query().where('id', 1).first();
await User.db('mysql3').create({ name: 'Jane' }).save();
```

If you call `User.db('unknown')...` (or `useDatabase(undefined, 'unknown')`) and that name is not configured/registered, ZinTrust throws.

````

## Snapshot (bottom)

```ts
      username: Env.DB_USERNAME,
      password: Env.DB_PASSWORD,
      ssl: Env.getBool('DB_SSL', false),
      pooling: {
        enabled: Env.getBool('DB_POOLING', true),
        min: Env.getInt('DB_POOL_MIN', 5),
        max: Env.getInt('DB_POOL_MAX', 20),
        idleTimeout: Env.getInt('DB_IDLE_TIMEOUT', 30000),
        connectionTimeout: Env.getInt('DB_CONNECTION_TIMEOUT', 10000),
      },
    },
    mysql: {
      driver: 'mysql' as const,
      host: Env.DB_HOST,
      port: Env.DB_PORT,
      database: Env.DB_DATABASE,
      username: Env.DB_USERNAME,
      password: Env.DB_PASSWORD,
      pooling: {
        enabled: Env.getBool('DB_POOLING', true),
        min: Env.getInt('DB_POOL_MIN', 5),
        max: Env.getInt('DB_POOL_MAX', 20),
      },
    },
  },

  /**
   * Get current connection config
   */
  getConnection(this: DatabaseConfigShape): DatabaseConnectionConfig {
    return getDatabaseConnection(this);
  },

  /**
   * Enable query logging
   */
  logging: {
    enabled: Env.DEBUG,
    level: Env.get('DB_LOG_LEVEL', 'debug'),
  },

  /**
   * Migration settings
   */
  migrations: {
    directory: 'database/migrations',
    extension: Env.get('DB_MIGRATION_EXT', '.ts'),
  },

  /**
   * Seeding settings
   */
  seeders: {
    directory: 'database/seeders',
  },
};

export const databaseConfig = Object.freeze(databaseConfigObj);
export type DatabaseConfig = typeof databaseConfig;

````
