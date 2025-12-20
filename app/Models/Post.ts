/**
 * Example Post Model
 */

import { User } from '@app/Models/User';
import { Model } from '@orm/Model';

export class Post extends Model {
  protected table = 'posts';
  protected fillable = ['title', 'content', 'user_id'];
  protected hidden = [];
  protected timestamps = true;
  protected casts = {
    published_at: 'datetime',
    is_published: 'boolean',
  };

  /**
   * Get post's author
   */
  public async author() {
    return this.belongsTo(User);
  }
}
