/**
 * Example User Model
 * Demonstrates how to define models with relationships
 */

import { Model } from '@orm/Model';

export class User extends Model {
  protected table = 'users';
  protected fillable = ['name', 'email', 'password'];
  protected hidden = ['password'];
  protected timestamps = true;
  protected casts = {
    email_verified_at: 'datetime',
    password: 'hashed',
    is_admin: 'boolean',
    metadata: 'json',
  };

  /**
   * Get user's posts
   */
  public async posts() {
    // return this.hasMany(Post);
  }

  /**
   * Get user's profile
   */
  public async profile() {
    // return this.hasOne(Profile);
  }

  /**
   * Check if user is admin
   */
  public isAdmin(): boolean {
    return Boolean(this.getAttribute('is_admin'));
  }

  /**
   * Get full name accessor
   */
  public getFullName(): string {
    return String(this.getAttribute('name') || '');
  }
}
