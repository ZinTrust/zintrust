import { Model } from '@orm/Model';
import {
  BelongsTo,
  BelongsToMany,
  HasMany,
  HasOne,
  MorphMany,
  MorphOne,
  MorphTo,
} from '@orm/Relationships';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const RelatedModel = Model.define({
  table: 'related_models',
  fillable: [],
  hidden: [],
  timestamps: false,
  casts: {},
});

describe('Relationships', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('HasOne', () => {
    it('should create HasOne relation', () => {
      const relation = HasOne.create(RelatedModel, 'user_id', 'id');
      expect(relation).toBeDefined();
      expect(typeof relation.get).toBe('function');
    });
  });

  describe('HasMany', () => {
    it('should create HasMany relation', () => {
      const relation = HasMany.create(RelatedModel, 'user_id', 'id');
      expect(relation).toBeDefined();
      expect(typeof relation.get).toBe('function');
    });
  });

  describe('BelongsTo', () => {
    it('should create BelongsTo relation', () => {
      const relation = BelongsTo.create(RelatedModel, 'related_id', 'id');
      expect(relation).toBeDefined();
      expect(typeof relation.get).toBe('function');
    });
  });

  describe('BelongsToMany', () => {
    it('should create BelongsToMany relation', () => {
      const relation = BelongsToMany.create(RelatedModel, 'pivot_table', 'post_id', 'tag_id');
      expect(relation).toBeDefined();
      expect(typeof relation.get).toBe('function');
    });
  });

  describe('MorphOne', () => {
    it('should create MorphOne relation', () => {
      const relation = MorphOne.create(
        RelatedModel,
        'commentable',
        'commentable_type',
        'commentable_id'
      );
      expect(relation).toBeDefined();
      expect(relation.type).toBe('morphOne');
      expect(typeof relation.get).toBe('function');
    });

    it('should return null when local key is null/undefined/empty', async () => {
      const relation = MorphOne.create(
        RelatedModel,
        'commentable',
        'commentable_type',
        'commentable_id'
      );
      const mockInstance = {
        getAttribute: vi.fn(),
        fill: vi.fn(),
        setAttribute: vi.fn(),
        getAttributes: vi.fn(),
        save: vi.fn(),
        delete: vi.fn(),
        restore: vi.fn(),
        forceDelete: vi.fn(),
        isDeleted: vi.fn(),
        toJSON: vi.fn(),
        isDirty: vi.fn(),
        getTable: vi.fn(),
        exists: vi.fn(),
        setExists: vi.fn(),
        setRelation: vi.fn(),
        getRelation: vi.fn(),
        hasOne: vi.fn(),
        hasMany: vi.fn(),
        belongsTo: vi.fn(),
        belongsToMany: vi.fn(),
        morphOne: vi.fn(),
        morphMany: vi.fn(),
        morphTo: vi.fn(),
        hasOneThrough: vi.fn(),
        hasManyThrough: vi.fn(),
      };

      // Test null value
      mockInstance.getAttribute.mockReturnValue(null);
      const result1 = await relation.get(mockInstance);
      expect(result1).toBeNull();

      // Test undefined value
      mockInstance.getAttribute.mockReturnValue(undefined);
      const result2 = await relation.get(mockInstance);
      expect(result2).toBeNull();

      // Test empty string
      mockInstance.getAttribute.mockReturnValue('');
      const result3 = await relation.get(mockInstance);
      expect(result3).toBeNull();
    });

    it('should query related model with morph constraints', async () => {
      const mockInstance = {
        getAttribute: vi.fn().mockReturnValue(123),
        getTable: vi.fn().mockReturnValue('posts'),
        fill: vi.fn(),
        setAttribute: vi.fn(),
        getAttributes: vi.fn(),
        save: vi.fn(),
        delete: vi.fn(),
        restore: vi.fn(),
        forceDelete: vi.fn(),
        isDeleted: vi.fn(),
        toJSON: vi.fn(),
        isDirty: vi.fn(),
        exists: vi.fn(),
        setExists: vi.fn(),
        setRelation: vi.fn(),
        getRelation: vi.fn(),
        hasOne: vi.fn(),
        hasMany: vi.fn(),
        belongsTo: vi.fn(),
        belongsToMany: vi.fn(),
        morphOne: vi.fn(),
        morphMany: vi.fn(),
        morphTo: vi.fn(),
        hasOneThrough: vi.fn(),
        hasManyThrough: vi.fn(),
      };
      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: 123, title: 'Test Post' }),
      };
      const mockRelatedModel = {
        query: vi.fn().mockReturnValue(mockQuery),
      };

      // Create relation with mocked related model
      const morphRelation = MorphOne.create(
        mockRelatedModel as any,
        'commentable',
        'commentable_type',
        'commentable_id'
      );
      const result = await morphRelation.get(mockInstance);

      expect(mockRelatedModel.query).toHaveBeenCalled();
      expect(mockQuery.where).toHaveBeenCalledWith('commentable_type', '=', 'posts');
      expect(mockQuery.where).toHaveBeenCalledWith('commentable_id', '=', 123);
      expect(mockQuery.first).toHaveBeenCalled();
      expect(result).toEqual({ id: 123, title: 'Test Post' });
    });
  });

  describe('MorphMany', () => {
    it('should create MorphMany relation', () => {
      const relation = MorphMany.create(
        RelatedModel,
        'comments',
        'commentable_type',
        'commentable_id'
      );
      expect(relation).toBeDefined();
      expect(relation.type).toBe('morphMany');
      expect(typeof relation.get).toBe('function');
    });

    it('should return empty array when local key is null/undefined/empty', async () => {
      const relation = MorphMany.create(
        RelatedModel,
        'comments',
        'commentable_type',
        'commentable_id'
      );
      const mockInstance = {
        getAttribute: vi.fn(),
        fill: vi.fn(),
        setAttribute: vi.fn(),
        getAttributes: vi.fn(),
        save: vi.fn(),
        delete: vi.fn(),
        restore: vi.fn(),
        forceDelete: vi.fn(),
        isDeleted: vi.fn(),
        toJSON: vi.fn(),
        isDirty: vi.fn(),
        getTable: vi.fn(),
        exists: vi.fn(),
        setExists: vi.fn(),
        setRelation: vi.fn(),
        getRelation: vi.fn(),
        hasOne: vi.fn(),
        hasMany: vi.fn(),
        belongsTo: vi.fn(),
        belongsToMany: vi.fn(),
        morphOne: vi.fn(),
        morphMany: vi.fn(),
        morphTo: vi.fn(),
        hasOneThrough: vi.fn(),
        hasManyThrough: vi.fn(),
      };

      // Test null value
      mockInstance.getAttribute.mockReturnValue(null);
      const result1 = await relation.get(mockInstance);
      expect(result1).toEqual([]);

      // Test undefined value
      mockInstance.getAttribute.mockReturnValue(undefined);
      const result2 = await relation.get(mockInstance);
      expect(result2).toEqual([]);

      // Test empty string
      mockInstance.getAttribute.mockReturnValue('');
      const result3 = await relation.get(mockInstance);
      expect(result3).toEqual([]);
    });

    it('should query related model with morph constraints for many relations', async () => {
      const mockInstance = {
        getAttribute: vi.fn().mockReturnValue(123),
        getTable: vi.fn().mockReturnValue('posts'),
        fill: vi.fn(),
        setAttribute: vi.fn(),
        getAttributes: vi.fn(),
        save: vi.fn(),
        delete: vi.fn(),
        restore: vi.fn(),
        forceDelete: vi.fn(),
        isDeleted: vi.fn(),
        toJSON: vi.fn(),
        isDirty: vi.fn(),
        exists: vi.fn(),
        setExists: vi.fn(),
        setRelation: vi.fn(),
        getRelation: vi.fn(),
        hasOne: vi.fn(),
        hasMany: vi.fn(),
        belongsTo: vi.fn(),
        belongsToMany: vi.fn(),
        morphOne: vi.fn(),
        morphMany: vi.fn(),
        morphTo: vi.fn(),
        hasOneThrough: vi.fn(),
        hasManyThrough: vi.fn(),
      };
      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue([
          { id: 1, content: 'Comment 1' },
          { id: 2, content: 'Comment 2' },
        ]),
      };
      const mockRelatedModel = {
        query: vi.fn().mockReturnValue(mockQuery),
      };

      // Create relation with mocked related model
      const morphRelation = MorphMany.create(
        mockRelatedModel as any,
        'comments',
        'commentable_type',
        'commentable_id'
      );
      const result = await morphRelation.get(mockInstance);

      expect(mockRelatedModel.query).toHaveBeenCalled();
      expect(mockQuery.where).toHaveBeenCalledWith('commentable_type', '=', 'posts');
      expect(mockQuery.where).toHaveBeenCalledWith('commentable_id', '=', 123);
      expect(mockQuery.get).toHaveBeenCalled();
      expect(result).toEqual([
        { id: 1, content: 'Comment 1' },
        { id: 2, content: 'Comment 2' },
      ]);
    });
  });

  describe('MorphTo', () => {
    const PostModel = Model.define({
      table: 'posts',
      fillable: [],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const CommentModel = Model.define({
      table: 'comments',
      fillable: [],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    const morphMap = {
      post: PostModel,
      comment: CommentModel,
    };

    const createMockInstance = (typeValue: any, idValue: any) => ({
      getAttribute: vi.fn().mockImplementation((key) => {
        if (key === 'commentable_type') return typeValue;
        if (key === 'commentable_id') return idValue;
        return undefined;
      }),
      fill: vi.fn(),
      setAttribute: vi.fn(),
      getAttributes: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
      restore: vi.fn(),
      forceDelete: vi.fn(),
      isDeleted: vi.fn(),
      toJSON: vi.fn(),
      isDirty: vi.fn(),
      getTable: vi.fn(),
      exists: vi.fn(),
      setExists: vi.fn(),
      setRelation: vi.fn(),
      getRelation: vi.fn(),
      hasOne: vi.fn(),
      hasMany: vi.fn(),
      belongsTo: vi.fn(),
      belongsToMany: vi.fn(),
      morphOne: vi.fn(),
      morphMany: vi.fn(),
      morphTo: vi.fn(),
      hasOneThrough: vi.fn(),
      hasManyThrough: vi.fn(),
    });

    it('should create MorphTo relation', () => {
      const relation = MorphTo.create(
        'commentable',
        morphMap,
        'commentable_type',
        'commentable_id'
      );
      expect(relation).toBeDefined();
      expect(relation.type).toBe('morphTo');
      expect(typeof relation.get).toBe('function');
    });

    it('should return null when morph type or id is null/undefined/empty', async () => {
      const relation = MorphTo.create(
        'commentable',
        morphMap,
        'commentable_type',
        'commentable_id'
      );

      // Test null type
      const result1 = await relation.get(createMockInstance(null, 123));
      expect(result1).toBeNull();

      // Test undefined type
      const result2 = await relation.get(createMockInstance(undefined, 123));
      expect(result2).toBeNull();

      // Test empty type
      const result3 = await relation.get(createMockInstance('', 123));
      expect(result3).toBeNull();

      // Test null id
      const result4 = await relation.get(createMockInstance('post', null));
      expect(result4).toBeNull();

      // Test undefined id
      const result5 = await relation.get(createMockInstance('post', undefined));
      expect(result5).toBeNull();

      // Test empty id
      const result6 = await relation.get(createMockInstance('post', ''));
      expect(result6).toBeNull();
    });

    it('should throw error for unknown morph type', async () => {
      const relation = MorphTo.create(
        'commentable',
        morphMap,
        'commentable_type',
        'commentable_id'
      );
      const mockInstance = {
        getAttribute: vi.fn().mockImplementation((key) => {
          if (key === 'commentable_type') return 'unknown_type';
          if (key === 'commentable_id') return 123;
          return undefined;
        }),
        fill: vi.fn(),
        setAttribute: vi.fn(),
        getAttributes: vi.fn(),
        save: vi.fn(),
        delete: vi.fn(),
        restore: vi.fn(),
        forceDelete: vi.fn(),
        isDeleted: vi.fn(),
        toJSON: vi.fn(),
        isDirty: vi.fn(),
        getTable: vi.fn(),
        exists: vi.fn(),
        setExists: vi.fn(),
        setRelation: vi.fn(),
        getRelation: vi.fn(),
        hasOne: vi.fn(),
        hasMany: vi.fn(),
        belongsTo: vi.fn(),
        belongsToMany: vi.fn(),
        morphOne: vi.fn(),
        morphMany: vi.fn(),
        morphTo: vi.fn(),
        hasOneThrough: vi.fn(),
        hasManyThrough: vi.fn(),
      };

      await expect(relation.get(mockInstance)).rejects.toThrow();
      try {
        await relation.get(mockInstance);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Unknown morph type: unknown_type');
        // The actual implementation uses Object.keys() which returns string keys
        expect((error as Error).message).toContain('Available types: post, comment');
      }
    });

    it('should query correct model based on morph type', async () => {
      const mockInstance = {
        getAttribute: vi.fn().mockImplementation((key) => {
          if (key === 'commentable_type') return 'post';
          if (key === 'commentable_id') return 123;
          return undefined;
        }),
        fill: vi.fn(),
        setAttribute: vi.fn(),
        getAttributes: vi.fn(),
        save: vi.fn(),
        delete: vi.fn(),
        restore: vi.fn(),
        forceDelete: vi.fn(),
        isDeleted: vi.fn(),
        toJSON: vi.fn(),
        isDirty: vi.fn(),
        getTable: vi.fn(),
        exists: vi.fn(),
        setExists: vi.fn(),
        setRelation: vi.fn(),
        getRelation: vi.fn(),
        hasOne: vi.fn(),
        hasMany: vi.fn(),
        belongsTo: vi.fn(),
        belongsToMany: vi.fn(),
        morphOne: vi.fn(),
        morphMany: vi.fn(),
        morphTo: vi.fn(),
        hasOneThrough: vi.fn(),
        hasManyThrough: vi.fn(),
      };
      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: 123, title: 'Test Post' }),
      };
      const mockPostModel = {
        query: vi.fn().mockReturnValue(mockQuery),
      };

      // Create relation with mocked morph map
      const mockMorphMap = {
        post: mockPostModel as any,
        comment: CommentModel,
      };
      const morphRelation = MorphTo.create(
        'commentable',
        mockMorphMap,
        'commentable_type',
        'commentable_id'
      );
      const result = await morphRelation.get(mockInstance);

      expect(mockPostModel.query).toHaveBeenCalled();
      expect(mockQuery.where).toHaveBeenCalledWith('id', '=', 123);
      expect(mockQuery.first).toHaveBeenCalled();
      expect(result).toEqual({ id: 123, title: 'Test Post' });
    });
  });
});
