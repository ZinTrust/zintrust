# Models & ORM

Zintrust features a powerful, zero-dependency ORM that provides a clean, ActiveRecord-like interface for interacting with your database.

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

Zintrust supports adding custom model methods via the second argument to `Model.define(...)`.

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

Zintrust supports multiple database connections. You can specify which connection a model should use by setting `connection` in `Model.define(...)`.

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

```typescript
import { useDatabase } from '@zintrust/core';

useDatabase(
  {
    driver: 'mysql',
    host: 'remote-host',
    // ...
  },
  'external_db'
);
```

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
```

### Relationships

Zintrust supports standard relationships: `HasOne`, `HasMany`, `BelongsTo`, and `BelongsToMany`.

#### HasMany

```typescript
import { Post } from '@app/Models/Post';
import { IModel, Model } from '@zintrust/core';

export const User = Model.define(
  {
    table: 'users',
    fillable: [],
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

#### BelongsToMany (Pivot Tables)

```typescript
import { Tag } from '@app/Models/Tag';
import { IModel, Model } from '@zintrust/core';

export const Post = Model.define(
  {
    table: 'posts',
    fillable: [],
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

By default, Zintrust will look for a pivot table named by joining the two table names in alphabetical order (e.g., `posts_tags`).

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
