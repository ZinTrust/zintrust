# Models & ORM

ZinTrust features a powerful, zero-dependency ORM that provides a clean, ActiveRecord-like interface for interacting with your database.

## Table of Contents

- [Interface Reference](#interface-reference)
- [Model Definition](#model-definition)
- [Multi-Database Support](#multi-database-support)
- [Querying](#querying)
- [Relationships](#relationships)
  - [Basic Relationships](#basic-relationships)
  - [Loading Relationships](#loading-relationships)
  - [Advanced Relationships](#advanced-relationships)
- [Persistence](#persistence)
- [Soft Deletes](#soft-deletes)
- [Attribute Casting](#attribute-casting)
- [Accessors & Mutators](#accessors--mutators)
- [Model Observers](#model-observers)
- [Query Scopes](#query-scopes)
- [Best Practices](#best-practices)

## Interface Reference

```typescript
export interface IModel {
  fill(attributes: Record\<string, unknown>): IModel;
  setAttribute(key: string, value: unknown): IModel;
  getAttribute(key: string): unknown;
  getAttributes(): Record\<string, unknown>;
  save(): Promise\<boolean>;
  delete(): Promise\<boolean>;
  toJSON(): Record\<string, unknown>;
  isDirty(key?: string): boolean;
  getTable(): string;
  exists(): boolean;
  setExists(exists: boolean): void;
  hasOne(relatedModel: ModelStatic, foreignKey?: string): IRelationship;
  hasMany(relatedModel: ModelStatic, foreignKey?: string): IRelationship;
  belongsTo(relatedModel: ModelStatic, foreignKey?: string): IRelationship;
  belongsToMany(
    relatedModel: ModelStatic,
    throughTable?: string,
    foreignKey?: string,
    relatedKey?: string
  ): IRelationship;
}

export interface ModelConfig {
  table: string;
  fillable: string[];
  hidden: string[];
  timestamps: boolean;
  casts: Record\<string, string>;
  softDeletes?: boolean;
  accessors?: Record\<string, (value: unknown, attrs: Record\<string, unknown>) => unknown>;
  mutators?: Record\<string, (value: unknown, attrs: Record\<string, unknown>) => unknown>;
  scopes?: Record\<string, (builder: IQueryBuilder, ...args: unknown[]) => IQueryBuilder>;
  observers?: Array\<{
    saving?: (model: IModel) => void | Promise\<void>;
    saved?: (model: IModel) => void | Promise\<void>;
    creating?: (model: IModel) => void | Promise\<void>;
    created?: (model: IModel) => void | Promise\<void>;
    updating?: (model: IModel) => void | Promise\<void>;
    updated?: (model: IModel) => void | Promise\<void>;
    deleting?: (model: IModel) => void | Promise\<void>;
    deleted?: (model: IModel) => void | Promise\<void>;
  }>;
  connection?: string;
}
```

## Defining Models

Models are typically stored in the `app/Models` directory. You can generate a new model using the CLI:

```bash
zin add model User
```

A basic model looks like this:

```typescript
import { IModel, Model } from '@zintrust/core';

export const User = Model.define(
  {
    connection: 'default',
    table: 'users',
    fillable: ['name', 'email', 'password'],
    hidden: ['password'],
    timestamps: true,
    casts: {
      is_admin: 'boolean',
      metadata: 'json',
    },
  },
  {
    isAdmin(model: IModel) {
      return model.getAttribute('is_admin') === true;
    },
  }
);
```

### Safe Mass Assignment (fillable)

`fillable` is a **mass-assignment allow-list** used by `Model.create({...})` and `model.fill({...})`.

- If `fillable` contains keys, only those keys are accepted.
- If `fillable` is an empty array (`[]`), **all keys are accepted**.

For scaffolds and real apps, prefer a strict `fillable` allow-list.

### Custom Methods

ZinTrust supports adding custom model methods via the second argument to `Model.define(...)`.

1. **Unbound method map** (existing pattern): methods receive the model instance as the first argument.

2. **Plan function** (new pattern): provide a factory `(model) => ({ ...methods })` that returns _bound_ methods.
   This is convenient for helpers built around `getAttribute(...)` / `setAttribute(...)`.

### Using Models in Controllers & Services

You can import models using **static imports** (at module level) or **dynamic imports** (in async functions):

```typescript
// ✅ Static import (preferred for top-level code)
import { User } from '@app/Models/User';

export const UserController = {
  async index(req, res) {
    const users = await User.all();
    res.json({ data: users });
  },
};
```

```typescript
// ✅ Dynamic import (preferred in async functions, error handlers)
async function fetchUser(id) {
  const { User } = await import('@app/Models/User');
  return await User.find(id);
}
```

Both patterns work. Choose based on your context: use static imports for cleaner module-level code, dynamic imports for conditional or error-handling paths.

## Multi-Database Support

ZinTrust supports multiple database connections. You can specify which connection a model should use by setting `connection` in `Model.define(...)`.

```typescript
import { Model } from '@zintrust/core';

export const ExternalUser = Model.define({
  connection: 'external_db',
  table: 'users',
  fillable: ['name', 'email'],
  hidden: [],
  timestamps: false,
  casts: {},
});
```

You can initialize connections in your application bootstrap:

````typescript
import { useDatabase } from '@zintrust/core';

useDatabase(
  {
    driver: 'mysql',
    host: 'remote-host',
    // ...
  },
  'external_db'
);

### Per-operation override

If you need to run a query against a different connection **without redefining the model**, use the chainable `Model.db(name)` override:

```ts
// Use the default model connection
await ExternalUser.query().where('is_active', true).get();

// Temporarily route this operation to a different connection
await ExternalUser.db('external_db').query().where('is_active', true).get();

// Works for creates too
await ExternalUser.db('external_db').create({ name: 'Jane', email: 'jane@example.com' }).save();
````

````

## Querying

The ORM uses a fluent `QueryBuilder` to construct SQL queries safely.

### Basic Queries

```typescript
// QueryBuilder returns plain rows (objects)
const rows = await User.query().get();

// For model instances, use the model helpers
const user = await User.find(1);

// Where clauses
const activeUsers = await User.query().where('is_active', true).where('age', '>', 18).get();
````

### Relationships

ZinTrust supports standard relationships: `HasOne`, `HasMany`, `BelongsTo`, and `BelongsToMany`, as well as advanced relationships like polymorphic relations and through relations.

#### Basic Relationships

##### HasOne

One-to-one relationship (e.g., User has one Profile):

```typescript
import { Profile } from '@app/Models/Profile';
import { IModel, Model } from '@zintrust/core';

export const User = Model.define(
  {
    table: 'users',
    fillable: ['name', 'email'],
    hidden: [],
    timestamps: true,
    casts: {},
  },
  {
    profile(model: IModel) {
      return model.hasOne(Profile);
    },
  }
);
```

##### HasMany

One-to-many relationship (e.g., User has many Posts):

```typescript
import { Post } from '@app/Models/Post';
import { IModel, Model } from '@zintrust/core';

export const User = Model.define(
  {
    table: 'users',
    fillable: ['name', 'email'],
    hidden: [],
    timestamps: true,
    casts: {},
  },
  {
    posts(model: IModel) {
      return model.hasMany(Post);
    },
  }
);
```

##### BelongsTo

Inverse of HasOne/HasMany (e.g., Post belongs to User):

```typescript
import { User } from '@app/Models/User';
import { IModel, Model } from '@zintrust/core';

export const Post = Model.define(
  {
    table: 'posts',
    fillable: ['title', 'content', 'user_id'],
    hidden: [],
    timestamps: true,
    casts: {},
  },
  {
    user(model: IModel) {
      return model.belongsTo(User);
    },
  }
);
```

##### BelongsToMany (Pivot Tables)

Many-to-many relationship (e.g., Post has many Tags, Tag has many Posts):

```typescript
import { Tag } from '@app/Models/Tag';
import { IModel, Model } from '@zintrust/core';

export const Post = Model.define(
  {
    table: 'posts',
    fillable: ['title', 'content'],
    hidden: [],
    timestamps: true,
    casts: {},
  },
  {
    tags(model: IModel) {
      return model.belongsToMany(Tag);
    },
  }
);
```

By default, ZinTrust will look for a pivot table named by joining the two table names in alphabetical order (e.g., `posts_tags`).

#### Loading Relationships

##### Lazy Loading

Load relationships after fetching the model:

```typescript
const user = await User.find(1);
await User.query().load([user], 'posts');
const posts = user.getAttribute('posts') as IModel[];
```

##### Eager Loading

Load relationships with the initial query to avoid N+1 problems:

```typescript
const users = await User.query().with('posts').get<IModel>();

// Each user will have posts loaded
users.forEach((user) => {
  const posts = user.getAttribute('posts') as IModel[];
  Logger.info(`${user.getAttribute('name')} has ${posts.length} posts`);
});
```

##### Constrained Eager Loading

Apply filters when eager loading:

```typescript
const users = await User.query()
  .with('posts', (query) => {
    query.where('status', 'published').orderBy('created_at', 'desc').limit(5);
  })
  .get<IModel>();
```

##### Relationship Counts

Count related records without loading them:

```typescript
const users = await User.query().withCount('posts').get<IModel>();

users.forEach((user) => {
  const postCount = user.getAttribute('posts_count');
  Logger.info(`${user.getAttribute('name')} has ${postCount} posts`);
});
```

#### Advanced Relationships

For polymorphic relations (morphOne, morphMany, morphTo) and through relations (hasManyThrough, hasOneThrough), see the [Advanced ORM Relationships Guide](./orm-advanced-relationships.md).

## Persistence

```typescript
// Create
const user = User.create({ name: 'John' });
await user.save();

// Update
user.setAttribute('name', 'Jane');
await user.save();

// Delete
await user.delete();
```

## Multi-Database Support

ZinTrust supports multiple simultaneous database connections, allowing you to:

- Route different models to different databases
- Separate read and write operations
- Implement sharding strategies
- Connect to external analytics or specialized databases

**See [docs/multi-database.md](multi-database.md) for complete documentation on:**

- Configuring multiple database connections
- Using models with specific connections
- QueryBuilder with different databases
- Controller patterns for multi-database operations
- Advanced patterns (sharding, read/write separation, cross-database transactions)
- Best practices and error handling

### Quick Example

```typescript
// Define model with specific connection
export const User = Model.define(
  {
    table: 'users',
    fillable: ['name', 'email'],
    connection: 'users_db', // Routes to users_db connection
  },
  {}
);

// Switch connection at runtime
const analyticsUsers = await User.db('analytics') // Temporarily use analytics database
  .where('created_at', '>', thirtyDaysAgo)
  .get();

// Default connection is used if not specified
const mainDbUsers = await User.all();
```

## Best Practices

### 1. Use Type-Safe Model Methods

```typescript
// ✅ Good - type-safe, readable
const user = await User.find(1);
const admins = await User.where('is_admin', '=', 1).get();

// ❌ Avoid - less type-safe
const user = await User.raw('SELECT * FROM users WHERE id = 1');
```

### 2. Leverage Relationships

```typescript
// ✅ Good - uses relationship loading
const user = await User.find(1);
const posts = user.getAttribute('posts') || [];

// ❌ Avoid - extra query
const user = await User.find(1);
const posts = await Post.where('user_id', '=', user.getAttribute('id')).get();
```

### 3. Use Scopes for Common Queries

```typescript
// ✅ Good - reusable scope
export const Post = Model.define(PostConfig, {
  scopes: {
    published: (builder: IQueryBuilder) => builder.where('is_published', '=', 1),
    recent: (builder: IQueryBuilder) => builder.where('created_at', '>=', thirtyDaysAgo),
  },
});

const recentPosts = await Post.scope('recent').scope('published').get();

// ❌ Avoid - repeating query logic
const recentPosts = await Post.where('is_published', '=', 1)
  .where('created_at', '>=', thirtyDaysAgo)
  .get();
```

### 4. Validate Before Saving

```typescript
// ✅ Good - validate before persistence
import { Validator, Schema } from '@zintrust/core';

const data = req.getBody();
const schema = Schema.create()
  .required('name')
  .string('name')
  .minLength('name', 1)
  .required('email')
  .email('email');

Validator.validate(data, schema);

const user = User.create(data);
await user.save();

// ❌ Avoid - save invalid data
const user = User.create(req.getBody());
await user.save();
```

### 5. Handle Timestamps Automatically

```typescript
// ✅ Good - let model manage timestamps
export const Post = Model.define(
  {
    table: 'posts',
    fillable: ['title', 'content'],
    timestamps: true, // Automatically manages created_at, updated_at
  },
  {}
);

// ❌ Avoid - manual timestamp management
const post = Post.create({ title: 'Test' });
post.setAttribute('created_at', new Date().toISOString());
post.setAttribute('updated_at', new Date().toISOString());
await post.save();
```

### 6. Use Soft Deletes for Data Preservation

```typescript
// ✅ Good - preserve deleted data
export const User = Model.define(
  {
    table: 'users',
    fillable: ['name', 'email'],
    softDeletes: true, // Adds deleted_at column
  },
  {}
);

await user.delete(); // Sets deleted_at, doesn't remove from DB
const allUsers = await User.all(); // Excludes soft-deleted
const allIncludingDeleted = await User.withTrashed().get();

// ❌ Avoid - permanent data loss
export const User = Model.define(
  {
    table: 'users',
    softDeletes: false,
  },
  {}
);
await user.delete(); // Permanently removes record
```

### 7. Document Your Models

````typescript
/**
 * User Model
 *
 * Stores application user accounts and authentication data.
 *
 * **Database**: postgresql (users_db connection)
 * **Table**: users
 * **Retention**: Indefinite (use soft-delete for privacy)
 *
 * **Relationships**:
 * - hasMany('Post'): User's published posts
 * - hasMany('Comment'): User's comments
 * - belongsToMany('Role'): User's assigned roles
 *
 * **Key Features**:
 * - Soft deletes (deleted_at column)
 * - Timestamps (created_at, updated_at)
 * - Hidden password field
 *
 * @example
 * ```typescript
 * const user = await User.find(1);
 * const posts = user.getAttribute('posts');
 * ```
 */
export const User = Model.define(
  {
    table: 'users',
    fillable: ['name', 'email', 'password'],
    hidden: ['password'],
    timestamps: true,
    softDeletes: true,
    connection: 'users_db',
  },
  {}
);
````

### 8. Test Model Methods

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { User } from '@app/Models/User';
import { resetDatabase, useEnsureDbConnected } from '@zintrust/core';

describe('User Model', () => {
  beforeEach(async () => {
    await resetDatabase();
    const db = await useEnsureDbConnected();
    // Set up test fixtures
  });

  it('creates a user with valid data', async () => {
    const user = User.create({ name: 'John', email: 'john@example.com' });
    await user.save();

    expect(user.getAttribute('id')).toBeDefined();
    expect(user.getAttribute('name')).toBe('John');
  });

  it('soft-deletes user without removing data', async () => {
    const user = User.create({ name: 'John', email: 'john@example.com' });
    await user.save();
    const id = user.getAttribute('id');

    await user.delete();

    const found = await User.find(id);
    expect(found).toBeUndefined();

    const withTrashed = await User.withTrashed().find(id);
    expect(withTrashed?.getAttribute('id')).toBe(id);
  });
});
```

ZinTrust's ORM balances simplicity with power—use what you need, and scale as your application grows.
