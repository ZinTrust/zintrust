import {
  cloudflareQueueMigrationStatements,
  cloudflareQueueRollbackStatements,
} from './migrationSql.js';
import type { D1DatabaseLike, ZinTrustDatabaseLike } from './types.js';

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
    await Promise.all(
      cloudflareQueueMigrationStatements.map((statement) => runStatement(target, statement))
    );
  },

  async down(target: CloudflareQueueMigrationTarget): Promise<void> {
    await Promise.all(
      cloudflareQueueRollbackStatements.map((statement) => runStatement(target, statement))
    );
  },
});
