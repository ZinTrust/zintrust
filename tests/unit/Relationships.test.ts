import { Model } from '@orm/Model';
import { QueryBuilder } from '@orm/QueryBuilder';
import { BelongsToMany } from '@orm/Relationships';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock QueryBuilder
vi.mock('@orm/QueryBuilder', () => {
  const mockInstance = {
    join: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    get: vi.fn().mockResolvedValue([]),
  };
  return {
    QueryBuilder: vi.fn().mockImplementation(function () {
      return mockInstance;
    }),
  };
});

class Post extends Model {
  protected table = 'posts';

  public tags(): BelongsToMany {
    return this.belongsToMany(Tag);
  }
}

class Tag extends Model {
  protected table = 'tags';
}

describe('Relationships', (): void => {
  beforeEach((): void => {
    vi.clearAllMocks();
  });

  describe('BelongsToMany', (): void => {
    it('should generate correct pivot table name', (): void => {
      const post = new Post();
      const relationship = post.tags();

      // Access private property via casting to any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((relationship as any)._throughTable).toBe('posts_tags');
    });

    it('should use custom pivot table name if provided', (): void => {
      class CustomPost extends Model {
        public tags(): BelongsToMany {
          return this.belongsToMany(Tag, 'post_tag_pivot');
        }
      }

      const post = new CustomPost();
      const relationship = post.tags();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((relationship as any)._throughTable).toBe('post_tag_pivot');
    });

    it('should call join and where on QueryBuilder', async (): Promise<void> => {
      const post = new Post({ id: 1 });
      const relationship = post.tags();

      await relationship.get(post);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockQueryBuilder = (QueryBuilder as any).mock.results[0].value;

      expect(mockQueryBuilder.join).toHaveBeenCalledWith(
        'posts_tags',
        'tags.id = posts_tags.tag_id'
      );

      expect(mockQueryBuilder.where).toHaveBeenCalledWith('posts_tags.post_id', 1);

      expect(mockQueryBuilder.get).toHaveBeenCalled();
    });
  });
});
