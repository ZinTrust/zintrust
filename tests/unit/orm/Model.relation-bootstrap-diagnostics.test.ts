import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock('@config/logger', () => ({ Logger: mockLogger }));

import { Logger } from '@config/logger';
import { resetDatabase } from '@orm/Database';
import { Model } from '@orm/Model';

afterEach(async () => {
  delete process.env.ZINTRUST_DEBUG_RELATIONS;
  await resetDatabase();
  vi.clearAllMocks();
});

describe('Model relation bootstrap diagnostics', () => {
  it('logs a single structured warning when relation bootstrap touches the database early', () => {
    const Comment = Model.define({
      table: 'comments',
      fillable: ['id', 'post_id'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    Model.define(
      {
        table: 'posts',
        fillable: ['id'],
        hidden: [],
        timestamps: false,
        casts: {},
      },
      (post) => ({
        comments: () => Comment.query().where('post_id', '=', post.getAttribute('id')),
        latestComment: () =>
          Comment.query().where('post_id', '=', post.getAttribute('id')).orderBy('id', 'desc'),
      })
    );

    expect(Logger.warn).toHaveBeenCalledTimes(1);
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Model relation bootstrap failures detected: 2')
    );

    const warningMessage = vi.mocked(Logger.warn).mock.calls[0]?.[0];
    expect(String(warningMessage)).toContain('Model: posts | Relation: comments');
    expect(String(warningMessage)).toContain('Model: posts | Relation: latestComment');
    expect(String(warningMessage)).toContain('Source:');
    expect(String(warningMessage)).toContain('Recommendation: relation methods must stay lazy');

    expect(Logger.error).not.toHaveBeenCalledWith(
      '[DEBUG] Database instances keys:',
      expect.anything()
    );
    expect(Logger.error).not.toHaveBeenCalledWith('[DEBUG] Requesting connection:', 'default');
  });

  it('supports opt-in per-probe debug logging', () => {
    process.env.ZINTRUST_DEBUG_RELATIONS = '1';

    const Comment = Model.define({
      table: 'comments',
      fillable: ['id', 'post_id'],
      hidden: [],
      timestamps: false,
      casts: {},
    });

    Model.define(
      {
        table: 'posts',
        fillable: ['id'],
        hidden: [],
        timestamps: false,
        casts: {},
      },
      (post) => ({
        comments: () => Comment.query().where('post_id', '=', post.getAttribute('id')),
        titleLength: () => String(post.getAttribute('id') ?? '').length,
      })
    );

    expect(Logger.info).toHaveBeenCalledWith('[ORM] Relation bootstrap probing posts.comments');
    expect(Logger.info).toHaveBeenCalledWith('[ORM] Relation bootstrap probing posts.titleLength');
    expect(Logger.info).toHaveBeenCalledWith(
      '[ORM] Relation bootstrap ignored non-relationship posts.titleLength'
    );
    expect(Logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Model relation bootstrap failures detected: 1')
    );
  });
});
