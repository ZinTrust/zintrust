# Models & ORM

Zintrust features a powerful, zero-dependency ORM that provides a clean, ActiveRecord-like interface for interacting with your database.

## Defining Models

Models are typically stored in the `app/Models` directory. You can generate a new model using the CLI:

```bash
zin add model User
```

A basic model looks like this:

```typescript
import { Model } from '@orm/Model';

export class User extends Model {
  protected connection = 'default';
  protected table = 'users';
  protected fillable = ['name', 'email', 'password'];
  protected hidden = ['password'];
  protected casts = {
    is_admin: 'boolean',
    metadata: 'json',
  };
}
```

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

Zintrust supports multiple database connections. You can specify which connection a model should use by setting the `protected connection` property.

```typescript
export class ExternalUser extends Model {
  protected connection = 'external_db';
  protected table = 'users';
}
```

You can initialize connections in your application bootstrap:

```typescript
import { useDatabase } from '@orm/Database';

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
// Get all users
const users = await User.query().get();

// Find by ID
const user = await User.query().find(1);

// Where clauses
const activeUsers = await User.query().where('is_active', true).where('age', '>', 18).get();
```

### Relationships

Zintrust supports standard relationships: `HasOne`, `HasMany`, `BelongsTo`, and `BelongsToMany`.

#### HasMany

```typescript
class User extends Model {
  public posts() {
    return this.hasMany(Post);
  }
}
```

#### BelongsToMany (Pivot Tables)

```typescript
class Post extends Model {
  public tags() {
    return this.belongsToMany(Tag);
  }
}
```

By default, Zintrust will look for a pivot table named by joining the two table names in alphabetical order (e.g., `posts_tags`).

## Persistence

```typescript
// Create
const user = new User({ name: 'John' });
await user.save();

// Update
user.setAttribute('name', 'Jane');
await user.save();

// Delete
await user.delete();
```
