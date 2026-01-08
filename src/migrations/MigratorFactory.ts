import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import * as path from '@node-singletons/path';

import { MigrationDiscovery } from '@/migrations/MigrationDiscovery';
import { MigrationLoader } from '@/migrations/MigrationLoader';
import { MigrationLock } from '@/migrations/MigrationLock';
import type {
  LoadedMigration,
  MigrationScope,
  MigratorOptions,
  MigratorStatusRow,
} from '@/migrations/types';
import { SqliteMaintenance } from '@orm/maintenance/SqliteMaintenance';
import { MigrationStore } from '@orm/migrations/MigrationStore';

function nowIso(): string {
  return new Date().toISOString();
}

type MigratorApi = {
  status(): Promise<MigratorStatusRow[]>;
  migrate(): Promise<{ applied: number; pending: number }>;
  rollbackLastBatch(steps: number): Promise<{ rolledBack: number }>;
  resetAll(): Promise<{ rolledBack: number }>;
  fresh(): Promise<{ applied: number; pending: number }>;
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

  return {
    options,
    projectRoot,
    globalDir,
    extension,
    lockFile,
    separateTracking,
    includeGlobal,
    service,
  };
}

function getTrackingScope(ctx: MigratorCtx): MigrationScope {
  if (ctx.separateTracking) {
    return ctx.service === null ? 'global' : 'service';
  }
  return 'global';
}

function getTrackingService(ctx: MigratorCtx): string {
  if (!ctx.separateTracking) return '';
  return ctx.service ?? '';
}

function getMigrationDirs(ctx: MigratorCtx): string[] {
  const dirs: string[] = [];

  if (ctx.includeGlobal) {
    dirs.push(ctx.globalDir);
  }

  if (ctx.service !== null) {
    const rel = Env.get('MIGRATIONS_SERVICE_DIR', 'database/migrations');
    const serviceDir = MigrationDiscovery.resolveDir(
      ctx.projectRoot,
      path.join('services', ctx.service, rel)
    );
    dirs.push(serviceDir);
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

function buildStatus(ctx: MigratorCtx): MigratorApi['status'] {
  return async () => {
    const db = ctx.options.db;

    await MigrationStore.ensureTable(db);
    const migrations = await discover(ctx);

    const trackingScope = getTrackingScope(ctx);
    const trackingService = getTrackingService(ctx);
    const applied = await MigrationStore.getAppliedMap(db, trackingScope, trackingService);

    return migrations.map((m) => {
      const row = applied.get(m.name);
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

      const trackingScope = getTrackingScope(ctx);
      const trackingService = getTrackingService(ctx);
      const applied = await MigrationStore.getAppliedMap(db, trackingScope, trackingService);

      const pending = migrations.filter((m) => applied.get(m.name)?.status !== 'completed');
      if (pending.length === 0) return { applied: 0, pending: 0 };

      const batch = (await MigrationStore.getLastCompletedBatch(db)) + 1;

      let appliedCount = 0;
      await runSerial(pending, async (m) => {
        await applyOneMigration({
          db,
          migration: m,
          scope: trackingScope,
          service: trackingService,
          batch,
        });
        appliedCount++;
      });

      return { applied: appliedCount, pending: pending.length - appliedCount };
    });
  };
}

function buildRollback(ctx: MigratorCtx): MigratorApi['rollbackLastBatch'] {
  return async (steps) => {
    const db = ctx.options.db;

    return withLock(ctx, async () => {
      await MigrationStore.ensureTable(db);

      const trackingScope = getTrackingScope(ctx);
      const trackingService = getTrackingService(ctx);

      const last = await MigrationStore.getLastCompletedBatch(db);
      if (last <= 0) return { rolledBack: 0 };

      const count = Math.max(1, steps);
      const targetMinBatch = Math.max(1, last - count + 1);

      const rows = await MigrationStore.listCompletedInBatchesGte(db, {
        scope: trackingScope,
        service: trackingService,
        minBatch: targetMinBatch,
      });

      const appliedNames = rows.map((r) => r.name);
      if (appliedNames.length === 0) return { rolledBack: 0 };

      const discovered = await discover(ctx);
      const migrationMap = new Map(discovered.map((m) => [m.name, m] as const));

      let rolledBack = 0;
      await runSerial(appliedNames, async (name) => {
        await rollbackOneMigration({
          db,
          name,
          migrationMap,
          scope: trackingScope,
          service: trackingService,
          errorLabel: 'rollback',
        });
        rolledBack++;
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

      const trackingScope = getTrackingScope(ctx);
      const trackingService = getTrackingService(ctx);

      const names = await MigrationStore.listAllCompletedNames(db, {
        scope: trackingScope,
        service: trackingService,
      });

      if (names.length === 0) return { rolledBack: 0 };

      const discovered = await discover(ctx);
      const migrationMap = new Map(discovered.map((m) => [m.name, m] as const));

      let rolledBack = 0;
      await runSerial(names, async (name) => {
        await rollbackOneMigration({
          db,
          name,
          migrationMap,
          scope: trackingScope,
          service: trackingService,
          errorLabel: 'reset',
        });
        rolledBack++;
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
      const trackingScope = getTrackingScope(ctx);
      const trackingService = getTrackingService(ctx);
      const applied = await MigrationStore.getAppliedMap(db, trackingScope, trackingService);

      const pending = migrations.filter((m) => applied.get(m.name)?.status !== 'completed');
      if (pending.length === 0) return { applied: 0, pending: 0 };

      const batch = (await MigrationStore.getLastCompletedBatch(db)) + 1;

      let appliedCount = 0;
      await runSerial(pending, async (m) => {
        await applyOneMigration({
          db,
          migration: m,
          scope: trackingScope,
          service: trackingService,
          batch,
        });
        appliedCount++;
      });

      return { applied: appliedCount, pending: pending.length - appliedCount };
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
