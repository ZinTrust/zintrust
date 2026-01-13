import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as path from '@node-singletons/path';

import { MigrationDiscovery } from '@/migrations/MigrationDiscovery';
import { MigrationLoader } from '@/migrations/MigrationLoader';
import { MigrationLock } from '@/migrations/MigrationLock';
import type {
  LoadedMigration,
  MigrationRecord,
  MigrationScope,
  MigratorOptions,
  MigratorStatusRow,
} from '@/migrations/types';
import { SqliteMaintenance } from '@orm/maintenance/SqliteMaintenance';
import { MigrationStore } from '@orm/migrations/MigrationStore';

function nowIso(): string {
  // MySQL/MariaDB DATETIME does not accept ISO8601 with timezone (e.g. trailing 'Z').
  // Use a portable UTC datetime string.
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

type MigratorApi = {
  status(): Promise<MigratorStatusRow[]>;
  migrate(): Promise<{ applied: number; pending: number; appliedNames: string[] }>;
  rollbackLastBatch(steps: number): Promise<{ rolledBack: number }>;
  resetAll(): Promise<{ rolledBack: number }>;
  fresh(): Promise<{ applied: number; pending: number; appliedNames: string[] }>;
};

type MigratorCtx = {
  options: MigratorOptions;
  projectRoot: string;
  globalDir: string;
  extension: string;
  lockFile: string;
  separateTracking: boolean;
  includeGlobal: boolean;
  service: string | null;
  serviceDir: string | null;
};

function createCtx(options: MigratorOptions): MigratorCtx {
  const projectRoot = options.projectRoot;
  const globalDir = MigrationDiscovery.resolveDir(projectRoot, options.globalDir);
  const extension = options.extension;
  const service =
    typeof options.service === 'string' && options.service.length > 0 ? options.service : null;

  const separateTracking = options.separateTracking === true;
  const includeGlobal = options.includeGlobal !== false;
  const lockFile = options.lockFile ?? path.join(projectRoot, '.zintrust', 'migrate.lock');

  const serviceDir =
    service === null
      ? null
      : MigrationDiscovery.resolveDir(
          projectRoot,
          path.join('services', service, Env.get('MIGRATIONS_SERVICE_DIR', 'database/migrations'))
        );

  return {
    options,
    projectRoot,
    globalDir,
    extension,
    lockFile,
    separateTracking,
    includeGlobal,
    service,
    serviceDir,
  };
}

type TrackingTarget = { scope: MigrationScope; service: string };

function keyForTarget(t: TrackingTarget): string {
  return `${t.scope}:${t.service}`;
}

function getTargets(ctx: MigratorCtx): TrackingTarget[] {
  if (!ctx.separateTracking) return [{ scope: 'global', service: '' }];

  if (ctx.service === null) {
    return [{ scope: 'global', service: '' }];
  }

  const targets: TrackingTarget[] = [];
  // Prefer rolling back service migrations before global ones.
  targets.push({ scope: 'service', service: ctx.service });
  if (ctx.includeGlobal) targets.push({ scope: 'global', service: '' });
  return targets;
}

function getTargetForMigration(ctx: MigratorCtx, migration: LoadedMigration): TrackingTarget {
  if (!ctx.separateTracking) return { scope: 'global', service: '' };
  if (ctx.service === null) return { scope: 'global', service: '' };

  const serviceDir = ctx.serviceDir;
  if (serviceDir !== null) {
    const prefix = serviceDir.endsWith(path.sep) ? serviceDir : `${serviceDir}${path.sep}`;
    if (migration.filePath.startsWith(prefix)) {
      return { scope: 'service', service: ctx.service };
    }
  }

  return { scope: 'global', service: '' };
}

function getMigrationDirs(ctx: MigratorCtx): string[] {
  const dirs: string[] = [];

  if (ctx.includeGlobal) {
    dirs.push(ctx.globalDir);
  }

  if (ctx.serviceDir !== null) {
    dirs.push(ctx.serviceDir);
  }

  return dirs;
}

async function discover(ctx: MigratorCtx): Promise<LoadedMigration[]> {
  const files = getMigrationDirs(ctx).flatMap((dir) =>
    MigrationDiscovery.listMigrationFiles(dir, ctx.extension)
  );

  const loaded: LoadedMigration[] = [];

  // Build a serial chain to keep ordering without `await` inside a loop.
  let chain = Promise.resolve();
  for (const file of files) {
    chain = chain.then(async () => {
      loaded.push(await MigrationLoader.load(file));
    });
  }
  await chain;

  return loaded.sort((a, b) => a.name.localeCompare(b.name));
}

async function runSerial<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  let chain = Promise.resolve();
  for (const item of items) {
    chain = chain.then(async () => fn(item));
  }
  await chain;
}

