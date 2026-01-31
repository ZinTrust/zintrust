# Advanced ORM Relationships

This guide covers ZinTrust's advanced relationship features for complex data modeling scenarios.

## Table of Contents

- [Relationship Counting (withCount)](#relationship-counting-withcount)
- [Constrained Eager Loading](#constrained-eager-loading)
- [Polymorphic Relations](#polymorphic-relations)
- [Through Relations](#through-relations)
- [Performance Considerations](#performance-considerations)
- [Best Practices](#best-practices)

## Relationship Counting (withCount)

Use `withCount()` to efficiently count related records without loading them into memory. This is especially useful for displaying statistics (e.g., "10 comments").

### Basic Usage

```typescript
import { User } from '@app/Models/User';

// Load users with post counts
const users = await User.query().withCount('posts').get<IModel>();

// Access the count
for (const user of users) {
  const postCount = user.getAttribute('posts_count');
  Logger.info(`${user.getAttribute('name')} has ${postCount} posts`);
}
```

### Multiple Counts

You can count multiple relationships:

```typescript
const users = await User.query().withCount('posts').withCount('comments').get<IModel>();

// Each user will have posts_count and comments_count attributes
```

### How It Works

`withCount()` executes a subquery to count related records, adding the result as a virtual attribute (`{relation}_count`):

```sql
SELECT users.*,
  (SELECT COUNT(*) FROM posts WHERE posts.user_id = users.id) as posts_count
FROM users
```

### Use Cases

- **Listing pages**: Display item counts without loading full relationships
- **Dashboards**: Show statistics efficiently
- **Sorting**: Order by relationship counts
- **Filtering**: Find records by relationship count ranges

```typescript
// Example: Users with more than 10 posts
const activeUsers = await User.query()
  .withCount('posts')
  .get<IModel>()
  .then((users) => users.filter((u) => (u.getAttribute('posts_count') as number) > 10));
```

## Constrained Eager Loading

Apply filters to relationships during eager loading to reduce data transfer and memory usage.

### Basic Syntax

```typescript
import { User } from '@app/Models/User';

// Load users with only published posts
const users = await User.query()
  .with('posts', (query) => {
    query.where('status', 'published');
  })
  .get<IModel>();
```

### Multiple Constraints

Chain multiple conditions on the relationship query:

```typescript
const users = await User.query()
  .with('posts', (query) => {
    query
      .where('status', 'published')
      .where('created_at', '>', thirtyDaysAgo)
      .orderBy('created_at', 'desc')
      .limit(5);
  })
  .get<IModel>();

// Each user will have at most 5 recent published posts
```

### Nested Relationships with Constraints

You can constrain nested relationships:

```typescript
const users = await User.query()
  .with('posts', (query) => {
    query.where('status', 'published').with('comments', (commentQuery) => {
      commentQuery.where('approved', true).orderBy('created_at', 'desc');
    });
  })
  .get<IModel>();
```

### Use Cases

- **Filtering**: Only load approved comments, active subscriptions, etc.
- **Sorting**: Pre-sort related records (e.g., latest 3 comments)
- **Limiting**: Avoid loading thousands of related records
- **Performance**: Reduce database load and memory usage

### Combining with withCount

```typescript
const users = await User.query()
  .withCount('posts') // Total posts
  .with('posts', (query) => {
    query.where('status', 'published').limit(3); // Only load 3 for display
  })
  .get<IModel>();

// users[0].getAttribute('posts_count') -> Total count
// users[0].getAttribute('posts') -> Array of up to 3 published posts
```

## Polymorphic Relations

Polymorphic relations allow a model to belong to multiple other models on a single association.

### Common Use Case: Comments

Comments can belong to posts, videos, or any other content type:

```
comments table:
  id
  body
  commentable_id   (polymorphic foreign key)
  commentable_type (stores model type: 'Post', 'Video', etc.)
```

### Defining Polymorphic Relations

#### morphOne

One-to-one polymorphic relation (like `hasOne`, but polymorphic):

```typescript
import { IModel, Model } from '@zintrust/core';
import { Image } from '@app/Models/Image';

export const Post = Model.define(
  {
    table: 'posts',
    fillable: ['title', 'content'],
    hidden: [],
    timestamps: true,
    casts: {},
  },
  {
    image(model: IModel) {
      return model.morphOne(
        Image,
        'imageable' // morphName - will use imageable_id and imageable_type
      );
    },
  }
);

export const Video = Model.define(
  {
    table: 'videos',
    fillable: ['title', 'url'],
    hidden: [],
    timestamps: true,
    casts: {},
  },
  {
    image(model: IModel) {
      return model.morphOne(Image, 'imageable');
    },
  }
);
```

#### morphMany

One-to-many polymorphic relation:

```typescript
import { IModel, Model } from '@zintrust/core';
import { Comment } from '@app/Models/Comment';

export const Post = Model.define(
  {
    table: 'posts',
    fillable: ['title', 'content'],
    hidden: [],
    timestamps: true,
    casts: {},
  },
  {
    comments(model: IModel) {
      return model.morphMany(Comment, 'commentable');
    },
  }
);

export const Video = Model.define(
  {
    table: 'videos',
    fillable: ['title', 'url'],
    hidden: [],
    timestamps: true,
    casts: {},
  },
  {
    comments(model: IModel) {
      return model.morphMany(Comment, 'commentable');
    },
  }
);
```

#### morphTo

The inverse polymorphic relation (from Comment back to Post/Video):

```typescript
import { IModel, Model } from '@zintrust/core';
import { Post } from '@app/Models/Post';
import { Video } from '@app/Models/Video';

export const Comment = Model.define(
  {
    table: 'comments',
    fillable: ['body', 'commentable_id', 'commentable_type'],
    hidden: [],
    timestamps: true,
    casts: {},
  },
  {
    commentable(model: IModel) {
      return model.morphTo(
        'commentable', // morphName
        {
          Post: Post,
          Video: Video,
        } // morphMap - maps type strings to model classes
      );
    },
  }
);
```

### Migration for Polymorphic Relations

```typescript
import { MigrationSchema, type IDatabase } from '@zintrust/core';

export interface Migration {
  up(db: IDatabase): Promise<void>;
  down(db: IDatabase): Promise<void>;
}

export const migration: Migration = {
  async up(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);

    await schema.create('comments', (table) => {
      table.id();
      table.text('body');
      table.integer('commentable_id'); // Polymorphic foreign key
      table.string('commentable_type'); // Stores model type
      table.timestamps();

      // Optional: index for performance
      table.index(['commentable_id', 'commentable_type']);
    });
  },

  async down(db: IDatabase): Promise<void> {
    const schema = MigrationSchema.create(db);
    await schema.dropIfExists('comments');
  },
};
```

### Loading Polymorphic Relations

```typescript
// Load post with comments
const post = await Post.find(1);
await Post.query().load([post], 'comments');
const comments = post.getAttribute('comments') as IModel[];

// Load comment with parent (polymorphic)
const comment = await Comment.find(1);
await Comment.query().load([comment], 'commentable');
const parent = comment.getAttribute('commentable') as IModel;

// Check the parent type
const parentType = comment.getAttribute('commentable_type');
if (parentType === 'Post') {
  Logger.info('Comment belongs to a post');
} else if (parentType === 'Video') {
  Logger.info('Comment belongs to a video');
}
```

### Eager Loading Polymorphic Relations

```typescript
// Load posts with comments
const posts = await Post.query().with('comments').get<IModel>();

// Load comments with their parents
const comments = await Comment.query().with('commentable').get<IModel>();

// Constrained polymorphic eager loading
const posts = await Post.query()
  .with('comments', (query) => {
    query.where('approved', true).orderBy('created_at', 'desc').limit(10);
  })
  .get<IModel>();
```

### Custom Column Names

By default, ZinTrust uses `{morphName}_id` and `{morphName}_type`. You can customize:

```typescript
// In Comment model
commentable(model: IModel) {
  return model.morphTo(
    'commentable',
    { Post: Post, Video: Video },
    'custom_type_column', // Instead of commentable_type
    'custom_id_column'    // Instead of commentable_id
  );
}
```

### Use Cases

- **Comments**: Comments on posts, videos, images
- **Likes**: Likes on various content types
- **Images**: Featured images for multiple content types
- **Tags**: Tags that apply to different entities
- **Activity Logs**: Activities related to different models

## Through Relations

Through relations let you access distant relationships via an intermediate model.

### Example: Countries → Users → Posts

```
countries table: id, name
users table: id, name, country_id
posts table: id, title, user_id
```

A Country has many Posts **through** Users.

### hasManyThrough

Define a "distant" one-to-many relationship:

```typescript
import { IModel, Model } from '@zintrust/core';
import { Post } from '@app/Models/Post';
import { User } from '@app/Models/User';

export const Country = Model.define(
  {
    table: 'countries',
    fillable: ['name'],
    hidden: [],
    timestamps: true,
    casts: {},
  },
  {
    posts(model: IModel) {
      return model.hasManyThrough(
        Post, // Final model
        User, // Intermediate model
        'country_id', // Foreign key on users table
        'user_id', // Foreign key on posts table
        'id', // Local key on countries table
        'id' // Local key on users table
      );
    },
  }
);
```

#### How It Works

ZinTrust will generate a query like:

```sql
SELECT posts.*
FROM posts
INNER JOIN users ON posts.user_id = users.id
WHERE users.country_id = ?
```

### hasOneThrough

Similar to `hasManyThrough`, but for one-to-one relations:

```typescript
import { IModel, Model } from '@zintrust/core';
import { Profile } from '@app/Models/Profile';
import { User } from '@app/Models/User';

export const Country = Model.define(
  {
    table: 'countries',
    fillable: ['name'],
    hidden: [],
    timestamps: true,
    casts: {},
  },
  {
    primaryProfile(model: IModel) {
      return model.hasOneThrough(
        Profile, // Final model
        User, // Intermediate model
        'country_id',
        'user_id',
        'id',
        'id'
      );
    },
  }
);
```

### Loading Through Relations

```typescript
// Lazy load
const country = await Country.find(1);
await Country.query().load([country], 'posts');
const posts = country.getAttribute('posts') as IModel[];

// Eager load
const countries = await Country.query().with('posts').get<IModel>();
```

### Constrained Through Relations

Apply filters to the final model:

```typescript
const countries = await Country.query()
  .with('posts', (query) => {
    query.where('status', 'published').orderBy('created_at', 'desc').limit(10);
  })
  .get<IModel>();
```

### Use Cases

- **Geographic data**: Countries → Cities → Businesses
- **Organization hierarchies**: Departments → Teams → Projects
- **Multi-level relationships**: Schools → Classes → Students → Grades
- **Permission systems**: Users → Roles → Permissions

### Default Foreign Keys

If you follow ZinTrust conventions, you can omit the key parameters:

```typescript
// Assuming:
// - users.country_id references countries.id
// - posts.user_id references users.id
posts(model: IModel) {
  return model.hasManyThrough(Post, User);
}
```

ZinTrust will infer:

- `foreignKey`: `country_id` (from `countries` → `users`)
- `throughForeignKey`: `user_id` (from `users` → `posts`)
- `localKey`: `id`
- `secondLocalKey`: `id`

## Performance Considerations

### 1. Avoid N+1 Queries

```typescript
// ❌ Bad - N+1 problem
const users = await User.query().get<IModel>();
for (const user of users) {
  await User.query().load([user], 'posts'); // 1 query per user
}

// ✅ Good - Single query
const users = await User.query().with('posts').get<IModel>();
```

### 2. Use withCount for Statistics

```typescript
// ❌ Bad - Loads all posts into memory
const users = await User.query().with('posts').get<IModel>();

const userStats = users.map((u) => ({
  name: u.getAttribute('name'),
  postCount: (u.getAttribute('posts') as IModel[]).length,
}));

// ✅ Good - Only counts, no data transfer
const users = await User.query().withCount('posts').get<IModel>();

const userStats = users.map((u) => ({
  name: u.getAttribute('name'),
  postCount: u.getAttribute('posts_count'),
}));
```

### 3. Constrain Eager Loads

```typescript
// ❌ Bad - Loads ALL comments
const posts = await Post.query().with('comments').get<IModel>();

// ✅ Good - Limits to recent approved comments
const posts = await Post.query()
  .with('comments', (query) => {
    query.where('approved', true).orderBy('created_at', 'desc').limit(5);
  })
  .get<IModel>();
```

### 4. Index Polymorphic Columns

Always index both `{morphName}_id` and `{morphName}_type`:

```typescript
await schema.create('comments', (table) => {
  table.id();
  table.text('body');
  table.integer('commentable_id');
  table.string('commentable_type');

  // Critical for performance
  table.index(['commentable_id', 'commentable_type']);

  table.timestamps();
});
```

### 5. Index Through Relation Keys

For `hasManyThrough`, index both foreign keys:

```typescript
await schema.create('users', (table) => {
  table.id();
  table.string('name');
  table.integer('country_id');

  table.index('country_id'); // Important for through queries

  table.timestamps();
});

await schema.create('posts', (table) => {
  table.id();
  table.string('title');
  table.integer('user_id');

  table.index('user_id'); // Important for through queries

  table.timestamps();
});
```

## Best Practices

### 1. Naming Conventions

#### Polymorphic Relations

Use consistent suffixes:

- `{entity}able` for the morph name: `commentable`, `taggable`, `imageable`
- `{entity}able_id` and `{entity}able_type` for columns

```typescript
// ✅ Good - Clear naming
model.morphTo('commentable', morphMap);
model.morphMany(Comment, 'commentable');

// ❌ Avoid - Unclear naming
model.morphTo('parent', morphMap);
model.morphMany(Comment, 'owner');
```

#### Through Relations

Use descriptive method names:

```typescript
// ✅ Good - Descriptive
posts(model: IModel) {
  return model.hasManyThrough(Post, User);
}

// ❌ Avoid - Ambiguous
items(model: IModel) {
  return model.hasManyThrough(Post, User);
}
```

### 2. Document Polymorphic Mappings

Always document which models can be related:

````typescript
/**
 * Comment Model
 *
 * Polymorphic relation: can belong to Post or Video
 *
 * @example
 * ```typescript
 * const comment = await Comment.find(1);
 * await Comment.query().load([comment], 'commentable');
 * const parent = comment.getAttribute('commentable');
 * ```
 */
export const Comment = Model.define(
  {
    table: 'comments',
    fillable: ['body', 'commentable_id', 'commentable_type'],
    hidden: [],
    timestamps: true,
    casts: {},
  },
  {
    commentable(model: IModel) {
      return model.morphTo('commentable', {
        Post: Post,
        Video: Video,
      });
    },
  }
);
````

### 3. Validate Polymorphic Types

When creating polymorphic records, validate the type:

```typescript
import { Validator, Schema } from '@zintrust/core';

const schema = Schema.create()
  .required('body')
  .string('body')
  .required('commentable_id')
  .integer('commentable_id')
  .required('commentable_type')
  .in('commentable_type', ['Post', 'Video']); // Validate allowed types

Validator.validate(req.getBody(), schema);
```

### 4. Test Relationship Loading

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Post } from '@app/Models/Post';
import { Comment } from '@app/Models/Comment';

describe('Polymorphic Relations', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('loads morphMany relationship', async () => {
    const post = Post.create({ title: 'Test Post' });
    await post.save();

    const comment1 = Comment.create({
      body: 'Comment 1',
      commentable_id: post.getAttribute('id'),
      commentable_type: 'Post',
    });
    await comment1.save();

    const comment2 = Comment.create({
      body: 'Comment 2',
      commentable_id: post.getAttribute('id'),
      commentable_type: 'Post',
    });
    await comment2.save();

    await Post.query().load([post], 'comments');
    const comments = post.getAttribute('comments') as IModel[];

    expect(comments).toHaveLength(2);
    expect(comments[0].getAttribute('body')).toBe('Comment 1');
    expect(comments[1].getAttribute('body')).toBe('Comment 2');
  });

  it('loads morphTo relationship', async () => {
    const post = Post.create({ title: 'Test Post' });
    await post.save();

    const comment = Comment.create({
      body: 'Test Comment',
      commentable_id: post.getAttribute('id'),
      commentable_type: 'Post',
    });
    await comment.save();

    await Comment.query().load([comment], 'commentable');
    const parent = comment.getAttribute('commentable') as IModel;

    expect(parent).toBeDefined();
    expect(parent.getAttribute('title')).toBe('Test Post');
  });
});
```

### 5. Handle Missing Polymorphic Parents

When loading `morphTo`, the parent might not exist:

```typescript
const comment = await Comment.find(1);
await Comment.query().load([comment], 'commentable');
const parent = comment.getAttribute('commentable') as IModel | undefined;

if (!parent) {
  Logger.warn('Comment has no valid parent');
  return;
}

// Safe to use parent
Logger.info(parent.getAttribute('title'));
```

### 6. Cache Relationship Counts

For frequently accessed counts, consider caching:

```typescript
import { cache } from '@zintrust/core';

async function getUserWithCachedPostCount(userId: number) {
  const cacheKey = `user:${userId}:post_count`;

  let postCount = await cache.get<number>(cacheKey);

  if (postCount === null) {
    const users = await User.query().where('id', userId).withCount('posts').get<IModel>();

    postCount = (users[0]?.getAttribute('posts_count') as number) ?? 0;

    await cache.set(cacheKey, postCount, 3600); // Cache for 1 hour
  }

  return postCount;
}
```

### 7. Use Transactions for Complex Operations

When creating polymorphic relations:

```typescript
import { useDatabase } from '@zintrust/core';

async function createPostWithTags(postData: Record<string, unknown>, tagNames: string[]) {
  const db = useDatabase();

  await db.transaction(async () => {
    // Create post
    const post = Post.create(postData);
    await post.save();

    // Create tags (polymorphic)
    for (const tagName of tagNames) {
      const tag = Tag.create({
        name: tagName,
        taggable_id: post.getAttribute('id'),
        taggable_type: 'Post',
      });
      await tag.save();
    }
  });
}
```

---

## Related Documentation

- [Models & ORM](./models.md) - Basic model usage and simple relationships
- [Query Builder](./query-builder.md) - Query construction and filtering
- [Database Advanced](./database-advanced.md) - Multi-database and migrations
- [Performance](./performance.md) - Optimization strategies
- [Testing](./testing.md) - Testing ORM code

For questions or issues with advanced relationships, check the [GitHub repository](https://github.com/ZinTrust/zintrust) or consult the [API reference](./api-reference.md).
