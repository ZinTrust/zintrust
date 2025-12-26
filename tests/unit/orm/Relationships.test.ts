import { Model } from '@orm/Model';
import { BelongsTo, BelongsToMany, HasMany, HasOne } from '@orm/Relationships';
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
});
