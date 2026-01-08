import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IDatabase } from '@orm/Database';
import type { IDatabaseAdapter } from '@orm/DatabaseAdapter';

const supportsResetSchema = (
  adapter: IDatabaseAdapter
): adapter is IDatabaseAdapter & { resetSchema: () => Promise<void> } =>
  typeof adapter.resetSchema === 'function';

export const SqliteMaintenance = Object.freeze({
  async dropAllTables(db: IDatabase): Promise<void> {
    if (db.getType() !== 'sqlite') {
      throw ErrorFactory.createDatabaseError('dropAllTables is only supported for sqlite');
    }

    const adapter: IDatabaseAdapter = db.getAdapterInstance(false);
    if (!supportsResetSchema(adapter)) {
      throw ErrorFactory.createDatabaseError('SQLite adapter does not support resetSchema()');
    }
    await adapter.resetSchema();
  },
});
