import { describe, expect, it, vi } from 'vitest';

vi.mock('@orm/Database', () => ({
  useDatabase: vi.fn(() => undefined),
}));

describe('app models', () => {
  it('User model helpers and relationships', async () => {
    const { User } = await import('@app/Models/User');

    const user = User.create();

    expect(user.profile()).toBeUndefined();
    expect(user.posts()).toBeDefined();

    user.setAttribute('is_admin', 1);
    expect(user.isAdmin()).toBe(true);

    user.setAttribute('name', 'Alice');
    expect(user.getFullName()).toBe('Alice');

    user.setAttribute('name', 123);
    expect(user.getFullName()).toBe('');
  });

  it('Post model author relationship', async () => {
    const { Post } = await import('@app/Models/Post');

    const post = Post.create();
    expect(post.author()).toBeDefined();
  });
});