async function withLock<T>(ctx: MigratorCtx, fn: () => Promise<T>): Promise<T> {
  const release = MigrationLock.acquire(ctx.lockFile);
  try {
    return await fn();
  } finally {
    release();
  }
}

async function applyOneMigration(params: {
  db: MigratorOptions['db'];
  migration: LoadedMigration;
  scope: MigrationScope;
  service: string;
  batch: number;
}): Promise<void> {
  const { db, migration, scope, service, batch } = params;

  await MigrationStore.insertRunning(db, {
    name: migration.name,
    scope,
    service,
    batch,
  });

  try {
    await db.transaction(async () => {
      await migration.up(db);
      await MigrationStore.markStatus(db, {
        name: migration.name,
        scope,
        service,
        status: 'completed',
        appliedAt: nowIso(),
      });
    });
  } catch (error) {
    await MigrationStore.markStatus(db, {
      name: migration.name,
      scope,
      service,
      status: 'failed',
    });
    Logger.error('Migration failed', { migration: migration.name, error });
    throw error;
  }
}

async function rollbackOneMigration(params: {
  db: MigratorOptions['db'];
  name: string;
  migrationMap: Map<string, LoadedMigration>;
  scope: MigrationScope;
  service: string;
  errorLabel: 'rollback' | 'reset';
}): Promise<void> {
  const { db, name, migrationMap, scope, service, errorLabel } = params;

  const m = migrationMap.get(name);
  if (m === undefined) {
    const label = errorLabel === 'rollback' ? 'rollback' : 'reset';
    throw ErrorFactory.createCliError(
      `Cannot ${label} '${name}' because its migration file is missing.`
    );
  }

  await db.transaction(async () => {
    await m.down(db);
    await MigrationStore.deleteRecord(db, { name, scope, service });
  });
}

async function rollbackTargetBatch(params: {
  db: MigratorOptions['db'];
  target: TrackingTarget;
  migrationMap: Map<string, LoadedMigration>;
  count: number;
}): Promise<number> {
  const { db, target, migrationMap, count } = params;
  const last = await MigrationStore.getLastCompletedBatch(db, target.scope, target.service);
  if (last <= 0) return 0;

  const targetMinBatch = Math.max(1, last - count + 1);
  const rows = await MigrationStore.listCompletedInBatchesGte(db, {
    scope: target.scope,
    service: target.service,
    minBatch: targetMinBatch,
  });

  const appliedNames = rows.map((r) => r.name);
  if (appliedNames.length === 0) return 0;

  let rolledBack = 0;
  await runSerial(appliedNames, async (name) => {
    await rollbackOneMigration({
      db,
      name,
      migrationMap,
      scope: target.scope,
      service: target.service,
      errorLabel: 'rollback',
    });
    rolledBack++;
  });
  return rolledBack;
}

async function resetTarget(params: {
  db: MigratorOptions['db'];
  target: TrackingTarget;
  migrationMap: Map<string, LoadedMigration>;
}): Promise<number> {
  const { db, target, migrationMap } = params;
  const names = await MigrationStore.listAllCompletedNames(db, {
    scope: target.scope,
    service: target.service,
  });
  if (names.length === 0) return 0;

  let rolledBack = 0;
  await runSerial(names, async (name) => {
    await rollbackOneMigration({
      db,
      name,
      migrationMap,
      scope: target.scope,
      service: target.service,
      errorLabel: 'reset',
    });
    rolledBack++;
  });
  return rolledBack;
}

