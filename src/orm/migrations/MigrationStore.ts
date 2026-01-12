import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IDatabase } from '@orm/Database';
import type { IDatabaseAdapter } from '@orm/DatabaseAdapter';
import { QueryBuilder } from '@orm/QueryBuilder';

import type { MigrationRecord, MigrationRecordStatus, MigrationScope } from '@/migrations/types';

function nowIso(): string {
  // MySQL/MariaDB DATETIME does not accept ISO8601 with timezone (e.g. trailing 'Z').
  // Use a portable UTC datetime string.
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

const toSafeService = (service: string | null | undefined): string => {
  if (typeof service !== 'string') return '';
  return service.length > 0 ? service : '';
};

const assertDbSupportsMigrations = (db: IDatabase): void => {
  const t = db.getType();
  if (t === 'd1' || t === 'd1-remote') {
    throw ErrorFactory.createCliError(
      'This project is configured for D1. Use `zin d1:migrate --local|--remote` for now.'
    );
  }
};

type IMigrationsTableCapableAdapter = IDatabaseAdapter & {
  ensureMigrationsTable: () => Promise<void>;
};

const hasMigrationsTableSupport = (
  adapter: IDatabaseAdapter
): adapter is IMigrationsTableCapableAdapter => {
  return (
    typeof (adapter as Partial<IMigrationsTableCapableAdapter>).ensureMigrationsTable === 'function'
  );
};

const requireMigrationsTableSupport = (adapter: IDatabaseAdapter): (() => Promise<void>) => {
  if (!hasMigrationsTableSupport(adapter)) {
    throw ErrorFactory.createCliError(
      'Migrations tracking is not supported for this database adapter yet.'
    );
  }

  return async (): Promise<void> => {
    await adapter.ensureMigrationsTable();
  };
};

export const MigrationStore = Object.freeze({
  async ensureTable(db: IDatabase): Promise<void> {
    assertDbSupportsMigrations(db);

    const adapter = db.getAdapterInstance(false);
    const ensure = requireMigrationsTableSupport(adapter);
    await ensure();
  },

  async getLastCompletedBatch(
    db: IDatabase,
    scope: MigrationScope = 'global',
    service: string = ''
  ): Promise<number> {
    assertDbSupportsMigrations(db);

    const normalizedService = toSafeService(service);

    const row = await QueryBuilder.create('migrations', db)
      .max('batch', 'max_batch')
      .where('status', '=', 'completed')
      .andWhere('scope', '=', scope)
      .andWhere('service', '=', normalizedService)
      .first<{ max_batch?: unknown }>();

    const value = row?.max_batch;
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  },

  async getAppliedMap(
    db: IDatabase,
    scope: MigrationScope,
    service: string
  ): Promise<Map<string, MigrationRecord>> {
    assertDbSupportsMigrations(db);

    const normalizedService = toSafeService(service);

    const rows = await QueryBuilder.create('migrations', db)
      .select('name', 'scope', 'service', 'batch', 'status')
      .selectAs('applied_at', 'appliedAt')
      .where('scope', '=', scope)
      .andWhere('service', '=', normalizedService)
      .get<MigrationRecord>();

    const map = new Map<string, MigrationRecord>();
    for (const r of rows) {
      if (typeof r.name === 'string' && r.name.length > 0) {
        map.set(r.name, {
          ...r,
          service: toSafeService(r.service),
        });
      }
    }
    return map;
  },

  async insertRunning(
    db: IDatabase,
    params: { name: string; scope: MigrationScope; service: string; batch: number }
  ): Promise<void> {
    assertDbSupportsMigrations(db);

    const normalizedService = toSafeService(params.service);

    const existing = await QueryBuilder.create('migrations', db)
      .select('id')
      .where('name', '=', params.name)
      .andWhere('scope', '=', params.scope)
      .andWhere('service', '=', normalizedService)
      .first<{ id?: unknown }>();

    // Allow re-running previously failed/running migrations by updating the existing row.
    // This avoids tripping the UNIQUE(name, scope, service) constraint.
    if (existing?.id !== undefined && existing.id !== null) {
      await QueryBuilder.create('migrations', db)
        .where('name', '=', params.name)
        .andWhere('scope', '=', params.scope)
        .andWhere('service', '=', normalizedService)
        .update({
          batch: params.batch,
          status: 'running',
          applied_at: null,
        });
      return;
    }

    await QueryBuilder.create('migrations', db).insert({
      name: params.name,
      scope: params.scope,
      service: normalizedService,
      batch: params.batch,
      status: 'running',
      applied_at: null,
      created_at: nowIso(),
    });
  },

  async markStatus(
    db: IDatabase,
    params: {
      name: string;
      scope: MigrationScope;
      service: string;
      status: MigrationRecordStatus;
      appliedAt?: string | null;
    }
  ): Promise<void> {
    assertDbSupportsMigrations(db);

    const builder = QueryBuilder.create('migrations', db)
      .where('name', '=', params.name)
      .andWhere('scope', '=', params.scope)
      .andWhere('service', '=', toSafeService(params.service));

    if (params.appliedAt !== undefined) {
      await builder.update({ status: params.status, applied_at: params.appliedAt });
      return;
    }

    await builder.update({ status: params.status });
  },

  async listCompletedInBatchesGte(
    db: IDatabase,
    params: { scope: MigrationScope; service: string; minBatch: number }
  ): Promise<Array<{ name: string; batch: number }>> {
    assertDbSupportsMigrations(db);

    const rows = await QueryBuilder.create('migrations', db)
      .select('name', 'batch')
      .where('status', '=', 'completed')
      .andWhere('scope', '=', params.scope)
      .andWhere('service', '=', toSafeService(params.service))
      .andWhere('batch', '>=', params.minBatch)
      .orderBy('batch', 'DESC')
      .orderBy('id', 'DESC')
      .get<{ name?: unknown; batch?: unknown }>();

    const out: Array<{ name: string; batch: number }> = [];
    for (const r of rows) {
      const name = typeof r.name === 'string' ? r.name : '';
      const batch = typeof r.batch === 'number' ? r.batch : Number(r.batch);
      if (name.length === 0) continue;
      if (!Number.isFinite(batch)) continue;
      out.push({ name, batch });
    }
    return out;
  },

  async listAllCompletedNames(
    db: IDatabase,
    params: { scope: MigrationScope; service: string }
  ): Promise<string[]> {
    assertDbSupportsMigrations(db);

    const rows = await QueryBuilder.create('migrations', db)
      .select('name')
      .where('status', '=', 'completed')
      .andWhere('scope', '=', params.scope)
      .andWhere('service', '=', toSafeService(params.service))
      .orderBy('batch', 'DESC')
      .orderBy('id', 'DESC')
      .get<{ name?: unknown }>();

    return rows.map((r) => (typeof r.name === 'string' ? r.name : '')).filter((n) => n.length > 0);
  },

  async deleteRecord(
    db: IDatabase,
    params: { name: string; scope: MigrationScope; service: string }
  ): Promise<void> {
    assertDbSupportsMigrations(db);

    await QueryBuilder.create('migrations', db)
      .where('name', '=', params.name)
      .andWhere('scope', '=', params.scope)
      .andWhere('service', '=', toSafeService(params.service))
      .delete();
  },
});
