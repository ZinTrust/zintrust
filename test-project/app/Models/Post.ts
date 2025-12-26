/**
 * Example Post Model
 */

import { User } from '@app/Models/User';
import { type IModel, Model, type ModelConfig, type IRelationship } from '@zintrust/core';

export const PostConfig: ModelConfig = {
  table: 'posts',
  fillable: ['title', 'content', 'user_id'],
  hidden: [],
  timestamps: true,
  casts: {
    published_at: 'datetime',
    is_published: 'boolean',
  },
};

/**
 * Post Model
 * Refactored to Functional Object pattern
 */
export const Post = Model.define(PostConfig, {
  /**
   * Get post's author
   */
  author(model: IModel): IRelationship {
    return model.belongsTo(User);
  },
});
