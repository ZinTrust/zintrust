/**
 * Tests for advanced ORM relationship features:
 * - withCount() for hasMany/belongsToMany
 * - Constrained eager loading with callbacks
 * - Polymorphic relations (morphOne, morphMany, morphTo)
 * - Through relations (hasManyThrough, hasOneThrough)
 */

import { useDatabase } from '@orm/Database';
import type { IModel } from '@orm/Model';
import { Model } from '@orm/Model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orm/Database', () => ({
  useDatabase: vi.fn(),
}));

let mockDb: ReturnType<typeof createMockDb>;

const createMockDb = () => ({
  query: vi.fn(),
  execute: vi.fn(),
  getType: vi.fn().mockReturnValue('sqlite'),
  connect: vi.fn(),
  disconnect: vi.fn(),
});

beforeEach(() => {
  mockDb = createMockDb();
  vi.mocked(useDatabase).mockReturnValue(mockDb as never);
  vi.clearAllMocks();
});

describe('withCount() for hasMany/belongsToMany', () => {
  it('should load counts for hasMany relationships', async () => {
    const Post = Model.define({
      table: 'posts',
      fillable: ['id', 'user_id', 'title'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const User = Model.define(
      {
        table: 'users',
        fillable: ['id', 'name'],
        hidden: [],
        timestamps: false,
        casts: {},
      },
      (u) => ({
        posts: () => u.hasMany(Post, 'user_id'),
      })
    );

    // Mock initial query for users
    mockDb.query.mockResolvedValueOnce([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);

    // Mock count query
    mockDb.query.mockResolvedValueOnce([
      { key: 1, count: 3 },
      { key: 2, count: 5 },
    ]);

    const users = await User.query().withCount('posts').get<IModel>();

    expect(users).toHaveLength(2);
    expect((users[0] as any)?.getAttribute('posts_count')).toBe(3);
    expect((users[1] as any)?.getAttribute('posts_count')).toBe(5);
  });

  it('should load counts for belongsToMany relationships', async () => {
    const Role = Model.define({
      table: 'roles',
      fillable: ['id', 'name'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const User = Model.define(
      {
        table: 'users',
        fillable: ['id', 'name'],
        hidden: [],
        timestamps: false,
        casts: {},
      },
      (u) => ({
        roles: () => u.belongsToMany(Role),
      })
    );

    // Mock initial query for users
    mockDb.query.mockResolvedValueOnce([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);

    // Mock count query through pivot table
    mockDb.query.mockResolvedValueOnce([
      { key: 1, count: 2 },
      { key: 2, count: 1 },
    ]);

    const users = await User.query().withCount('roles').get<IModel>();

    expect(users).toHaveLength(2);
    expect((users[0] as any)?.getAttribute('roles_count')).toBe(2);
    expect((users[1] as any)?.getAttribute('roles_count')).toBe(1);
  });

  it('should handle bigint counts correctly', async () => {
    const Post = Model.define({
      table: 'posts',
      fillable: ['id', 'user_id', 'title'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const User = Model.define(
      {
        table: 'users',
        fillable: ['id', 'name'],
        hidden: [],
        timestamps: false,
        casts: {},
      },
      (u) => ({
        posts: () => u.hasMany(Post, 'user_id'),
      })
    );

    mockDb.query.mockResolvedValueOnce([{ id: 1, name: 'Alice' }]);
    mockDb.query.mockResolvedValueOnce([{ key: 1, count: BigInt(1000) }]);

    const users = await User.query().withCount('posts').get<IModel>();

    expect((users[0] as any)?.getAttribute('posts_count')).toBe(1000);
  });

  it('should set count to 0 when no related records exist', async () => {
    const Post = Model.define({
      table: 'posts',
      fillable: ['id', 'user_id', 'title'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const User = Model.define(
      {
        table: 'users',
        fillable: ['id', 'name'],
        hidden: [],
        timestamps: false,
        casts: {},
      },
      (u) => ({
        posts: () => u.hasMany(Post, 'user_id'),
      })
    );

    mockDb.query.mockResolvedValueOnce([{ id: 1, name: 'Alice' }]);
    mockDb.query.mockResolvedValueOnce([]); // No counts

    const users = await User.query().withCount('posts').get<IModel>();

    expect((users[0] as any)?.getAttribute('posts_count')).toBe(0);
  });
});

describe('Constrained eager loading with callbacks', () => {
  it('should apply constraints to eager loaded relations', async () => {
    const Post = Model.define({
      table: 'posts',
      fillable: ['id', 'user_id', 'title', 'published'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const User = Model.define(
      {
        table: 'users',
        fillable: ['id', 'name'],
        hidden: [],
        timestamps: false,
        casts: {},
      },
      (u) => ({
        posts: () => u.hasMany(Post, 'user_id'),
      })
    );

    // Mock users query
    mockDb.query.mockResolvedValueOnce([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);

    // Mock constrained posts query (only published)
    mockDb.query.mockResolvedValueOnce([
      { id: 1, user_id: 1, title: 'Post 1', published: true },
      { id: 3, user_id: 2, title: 'Post 3', published: true },
    ]);

    const users = await User.query()
      .with({
        posts: (q) => q.where('published', '=', true),
      })
      .get();

    expect(users).toHaveLength(2);
    expect(mockDb.query).toHaveBeenCalledTimes(2);
  });

  it('should support multiple constrained relations', async () => {
    const Post = Model.define({
      table: 'posts',
      fillable: ['id', 'user_id', 'title', 'published'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const Comment = Model.define({
      table: 'comments',
      fillable: ['id', 'user_id', 'content'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const User = Model.define(
      {
        table: 'users',
        fillable: ['id', 'name'],
        hidden: [],
        timestamps: false,
        casts: {},
      },
      (u) => ({
        posts: () => u.hasMany(Post, 'user_id'),
        comments: () => u.hasMany(Comment, 'user_id'),
      })
    );

    mockDb.query.mockResolvedValueOnce([{ id: 1, name: 'Alice' }]);
    mockDb.query.mockResolvedValueOnce([{ id: 1, user_id: 1, title: 'Post 1', published: true }]);
    mockDb.query.mockResolvedValueOnce([{ id: 1, user_id: 1, content: 'Comment 1' }]);

    const users = await User.query()
      .with({
        posts: (q) => q.where('published', '=', true),
        comments: (q) => q.orderBy('created_at', 'DESC'),
      })
      .get();

    expect(users).toHaveLength(1);
    expect(mockDb.query).toHaveBeenCalledTimes(3);
  });
});

describe('Polymorphic relations (morphOne, morphMany, morphTo)', () => {
  it('should define and use morphOne relationship', () => {
    const Post = Model.define({
      table: 'posts',
      fillable: ['id', 'title'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const Image = Model.define({
      table: 'images',
      fillable: ['id', 'url', 'imageable_type', 'imageable_id'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const post = Post.create({ id: 1, title: 'Test' });
    const imageRel = post.morphOne(Image, 'imageable');

    expect(imageRel.type).toBe('morphOne');
    expect(imageRel.morphType).toBe('imageable_type');
    expect(imageRel.morphId).toBe('imageable_id');
  });

  it('should define and use morphMany relationship', () => {
    const Post = Model.define({
      table: 'posts',
      fillable: ['id', 'title'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const Comment = Model.define({
      table: 'comments',
      fillable: ['id', 'body', 'commentable_type', 'commentable_id'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const post = Post.create({ id: 1, title: 'Test' });
    const commentsRel = post.morphMany(Comment, 'commentable');

    expect(commentsRel.type).toBe('morphMany');
    expect(commentsRel.morphType).toBe('commentable_type');
    expect(commentsRel.morphId).toBe('commentable_id');
  });

  it('should define morphTo relationship with morphMap', () => {
    const Post = Model.define({
      table: 'posts',
      fillable: ['id', 'title'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const Video = Model.define({
      table: 'videos',
      fillable: ['id', 'url'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const Comment = Model.define({
      table: 'comments',
      fillable: ['id', 'body', 'commentable_type', 'commentable_id'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const comment = Comment.create({
      id: 1,
      body: 'Test comment',
      commentable_type: 'posts',
      commentable_id: 1,
    });

    const morphMap = {
      posts: Post,
      videos: Video,
    };

    const parentRel = comment.morphTo('commentable', morphMap);

    expect(parentRel.type).toBe('morphTo');
    expect(parentRel.morphMap).toBe(morphMap);
  });

  it('should eager load morphMany relationships', async () => {
    const Comment = Model.define({
      table: 'comments',
      fillable: ['id', 'body', 'commentable_type', 'commentable_id'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const Post = Model.define(
      {
        table: 'posts',
        fillable: ['id', 'title'],
        hidden: [],
        timestamps: false,
        casts: {},
      },
      (p) => ({
        comments: () => p.morphMany(Comment, 'commentable'),
      })
    );

    mockDb.query.mockResolvedValueOnce([
      { id: 1, title: 'Post 1' },
      { id: 2, title: 'Post 2' },
    ]);

    mockDb.query.mockResolvedValueOnce([
      { id: 1, body: 'Comment 1', commentable_type: 'posts', commentable_id: 1 },
      { id: 2, body: 'Comment 2', commentable_type: 'posts', commentable_id: 1 },
      { id: 3, body: 'Comment 3', commentable_type: 'posts', commentable_id: 2 },
    ]);

    const posts = await Post.query().with('comments').get();

    expect(posts).toHaveLength(2);
    expect(mockDb.query).toHaveBeenCalledTimes(2);
  });

  it('should eager load morphTo relationships', async () => {
    const Post = Model.define({
      table: 'posts',
      fillable: ['id', 'title'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const Video = Model.define({
      table: 'videos',
      fillable: ['id', 'url'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const morphMap = {
      posts: Post,
      videos: Video,
    };

    const Comment = Model.define(
      {
        table: 'comments',
        fillable: ['id', 'body', 'commentable_type', 'commentable_id'],
        hidden: [],
        timestamps: false,
        casts: {},
      },
      (c) => ({
        commentable: () => c.morphTo('commentable', morphMap),
      })
    );

    mockDb.query.mockResolvedValueOnce([
      { id: 1, body: 'Comment 1', commentable_type: 'posts', commentable_id: 1 },
      { id: 2, body: 'Comment 2', commentable_type: 'videos', commentable_id: 1 },
    ]);

    mockDb.query.mockResolvedValueOnce([{ id: 1, title: 'Post 1' }]);
    mockDb.query.mockResolvedValueOnce([{ id: 1, url: 'video.mp4' }]);

    const comments = await Comment.query().with('commentable').get();

    expect(comments).toHaveLength(2);
  });
});

describe('Through relations (hasManyThrough, hasOneThrough)', () => {
  it('should define hasManyThrough relationship', () => {
    const Country = Model.define({
      table: 'countries',
      fillable: ['id', 'name'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const User = Model.define({
      table: 'users',
      fillable: ['id', 'country_id', 'name'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const Post = Model.define({
      table: 'posts',
      fillable: ['id', 'user_id', 'title'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const country = Country.create({ id: 1, name: 'USA' });
    const postsRel = country.hasManyThrough(Post, User);

    expect(postsRel.type).toBe('hasManyThrough');
    expect(postsRel.through).toBe(User);
  });

  it('should eager load hasManyThrough relationships', async () => {
    const User = Model.define({
      table: 'users',
      fillable: ['id', 'country_id', 'name'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const Post = Model.define({
      table: 'posts',
      fillable: ['id', 'user_id', 'title'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const Country = Model.define(
      {
        table: 'countries',
        fillable: ['id', 'name'],
        hidden: [],
        timestamps: false,
        casts: {},
      },
      (c) => ({
        posts: () => c.hasManyThrough(Post, User),
      })
    );

    // Mock countries query
    mockDb.query.mockResolvedValueOnce([
      { id: 1, name: 'USA' },
      { id: 2, name: 'UK' },
    ]);

    // Mock intermediate users query
    mockDb.query.mockResolvedValueOnce([
      { id: 1, country_id: 1 },
      { id: 2, country_id: 1 },
      { id: 3, country_id: 2 },
    ]);

    // Mock posts query with JOIN
    mockDb.query.mockResolvedValueOnce([
      { id: 1, user_id: 1, title: 'Post 1' },
      { id: 2, user_id: 1, title: 'Post 2' },
      { id: 3, user_id: 2, title: 'Post 3' },
      { id: 4, user_id: 3, title: 'Post 4' },
    ]);

    const countries = await Country.query().with('posts').get();

    expect(countries).toHaveLength(2);
  });

  it('should define hasOneThrough relationship', () => {
    const Country = Model.define({
      table: 'countries',
      fillable: ['id', 'name'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const User = Model.define({
      table: 'users',
      fillable: ['id', 'country_id', 'name'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const Profile = Model.define({
      table: 'profiles',
      fillable: ['id', 'user_id', 'bio'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const country = Country.create({ id: 1, name: 'USA' });
    const profileRel = country.hasOneThrough(Profile, User);

    expect(profileRel.type).toBe('hasOneThrough');
    expect(profileRel.through).toBe(User);
  });

  it('should support constrained through relationships', async () => {
    const User = Model.define({
      table: 'users',
      fillable: ['id', 'country_id', 'name'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const Post = Model.define({
      table: 'posts',
      fillable: ['id', 'user_id', 'title', 'published'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const Country = Model.define(
      {
        table: 'countries',
        fillable: ['id', 'name'],
        hidden: [],
        timestamps: false,
        casts: {},
      },
      (c) => ({
        posts: () => c.hasManyThrough(Post, User),
      })
    );

    mockDb.query.mockResolvedValueOnce([{ id: 1, name: 'USA' }]);
    mockDb.query.mockResolvedValueOnce([{ id: 1, country_id: 1 }]);
    mockDb.query.mockResolvedValueOnce([{ id: 1, user_id: 1, title: 'Post 1', published: true }]);

    const countries = await Country.query()
      .with({
        posts: (q) => q.where('published', '=', true),
      })
      .get();

    expect(countries).toHaveLength(1);
  });
});

describe('Combined advanced features', () => {
  it('should support withCount and constrained eager loading together', async () => {
    const Post = Model.define({
      table: 'posts',
      fillable: ['id', 'user_id', 'title', 'published'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const Comment = Model.define({
      table: 'comments',
      fillable: ['id', 'user_id', 'content'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const User = Model.define(
      {
        table: 'users',
        fillable: ['id', 'name'],
        hidden: [],
        timestamps: false,
        casts: {},
      },
      (u) => ({
        posts: () => u.hasMany(Post, 'user_id'),
        comments: () => u.hasMany(Comment, 'user_id'),
      })
    );

    mockDb.query.mockResolvedValueOnce([{ id: 1, name: 'Alice' }]);

    // Mock constrained eager load
    mockDb.query.mockResolvedValueOnce([{ id: 1, user_id: 1, title: 'Post 1', published: true }]);

    // Mock count query
    mockDb.query.mockResolvedValueOnce([{ key: 1, count: 5 }]);

    const users = await User.query()
      .with({
        posts: (q) => q.where('published', '=', true),
      })
      .withCount('comments')
      .get<IModel>();

    expect(users).toHaveLength(1);
    expect((users[0] as any)?.getAttribute('comments_count')).toBe(5);
  });

  it('should support multiple withCount calls', async () => {
    const Post = Model.define({
      table: 'posts',
      fillable: ['id', 'user_id', 'title'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const Comment = Model.define({
      table: 'comments',
      fillable: ['id', 'user_id', 'content'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const User = Model.define(
      {
        table: 'users',
        fillable: ['id', 'name'],
        hidden: [],
        timestamps: false,
        casts: {},
      },
      (u) => ({
        posts: () => u.hasMany(Post, 'user_id'),
        comments: () => u.hasMany(Comment, 'user_id'),
      })
    );

    mockDb.query.mockResolvedValueOnce([{ id: 1, name: 'Alice' }]);
    mockDb.query.mockResolvedValueOnce([{ key: 1, count: 3 }]); // posts count
    mockDb.query.mockResolvedValueOnce([{ key: 1, count: 5 }]); // comments count

    const users = await User.query().withCount('posts').withCount('comments').get<IModel>();

    expect((users[0] as any)?.getAttribute('posts_count')).toBe(3);
    expect((users[0] as any)?.getAttribute('comments_count')).toBe(5);
  });
});
