/**
 * User Model
 */

import { Post } from '@app/Models/Post';
import { type IModel, Model } from '@zintrust/core';

/**
 * User Model Definition
 */
export const User = Model.define(
  {
    table: 'users',
    fillable: ['name', 'email', 'password'],
    hidden: ['password'],
    timestamps: true,
    casts: {
      email_verified_at: 'datetime',
    },
  },
  {
    /**
     * Get user's profile
     */
    profile(_model: IModel) {
      return undefined; // Placeholder
    },

    /**
     * Get user's posts
     */
    posts(model: IModel) {
      return model.hasMany(Post);
    },

    /**
     * Check if user is admin
     */
    isAdmin(model: IModel) {
      return model.getAttribute('is_admin') === 1;
    },

    /**
     * Get user's full name
     */
    getFullName(model: IModel) {
      const name = model.getAttribute('name');
      return typeof name === 'string' ? name : '';
    },
  }
);

export default User;
