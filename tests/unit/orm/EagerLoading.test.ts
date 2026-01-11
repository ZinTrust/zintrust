import { useDatabase } from '@orm/Database';
import { Model } from '@orm/Model';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orm/Database', () => ({
  useDatabase: vi.fn(),
}));

describe('ORM Eager Loading (N+1 Prevention)', () => {
  const userConfig = {
    table: 'users',
    fillable: ['id', 'name'],
    hidden: [],
    timestamps: false,
    casts: {},
  };

  const postConfig = {
    table: 'posts',
    fillable: ['id', 'user_id', 'title'],
    hidden: [],
    timestamps: false,
    casts: {},
  };

  const User = Model.define(userConfig, (u) => ({
    posts: () => u.hasMany(Post, 'user_id'),
  }));

  const Post = Model.define(postConfig, (p) => ({
    user: () => p.belongsTo(User, 'user_id'),
  }));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prevents N+1 by fetching relationships in a single batch query', async () => {
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      query: vi.fn(),
      get: vi.fn(),
    };

    (useDatabase as any).mockReturnValue(mockDb);

    // Mock User.all() results
    mockDb.query.mockResolvedValueOnce([
      { id: 1, name: 'User 1' },
      { id: 2, name: 'User 2' },
    ]);

    // Mock Post fetch for both users (Batch Query)
    mockDb.query.mockResolvedValueOnce([
      { id: 10, user_id: 1, title: 'Post 1' },
      { id: 11, user_id: 1, title: 'Post 2' },
      { id: 12, user_id: 2, title: 'Post 3' },
    ]);

    // Execute query with eager loading
    const users = (await User.query().with('posts').get()) as any[];

    // Verify User query
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM "users"'),
      expect.any(Array),
      true
    );

    // Verify Post query (The "N+1 prevention" part)
    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT * FROM "posts" WHERE "user_id" IN (?, ?)'),
      expect.arrayContaining([1, 2]),
      true
    );

    const user1Posts = users[0].getRelation<any[]>('posts');
    expect(user1Posts).toHaveLength(2);
    expect(user1Posts[0].getAttribute('title')).toBe('Post 1');

    const user2Posts = users[1].getRelation<any[]>('posts');
    expect(user2Posts).toHaveLength(1);
    expect(user2Posts[0].getAttribute('title')).toBe('Post 3');

    // Total database calls should be 2 (one for users, one for posts)
    // instead of 3 (one for users + 2 for posts)
    expect(mockDb.query).toHaveBeenCalledTimes(2);
  });

  it('handles empty results gracefully', async () => {
    const mockDb = {
      from: vi.fn().mockReturnThis(),
      query: vi.fn().mockResolvedValue([]),
    };
    (useDatabase as any).mockReturnValue(mockDb);

    const users = (await User.query().with('posts').get()) as any[];
    expect(users).toHaveLength(0);
    expect(mockDb.query).toHaveBeenCalledTimes(1);
  });
});
