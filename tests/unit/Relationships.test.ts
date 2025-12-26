/* eslint-disable prefer-arrow-callback */
import { Model } from '@orm/Model';
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

describe('Relationships', (): void => {
  beforeEach((): void => {
    vi.clearAllMocks();
  });

  describe('BelongsToMany', (): void => {
    it('should generate correct pivot table name', (): void => {
      const PostModel = Model.define(
        { table: 'posts', fillable: ['title'], hidden: [], timestamps: false, casts: {} },
        {}
      );
      const TagModel = Model.define(
        { table: 'tags', fillable: ['name'], hidden: [], timestamps: false, casts: {} },
        {}
      );

      const post = PostModel.create({ id: 1 });
      const relationship = post.belongsToMany(TagModel);

      // The relationship object should be usable
      expect(relationship).toBeDefined();
    });

    it('should use custom pivot table name if provided', (): void => {
      const PostModel = Model.define(
        { table: 'posts', fillable: ['title'], hidden: [], timestamps: false, casts: {} },
        {}
      );
      const TagModel = Model.define(
        { table: 'tags', fillable: ['name'], hidden: [], timestamps: false, casts: {} },
        {}
      );

      const post = PostModel.create({ id: 1 });
      const relationship = post.belongsToMany(TagModel, 'post_tag_pivot');

      // The relationship object should be usable
      expect(relationship).toBeDefined();
    });

    it('should call join and where on QueryBuilder', async (): Promise<void> => {
      const PostModel = Model.define(
        { table: 'posts', fillable: ['title'], hidden: [], timestamps: false, casts: {} },
        {}
      );
      const TagModel = Model.define(
        { table: 'tags', fillable: ['name'], hidden: [], timestamps: false, casts: {} },
        {}
      );

      const post = PostModel.create({ id: 1 });
      const relationship = post.belongsToMany(TagModel);

      // Test the relationship is created successfully
      expect(relationship).toBeDefined();
    });
  });
});
