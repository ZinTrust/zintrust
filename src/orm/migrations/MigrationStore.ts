import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';
import type { IDatabase } from '@orm/Database';
import type { IDatabaseAdapter } from '@orm/DatabaseAdapter';
import { QueryBuilder } from '@orm/QueryBuilder';

import type { MigrationRecord, MigrationRecordStatus, MigrationScope } from '@migrations/types';

type MigrationsTableLayout = {
  hasAppliedAt: boolean;
  hasCreatedAt: boolean;
  hasMigration: boolean;
  hasName: boolean;
  hasScope: boolean;
  hasService: boolean;
  hasStatus: boolean;
  requiresCompatibilityMode: boolean;
};

const DEFAULT_LAYOUT: MigrationsTableLayout = Object.freeze({
  hasAppliedAt: true,
  hasCreatedAt: true,
  hasMigration: false,
  hasName: true,
  hasScope: true,
  hasService: true,
  hasStatus: true,
  requiresCompatibilityMode: false,
});

const tableLayoutCache = new WeakMap<IDatabase, Promise<MigrationsTableLayout>>();

function nowIso(): string {
  // MySQL/MariaDB DATETIME does not accept ISO8601 with timezone (e.g. trailing 'Z').
  // Use a portable UTC datetime string.
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

const toSafeService = (service: string | null | undefined): string => {
  if (typeof service !== 'string') return '';
  return service.length > 0 ? service : '';
};

const isDefaultTrackingTarget = (scope: MigrationScope, service: string): boolean => {
  return scope === 'global' && service === '';
};

const queryExists = async (db: IDatabase, sql: string, parameters: unknown[]): Promise<boolean> => {
  const rows = await db.query(sql, parameters, true);
  return rows.length > 0;
};

const schemaHasTable = async (db: IDatabase, tableName: string): Promise<boolean> => {
  const driver = db.getType();

  if (driver === 'sqlite' || driver === 'd1' || driver === 'd1-remote') {
    return queryExists(db, "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", [
      tableName,
    ]);
  }

  if (driver === 'postgresql') {
    return queryExists(
      db,
      "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=? LIMIT 1",
      [tableName]
    );
  }

  if (driver === 'mysql') {
    return queryExists(
      db,
      'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name=? LIMIT 1',
      [tableName]
    );
  }

  if (driver === 'sqlserver') {
    return queryExists(db, 'SELECT 1 FROM sys.tables WHERE name=? LIMIT 1', [tableName]);
  }

  throw ErrorFactory.createCliError(`Unsupported DB driver: ${driver}`);
};

const schemaHasColumn = async (
  db: IDatabase,
  tableName: string,
  columnName: string
): Promise<boolean> => {
  const driver = db.getType();

  if (driver === 'sqlite' || driver === 'd1' || driver === 'd1-remote') {
    const rows = await db.query(`PRAGMA table_info("${tableName}")`, [], true);
    return rows.some((row) => {
      const record = row as { name?: unknown };
      return typeof record.name === 'string' && record.name === columnName;
    });
  }

  if (driver === 'postgresql') {
    return queryExists(
      db,
      "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=? AND column_name=? LIMIT 1",
      [tableName, columnName]
    );
  }

  if (driver === 'mysql') {
    return queryExists(
      db,
      'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name=? AND column_name=? LIMIT 1',
      [tableName, columnName]
    );
  }

  if (driver === 'sqlserver') {
    return queryExists(db, 'SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(?) AND name=?', [
      tableName,
      columnName,
    ]);
  }

  throw ErrorFactory.createCliError(`Unsupported DB driver: ${driver}`);
};

const clearTableLayoutCache = (db: IDatabase): void => {
  tableLayoutCache.delete(db);
};

type MigrationsTableProbeResult = {
  hasAppliedAt: boolean;
  hasCreatedAt: boolean;
  hasMigration: boolean;
  hasName: boolean;
  hasScope: boolean;
  hasService: boolean;
  hasStatus: boolean;
  hasTable: boolean;
};

const ensureTrackingTable = async (db: IDatabase): Promise<void> => {
  assertDbSupportsMigrations(db);

  const adapter = db.getAdapterInstance(false);
  const ensure = requireMigrationsTableSupport(adapter);

  // getAdapterInstance(false) returns a raw adapter without going through Database.query()
  // which auto-connects; ensure we're connected before creating the migrations table.
  if (typeof (db as unknown as { connect?: unknown }).connect === 'function') {
    await (db as unknown as { connect: () => Promise<void> }).connect();
  } else if (typeof (adapter as unknown as { connect?: unknown }).connect === 'function') {
    await (adapter as unknown as { connect: () => Promise<void> }).connect();
  }

  clearTableLayoutCache(db);
  await ensure();
  clearTableLayoutCache(db);
};

const probeTableLayout = async (db: IDatabase): Promise<MigrationsTableProbeResult> => {
  const [
    hasTable,
    hasName,
    hasMigration,
    hasScope,
    hasService,
    hasStatus,
    hasAppliedAt,
    hasCreatedAt,
  ] = await Promise.all([
    schemaHasTable(db, 'migrations'),
    schemaHasColumn(db, 'migrations', 'name'),
    schemaHasColumn(db, 'migrations', 'migration'),
    schemaHasColumn(db, 'migrations', 'scope'),
    schemaHasColumn(db, 'migrations', 'service'),
    schemaHasColumn(db, 'migrations', 'status'),
    schemaHasColumn(db, 'migrations', 'applied_at'),
    schemaHasColumn(db, 'migrations', 'created_at'),
  ]);

  return {
    hasAppliedAt,
    hasCreatedAt,
    hasMigration,
    hasName,
    hasScope,
    hasService,
    hasStatus,
    hasTable,
  };
};

const ensureProbeTableExists = async (
  db: IDatabase,
  probe: MigrationsTableProbeResult,
  allowEnsure: boolean
): Promise<MigrationsTableLayout | null> => {
  if (probe.hasTable || !allowEnsure) return null;

  await ensureTrackingTable(db);
  return resolveTableLayout(db, false);
};

const assertProbeHasIdentityColumns = (probe: MigrationsTableProbeResult): void => {
  if (probe.hasName || probe.hasMigration) return;

  throw ErrorFactory.createCliError(
    'The migrations table is missing both `name` and `migration` columns. Update the tracking table before running migrations.'
  );
};

const toTableLayout = (probe: MigrationsTableProbeResult): MigrationsTableLayout => {
  return {
    hasAppliedAt: probe.hasAppliedAt,
    hasCreatedAt: probe.hasCreatedAt,
    hasMigration: probe.hasMigration,
    hasName: probe.hasName,
    hasScope: probe.hasScope,
    hasService: probe.hasService,
    hasStatus: probe.hasStatus,
    requiresCompatibilityMode:
      probe.hasMigration ||
      !probe.hasName ||
      !probe.hasScope ||
      !probe.hasService ||
      !probe.hasStatus,
  };
};

const loadTableLayout = async (
  db: IDatabase,
  allowEnsure: boolean
): Promise<MigrationsTableLayout> => {
  if (typeof db.query !== 'function') return DEFAULT_LAYOUT;

  const probe = await probeTableLayout(db);
  const ensuredLayout = await ensureProbeTableExists(db, probe, allowEnsure);
  if (ensuredLayout !== null) return ensuredLayout;

  assertProbeHasIdentityColumns(probe);
  return toTableLayout(probe);
};

const resolveTableLayout = async (
  db: IDatabase,
  allowEnsure: boolean = true
): Promise<MigrationsTableLayout> => {
  const cached = tableLayoutCache.get(db);
  if (cached !== undefined) return cached;

  const layoutPromise = loadTableLayout(db, allowEnsure);

  tableLayoutCache.set(db, layoutPromise);
  return layoutPromise.catch((error) => {
    if (tableLayoutCache.get(db) === layoutPromise) {
      clearTableLayoutCache(db);
    }
    throw error;
  });
};

const assertCompatibleTrackingTarget = (
  layout: MigrationsTableLayout,
  scope: MigrationScope,
  service: string
): void => {
  if ((layout.hasScope && layout.hasService) || isDefaultTrackingTarget(scope, service)) return;

  throw ErrorFactory.createCliError(
    'The existing migrations table uses the legacy schema and does not support scoped/service-specific migration tracking yet.'
  );
};

const buildLegacyIdentity = (
  layout: MigrationsTableLayout,
  name: string,
  scope: MigrationScope,
  service: string
): { params: unknown[]; sql: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (layout.hasName && layout.hasMigration) {
    conditions.push('(name = ? OR migration = ?)');
    params.push(name, name);
  } else if (layout.hasName) {
    conditions.push('name = ?');
    params.push(name);
  } else {
    conditions.push('migration = ?');
    params.push(name);
  }

  if (layout.hasScope) {
    conditions.push('scope = ?');
    params.push(scope);
  }

  if (layout.hasService) {
    conditions.push('service = ?');
    params.push(service);
  }

  return { params, sql: conditions.join(' AND ') };
};

const normalizeLegacyName = (row: Record<string, unknown>): string => {
  if (typeof row['name'] === 'string' && row['name'].length > 0) return row['name'];
  if (typeof row['migration'] === 'string' && row['migration'].length > 0) return row['migration'];
  return '';
};

const getLegacyBatch = (row: Record<string, unknown>): number => {
  const value = row['batch'];
  return typeof value === 'number' ? value : Number(value);
};

const getLegacyAppliedAt = (row: Record<string, unknown>): string | null => {
  return typeof row['applied_at'] === 'string' ? row['applied_at'] : null;
};

const toLegacyMigrationRecord = (
  row: Record<string, unknown>,
  layout: MigrationsTableLayout,
  scope: MigrationScope,
  normalizedService: string
): MigrationRecord | undefined => {
  const name = normalizeLegacyName(row);
  const batch = getLegacyBatch(row);
  if (name === '' || !Number.isFinite(batch)) return undefined;

  return {
    name,
    scope: layout.hasScope ? scope : 'global',
    service: layout.hasService ? normalizedService : '',
    batch,
    status:
      typeof row['status'] === 'string' ? (row['status'] as MigrationRecordStatus) : 'completed',
    appliedAt: getLegacyAppliedAt(row),
  };
};

const buildLegacyAppliedMap = (
  rows: Record<string, unknown>[],
  layout: MigrationsTableLayout,
  scope: MigrationScope,
  normalizedService: string
): Map<string, MigrationRecord> => {
  const map = new Map<string, MigrationRecord>();

  for (const row of rows) {
    const record = toLegacyMigrationRecord(row, layout, scope, normalizedService);
    if (record === undefined) continue;
    map.set(record.name, record);
  }

  return map;
};

const buildAppliedMap = (rows: MigrationRecord[]): Map<string, MigrationRecord> => {
  const map = new Map<string, MigrationRecord>();

  for (const row of rows) {
    if (typeof row.name !== 'string' || row.name.length === 0) continue;

    map.set(row.name, {
      ...row,
      service: toSafeService(row.service),
    });
  }

  return map;
};

const getLegacyAppliedRows = async (
  db: IDatabase,
  layout: MigrationsTableLayout,
  scope: MigrationScope,
  service: string
): Promise<Record<string, unknown>[]> => {
  const normalizedService = toSafeService(service);
  assertCompatibleTrackingTarget(layout, scope, normalizedService);

  const selectColumns = [
    ...(layout.hasName ? ['name'] : []),
    ...(layout.hasMigration ? ['migration'] : []),
    'batch',
    ...(layout.hasAppliedAt ? ['applied_at'] : []),
  ];
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (layout.hasStatus) {
    conditions.push('status = ?');
    params.push('completed');
  }

  if (layout.hasScope) {
    conditions.push('scope = ?');
    params.push(scope);
  }

  if (layout.hasService) {
    conditions.push('service = ?');
    params.push(normalizedService);
  }

  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  return (await db.query(
    `SELECT ${selectColumns.join(', ')} FROM migrations${whereClause}`,
    params,
    true
  )) as Record<string, unknown>[];
};

const findLegacyMigrationRecord = async (
  db: IDatabase,
  layout: MigrationsTableLayout,
  params: { name: string; scope: MigrationScope; service: string }
): Promise<boolean> => {
  const identity = buildLegacyIdentity(layout, params.name, params.scope, params.service);
  const existing = (await db.query(
    `SELECT id FROM migrations WHERE ${identity.sql} LIMIT 1`,
    identity.params,
    true
  )) as Array<{ id?: unknown }>;

  return existing.length > 0;
};

const updateLegacyRunningRecord = async (
  db: IDatabase,
  layout: MigrationsTableLayout,
  params: { name: string; scope: MigrationScope; service: string; batch: number }
): Promise<void> => {
  const identity = buildLegacyIdentity(layout, params.name, params.scope, params.service);
  const assignments = ['batch = ?'];
  const updateParams: unknown[] = [params.batch];

  if (layout.hasAppliedAt) {
    assignments.push('applied_at = ?');
    updateParams.push(null);
  }

  await db.execute(`UPDATE migrations SET ${assignments.join(', ')} WHERE ${identity.sql}`, [
    ...updateParams,
    ...identity.params,
  ]);
};

const buildLegacyInsertRunningPayload = (
  layout: MigrationsTableLayout,
  params: { name: string; scope: MigrationScope; service: string; batch: number }
): { columns: string[]; values: unknown[] } => {
  return {
    columns: [
      ...(layout.hasName ? ['name'] : []),
      ...(layout.hasMigration ? ['migration'] : []),
      ...(layout.hasScope ? ['scope'] : []),
      ...(layout.hasService ? ['service'] : []),
      'batch',
      ...(layout.hasStatus ? ['status'] : []),
      ...(layout.hasAppliedAt ? ['applied_at'] : []),
      ...(layout.hasCreatedAt ? ['created_at'] : []),
    ],
    values: [
      ...(layout.hasName ? [params.name] : []),
      ...(layout.hasMigration ? [params.name] : []),
      ...(layout.hasScope ? [params.scope] : []),
      ...(layout.hasService ? [params.service] : []),
      params.batch,
      ...(layout.hasStatus ? ['running'] : []),
      ...(layout.hasAppliedAt ? [null] : []),
      ...(layout.hasCreatedAt ? [nowIso()] : []),
    ],
  };
};

const insertLegacyRunningRecord = async (
  db: IDatabase,
  layout: MigrationsTableLayout,
  params: { name: string; scope: MigrationScope; service: string; batch: number }
): Promise<void> => {
  const payload = buildLegacyInsertRunningPayload(layout, params);

  await db.execute(
    `INSERT INTO migrations (${payload.columns.join(', ')}) VALUES (${payload.columns.map(() => '?').join(', ')})`,
    payload.values
  );
};

const assertDbSupportsMigrations = (db: IDatabase): void => {
  const t = db.getType();
  if (t === 'd1') {
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
    const isSqlProxyEnabled =
      Env.getBool('USE_POSTGRES_PROXY', false) ||
      Env.getBool('USE_MYSQL_PROXY', false) ||
      Env.getBool('USE_SQLSERVER_PROXY', false) ||
      Env.get('POSTGRES_PROXY_URL', '').trim() !== '' ||
      Env.get('MYSQL_PROXY_URL', '').trim() !== '' ||
      Env.get('SQLSERVER_PROXY_URL', '').trim() !== '';

    const hint = isSqlProxyEnabled
      ? 'If you are using SQL proxy adapters, ensure the proxy stack is running (e.g. `zin cp up` or `docker compose -f docker-compose.proxy.yml up -d`).'
      : undefined;

    let message = 'Migrations tracking is not supported for this database adapter yet.';
    if (hint) message = `${message} ${hint}`;
    throw ErrorFactory.createCliError(message);
  }

  return async (): Promise<void> => {
    await adapter.ensureMigrationsTable();
  };
};

export const MigrationStore = Object.freeze({
  async ensureTable(db: IDatabase): Promise<void> {
    await ensureTrackingTable(db);
  },

  async getLastCompletedBatch(
    db: IDatabase,
    scope: MigrationScope = 'global',
    service: string = ''
  ): Promise<number> {
    assertDbSupportsMigrations(db);

    const layout = await resolveTableLayout(db);
    const normalizedService = toSafeService(service);

    if (layout.requiresCompatibilityMode) {
      const rows = await getLegacyAppliedRows(db, layout, scope, normalizedService);
      let maxBatch = 0;
      for (const row of rows) {
        const batch = getLegacyBatch(row);
        if (Number.isFinite(batch) && batch > maxBatch) maxBatch = batch;
      }
      return maxBatch;
    }

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

    const layout = await resolveTableLayout(db);
    if (layout.requiresCompatibilityMode) {
      const rows = await getLegacyAppliedRows(db, layout, scope, normalizedService);
      return buildLegacyAppliedMap(rows, layout, scope, normalizedService);
    }

    const rows = await QueryBuilder.create('migrations', db)
      .select('name', 'scope', 'service', 'batch', 'status')
      .selectAs('applied_at', 'appliedAt')
      .where('scope', '=', scope)
      .andWhere('service', '=', normalizedService)
      .get<MigrationRecord>();

    return buildAppliedMap(rows);
  },

  async insertRunning(
    db: IDatabase,
    params: { name: string; scope: MigrationScope; service: string; batch: number }
  ): Promise<void> {
    assertDbSupportsMigrations(db);

    const normalizedService = toSafeService(params.service);
    const layout = await resolveTableLayout(db);

    if (layout.requiresCompatibilityMode) {
      assertCompatibleTrackingTarget(layout, params.scope, normalizedService);

      const legacyParams = {
        name: params.name,
        scope: params.scope,
        service: normalizedService,
        batch: params.batch,
      };

      if (await findLegacyMigrationRecord(db, layout, legacyParams)) {
        await updateLegacyRunningRecord(db, layout, legacyParams);
        return;
      }

      await insertLegacyRunningRecord(db, layout, legacyParams);
      return;
    }

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

    const normalizedService = toSafeService(params.service);
    const layout = await resolveTableLayout(db);
    if (layout.requiresCompatibilityMode) {
      assertCompatibleTrackingTarget(layout, params.scope, normalizedService);

      const identity = buildLegacyIdentity(layout, params.name, params.scope, normalizedService);

      if (!layout.hasStatus && params.status === 'failed') {
        await db.execute(`DELETE FROM migrations WHERE ${identity.sql}`, identity.params);
        return;
      }

      const assignments: string[] = [];
      const updateParams: unknown[] = [];

      if (layout.hasStatus) {
        assignments.push('status = ?');
        updateParams.push(params.status);
      }

      if (params.appliedAt !== undefined && layout.hasAppliedAt) {
        assignments.push('applied_at = ?');
        updateParams.push(params.appliedAt);
      }

      if (assignments.length === 0) return;

      await db.execute(`UPDATE migrations SET ${assignments.join(', ')} WHERE ${identity.sql}`, [
        ...updateParams,
        ...identity.params,
      ]);
      return;
    }

    const builder = QueryBuilder.create('migrations', db)
      .where('name', '=', params.name)
      .andWhere('scope', '=', params.scope)
      .andWhere('service', '=', normalizedService);

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

    const normalizedService = toSafeService(params.service);
    const layout = await resolveTableLayout(db);
    if (layout.requiresCompatibilityMode) {
      const rows = await getLegacyAppliedRows(db, layout, params.scope, normalizedService);
      const out: Array<{ name: string; batch: number }> = [];

      for (const row of rows) {
        const name = normalizeLegacyName(row);
        const batch = getLegacyBatch(row);
        if (name === '' || !Number.isFinite(batch) || batch < params.minBatch) continue;
        out.push({ name, batch });
      }

      out.sort((left, right) => {
        if (left.batch !== right.batch) return right.batch - left.batch;
        return right.name.localeCompare(left.name);
      });
      return out;
    }

    const rows = await QueryBuilder.create('migrations', db)
      .select('name', 'batch')
      .where('status', '=', 'completed')
      .andWhere('scope', '=', params.scope)
      .andWhere('service', '=', normalizedService)
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

    const normalizedService = toSafeService(params.service);
    const layout = await resolveTableLayout(db);
    if (layout.requiresCompatibilityMode) {
      const rows = await getLegacyAppliedRows(db, layout, params.scope, normalizedService);
      return rows
        .map(normalizeLegacyName)
        .filter((name) => name.length > 0)
        .sort((left, right) => right.localeCompare(left));
    }

    const rows = await QueryBuilder.create('migrations', db)
      .select('name')
      .where('status', '=', 'completed')
      .andWhere('scope', '=', params.scope)
      .andWhere('service', '=', normalizedService)
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

    const normalizedService = toSafeService(params.service);
    const layout = await resolveTableLayout(db);
    if (layout.requiresCompatibilityMode) {
      assertCompatibleTrackingTarget(layout, params.scope, normalizedService);

      const identity = buildLegacyIdentity(layout, params.name, params.scope, normalizedService);
      await db.execute(`DELETE FROM migrations WHERE ${identity.sql}`, identity.params);
      return;
    }

    await QueryBuilder.create('migrations', db)
      .where('name', '=', params.name)
      .andWhere('scope', '=', params.scope)
      .andWhere('service', '=', normalizedService)
      .delete();
  },
});