async function applyPendingMigrations(
  ctx: MigratorCtx,
  db: MigratorOptions['db'],
  migrations: LoadedMigration[]
): Promise<{ applied: number; pending: number; appliedNames: string[] }> {
  const targets = getTargets(ctx);
  const appliedByTarget = new Map<string, Map<string, MigrationRecord>>();
  const batchByTarget = new Map<string, number>();

  await Promise.all(
    targets.map(async (t) => {
      const key = keyForTarget(t);
      appliedByTarget.set(key, await MigrationStore.getAppliedMap(db, t.scope, t.service));
      batchByTarget.set(
        key,
        (await MigrationStore.getLastCompletedBatch(db, t.scope, t.service)) + 1
      );
    })
  );

  const pending = migrations.filter((m) => {
    const target = getTargetForMigration(ctx, m);
    const appliedMap = appliedByTarget.get(keyForTarget(target));
    const row = appliedMap?.get(m.name);

    if (row?.status === 'completed') return false;

    // Check for collision with existing migrations (same identifying suffix)
    // This allows multiple projects to share a DB without re-running shared migrations
    // Use \d+ to support variable timestamp length (default 14, but robust to 15+)
    const match = new RegExp(/^(\d{14,})(_.+)$/).exec(m.name);
    if (match && appliedMap) {
      const suffix = match[2];
      for (const appliedName of appliedMap.keys()) {
        if (appliedName !== m.name && appliedName.endsWith(suffix)) {
          Logger.info(
            `Skipping migration '${m.name}' — migration '${appliedName}' with the same suffix ('${suffix}') has already been applied`
          );
          return false;
        }
      }
    }

    return true;
  });
  if (pending.length === 0) return { applied: 0, pending: 0, appliedNames: [] };

  let appliedCount = 0;
  const appliedNames: string[] = [];
  await runSerial(pending, async (m) => {
    const target = getTargetForMigration(ctx, m);
    const batch = batchByTarget.get(keyForTarget(target)) ?? 1;
    await applyOneMigration({
      db,
      migration: m,
      scope: target.scope,
      service: target.service,
      batch,
    });
    appliedCount++;
    appliedNames.push(m.name);
  });

  return { applied: appliedCount, pending: pending.length - appliedCount, appliedNames };
}

function buildStatus(ctx: MigratorCtx): MigratorApi['status'] {
  return async () => {
    const db = ctx.options.db;

    await MigrationStore.ensureTable(db);
    const migrations = await discover(ctx);

    const targets = getTargets(ctx);
    const appliedByTarget = new Map<string, Map<string, MigrationRecord>>();
    await Promise.all(
      targets.map(async (t) => {
        appliedByTarget.set(
          keyForTarget(t),
          await MigrationStore.getAppliedMap(db, t.scope, t.service)
        );
      })
    );

    return migrations.map((m) => {
      const target = getTargetForMigration(ctx, m);
      const row = appliedByTarget.get(keyForTarget(target))?.get(m.name);
      return {
        name: m.name,
        applied: row?.status === 'completed',
        batch: typeof row?.batch === 'number' ? row.batch : null,
        status: typeof row?.status === 'string' ? row.status : null,
        appliedAt: typeof row?.appliedAt === 'string' ? row.appliedAt : null,
      };
    });
  };
}

function buildMigrate(ctx: MigratorCtx): MigratorApi['migrate'] {
  return async () => {
    const db = ctx.options.db;

    return withLock(ctx, async () => {
      await MigrationStore.ensureTable(db);

      const migrations = await discover(ctx);

      return applyPendingMigrations(ctx, db, migrations);
    });
  };
}

function buildRollback(ctx: MigratorCtx): MigratorApi['rollbackLastBatch'] {
  return async (steps) => {
    const db = ctx.options.db;

    return withLock(ctx, async () => {
      await MigrationStore.ensureTable(db);

      const targets = getTargets(ctx);
      const count = Math.max(1, steps);

      const discovered = await discover(ctx);
      const migrationMap = new Map(discovered.map((m) => [m.name, m] as const));

      let rolledBack = 0;
      await runSerial(targets, async (target) => {
        rolledBack += await rollbackTargetBatch({ db, target, migrationMap, count });
      });

      return { rolledBack };
    });
  };
}

function buildReset(ctx: MigratorCtx): MigratorApi['resetAll'] {
  return async () => {
    const db = ctx.options.db;

    return withLock(ctx, async () => {
      await MigrationStore.ensureTable(db);

      const targets = getTargets(ctx);
      const discovered = await discover(ctx);
      const migrationMap = new Map(discovered.map((m) => [m.name, m] as const));

      let rolledBack = 0;
      await runSerial(targets, async (target) => {
        rolledBack += await resetTarget({ db, target, migrationMap });
      });

      return { rolledBack };
    });
  };
}

function buildFresh(ctx: MigratorCtx): MigratorApi['fresh'] {
  return async () => {
    const db = ctx.options.db;

    return withLock(ctx, async () => {
      if (db.getType() === 'sqlite') {
        await SqliteMaintenance.dropAllTables(db);
      }

      await MigrationStore.ensureTable(db);

      const migrations = await discover(ctx);

      return applyPendingMigrations(ctx, db, migrations);
    });
  };
}

export const MigratorFactory = Object.freeze({
  create(options: MigratorOptions): MigratorApi {
    const ctx = createCtx(options);

    return {
      status: buildStatus(ctx),
      migrate: buildMigrate(ctx),
      rollbackLastBatch: buildRollback(ctx),
      resetAll: buildReset(ctx),
      fresh: buildFresh(ctx),
    };
  },
});
