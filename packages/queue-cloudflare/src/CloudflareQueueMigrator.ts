import type { D1DatabaseLike, ZinTrustDatabaseLike } from './types.js';
import {
  cloudflareQueueMigrationStatements,
  cloudflareQueueRollbackStatements,
} from './migrationSql.js';

export type CloudflareQueueMigrationTarget =
  | { d1: D1DatabaseLike; db?: never }
  | { db: ZinTrustDatabaseLike; d1?: never };

const runStatement = async (
  target: CloudflareQueueMigrationTarget,
  statement: string
): Promise<void> => {
  if ('d1' in target && target.d1 !== undefined) {
    await target.d1.prepare(statement).run();
    return;
  }

  await target.db.execute(statement);
};

export const CloudflareQueueMigrator = Object.freeze({
  statements: cloudflareQueueMigrationStatements,
  rollbackStatements: cloudflareQueueRollbackStatements,

  async up(target: CloudflareQueueMigrationTarget): Promise<void> {
    for (const statement of cloudflareQueueMigrationStatements) {
      await runStatement(target, statement);
    }
  },

  async down(target: CloudflareQueueMigrationTarget): Promise<void> {
    for (const statement of cloudflareQueueRollbackStatements) {
      await runStatement(target, statement);
    }
  },
});
