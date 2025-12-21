import { Model } from '@orm/Model';
import { QueryBuilder } from '@orm/QueryBuilder';
import { BelongsTo, BelongsToMany, HasMany, HasOne } from '@orm/Relationships';
import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Model and QueryBuilder
const mockQueryBuilder = {
  where: vi.fn().mockReturnThis(),
  join: vi.fn().mockReturnThis(),
  first: vi.fn().mockResolvedValue(null),
  get: vi.fn().mockResolvedValue([]),
} as unknown as QueryBuilder & {
  first: Mock;
  get: Mock;
  where: Mock;
  join: Mock;
};

// const mockModel = {
//   query: vi.fn().mockReturnValue(mockQueryBuilder),
//   getAttribute: vi.fn(),
// } as unknown as Model;

// Mock class for RelatedModel
class RelatedModel extends Model {
  static query() {
    return mockQueryBuilder as QueryBuilder;
  }
  getTable() {
    return 'related_models';
  }
}

describe('Relationships', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('HasOne', () => {
    it('should get related model', async () => {
      const relation = new HasOne(RelatedModel, 'user_id', 'id');
      const instance = { getAttribute: vi.fn().mockReturnValue(1) } as unknown as Model;
      const relatedInstance = new RelatedModel();

      mockQueryBuilder.first.mockResolvedValue(relatedInstance);

      const result = await relation.get(instance);

      expect(instance.getAttribute).toHaveBeenCalledWith('id');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('user_id', '=', 1);
      expect(mockQueryBuilder.first).toHaveBeenCalled();
      expect(result).toBe(relatedInstance);
    });

    it('should return null if local key is missing', async () => {
      const relation = new HasOne(RelatedModel, 'user_id', 'id');
      const instance = { getAttribute: vi.fn().mockReturnValue(null) } as unknown as Model;

      const result = await relation.get(instance);

      expect(result).toBeNull();
      expect(mockQueryBuilder.where).not.toHaveBeenCalled();
    });
  });

  describe('HasMany', () => {
    it('should get related models', async () => {
      const relation = new HasMany(RelatedModel, 'user_id', 'id');
      const instance = { getAttribute: vi.fn().mockReturnValue(1) } as unknown as Model;
      const relatedInstances = [new RelatedModel(), new RelatedModel()];

      mockQueryBuilder.get.mockResolvedValue(relatedInstances);

      const result = await relation.get(instance);

      expect(instance.getAttribute).toHaveBeenCalledWith('id');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('user_id', '=', 1);
      expect(mockQueryBuilder.get).toHaveBeenCalled();
      expect(result).toBe(relatedInstances);
    });

    it('should return empty array if local key is missing', async () => {
      const relation = new HasMany(RelatedModel, 'user_id', 'id');
      const instance = { getAttribute: vi.fn().mockReturnValue(null) } as unknown as Model;

      const result = await relation.get(instance);

      expect(result).toEqual([]);
      expect(mockQueryBuilder.where).not.toHaveBeenCalled();
    });
  });

  describe('BelongsTo', () => {
    it('should get related model', async () => {
      const relation = new BelongsTo(RelatedModel, 'user_id', 'id');
      const instance = { getAttribute: vi.fn().mockReturnValue(1) } as unknown as Model;
      const relatedInstance = new RelatedModel();

      mockQueryBuilder.first.mockResolvedValue(relatedInstance);

      const result = await relation.get(instance);

      expect(instance.getAttribute).toHaveBeenCalledWith('user_id');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('id', '=', 1);
      expect(mockQueryBuilder.first).toHaveBeenCalled();
      expect(result).toBe(relatedInstance);
    });

    it('should return null if foreign key is missing', async () => {
      const relation = new BelongsTo(RelatedModel, 'user_id', 'id');
      const instance = { getAttribute: vi.fn().mockReturnValue(null) } as unknown as Model;

      const result = await relation.get(instance);

      expect(result).toBeNull();
      expect(mockQueryBuilder.where).not.toHaveBeenCalled();
    });
  });

  describe('BelongsToMany', () => {
    it('should be instantiated correctly', () => {
      const relation = new BelongsToMany(RelatedModel, 'user_roles', 'user_id', 'role_id');
      expect(relation).toBeInstanceOf(BelongsToMany);
    });

    it('should get related models through pivot table', async () => {
      const relation = new BelongsToMany(RelatedModel, 'user_roles', 'user_id', 'role_id');
      const instance = { getAttribute: vi.fn().mockReturnValue(1) } as unknown as Model;
      const relatedInstances = [new RelatedModel(), new RelatedModel()];

      mockQueryBuilder.get.mockResolvedValue(relatedInstances);

      const result = await relation.get(instance);

      expect(instance.getAttribute).toHaveBeenCalledWith('id');
      expect(mockQueryBuilder.join).toHaveBeenCalledWith(
        'user_roles',
        'related_models.id = user_roles.role_id'
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('user_roles.user_id', 1);
      expect(mockQueryBuilder.get).toHaveBeenCalled();
      expect(result).toBe(relatedInstances);
    });

    it('should return empty array if instance id is missing', async () => {
      const relation = new BelongsToMany(RelatedModel, 'user_roles', 'user_id', 'role_id');
      const instance = { getAttribute: vi.fn().mockReturnValue(null) } as unknown as Model;

      const result = await relation.get(instance);

      expect(result).toEqual([]);
      expect(mockQueryBuilder.join).not.toHaveBeenCalled();
    });
  });
});
