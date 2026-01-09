import { ErrorFactory } from '@exceptions/ZintrustError';
import * as fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';

import { MigrationDiscovery } from '@/migrations/MigrationDiscovery';
import { MigrationLoader } from '@/migrations/MigrationLoader';
import type { LoadedMigration } from '@/migrations/types';
import type { IDatabase } from '@orm/Database';
import type { DatabaseConfig, IDatabaseAdapter } from '@orm/DatabaseAdapter';
import { BaseAdapter } from '@orm/DatabaseAdapter';

type D1SqlMigrationsCompileOptions = {
  projectRoot: string;
  globalDir: string;
  extension: string;
  service?: string;
  includeGlobal?: boolean;
  serviceDirOverride?: string;
  outputDir: string;
};

type GeneratedSqlMigration = {
  sourceName: string;
  outputFileName: string;
  outputFilePath: string;
  statements: string[];
};

const RESOLVED_VOID: Promise<void> = Promise.resolve();

const ensureDir = (dir: string): void => {
  if (fs.existsSync(dir)) return;
  fs.mkdirSync(dir, { recursive: true });
};

const getDefaultOutputFileName = (migrationName: string, index: number): string => {
  const m = /^(\d+)_(.+)$/.exec(migrationName);
  if (m !== null) {
    return `${m[1]}_${m[2]}.sql`;
  }

  const padded = String(index).padStart(4, '0');
  return `${padded}_${migrationName}.sql`;
};

const normalizeSql = (sql: string): string => {
  const trimmed = sql.trim();
  if (trimmed === '') return '';
  return trimmed.endsWith(';') ? trimmed : `${trimmed};`;
};

const interpolateSql = (sql: string, parameters: unknown[]): string => {
  const placeholders = (sql.match(/\?/g) ?? []).length;
  if (placeholders !== parameters.length) {
    throw ErrorFactory.createValidationError(
      `Cannot compile parameterized SQL: expected ${placeholders} params but got ${parameters.length}. SQL: ${sql}`
    );
  }

  let idx = 0;
  return sql.replaceAll('?', () => {
    const value = parameters[idx];
    idx += 1;
    return BaseAdapter.sanitize(value);
  });
};

const isMutatingSql = (sql: string): boolean => {
  const s = sql.trimStart().toLowerCase();
  return (
    s.startsWith('insert') ||
    s.startsWith('update') ||
    s.startsWith('delete') ||
    s.startsWith('create') ||
    s.startsWith('drop') ||
    s.startsWith('alter') ||
    s.startsWith('replace') ||
    s.startsWith('pragma')
  );
};

const createNoopAdapter = (
  isConnected: () => boolean,
  setConnected: (v: boolean) => void
): IDatabaseAdapter | never => ({
  async connect(): Promise<void> {
    setConnected(true);
    await RESOLVED_VOID;
  },
  async disconnect(): Promise<void> {
    setConnected(false);
    await RESOLVED_VOID;
  },
  async query(): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
    await RESOLVED_VOID;
    return { rows: [], rowCount: 0 };
  },
  async queryOne(): Promise<Record<string, unknown> | null> {
    await RESOLVED_VOID;
    return null;
  },
  async ping(): Promise<void> {
    await RESOLVED_VOID;
  },
  async transaction<T>(callback: (adapter: IDatabaseAdapter) => Promise<T>): Promise<T> {
    await RESOLVED_VOID;
    return callback(this);
  },
  async rawQuery<T = unknown>(): Promise<T[]> {
    await RESOLVED_VOID;
    return [] as T[];
  },
  getType(): string {
    return 'd1';
  },
  isConnected(): boolean {
    return isConnected();
  },
  getPlaceholder(): string {
    return '?';
  },
});

const captureSql = (onSql: (sql: string) => void, sql: string, parameters: unknown[]): void => {
  const compiled = parameters.length > 0 ? interpolateSql(sql, parameters) : sql;
  if (!isMutatingSql(compiled)) return;
  const normalized = normalizeSql(compiled);
  if (normalized !== '') onSql(normalized);
};

const createCaptureDb = (onSql: (sql: string) => void): IDatabase => {
  let connected = false;
  const setConnected = (v: boolean): void => {
    connected = v;
  };

  const noopAdapter = createNoopAdapter(() => connected, setConnected);

  const db: IDatabase = {
    async connect(): Promise<void> {
      connected = true;
      await RESOLVED_VOID;
    },
    async disconnect(): Promise<void> {
      connected = false;
      await RESOLVED_VOID;
    },
    isConnected(): boolean {
      return connected;
    },
    async query(sql: string, parameters: unknown[] = []): Promise<unknown[]> {
      captureSql(onSql, sql, parameters);
      await RESOLVED_VOID;
      return [];
    },
    async queryOne(sql: string, parameters: unknown[] = []): Promise<unknown> {
      captureSql(onSql, sql, parameters);
      await RESOLVED_VOID;
      return null;
    },
    async transaction<T>(callback: (db: IDatabase) => Promise<T>): Promise<T> {
      await RESOLVED_VOID;
      return callback(db);
    },
    table(): never {
      throw ErrorFactory.createCliError(
        'D1 SQL compilation does not support QueryBuilder-based migrations yet. Use db.query(...) with explicit SQL.'
      );
    },
    onBeforeQuery(): void {
      return;
    },
    onAfterQuery(): void {
      return;
    },
    offBeforeQuery(): void {
      return;
    },
    offAfterQuery(): void {
      return;
    },
    getAdapterInstance(): IDatabaseAdapter {
      return noopAdapter;
    },
    getType(): string {
      return 'd1';
    },
    getConfig(): DatabaseConfig {
      return { driver: 'd1' };
    },
  };

  return db;
};

async function runSerial<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let chain = Promise.resolve();
  let idx = 0;
  for (const item of items) {
    const current = idx;
    chain = chain.then(async () => fn(item, current));
    idx += 1;
  }
  await chain;
}

const resolveServiceDir = (opts: D1SqlMigrationsCompileOptions): string | null => {
  const service = typeof opts.service === 'string' && opts.service.length > 0 ? opts.service : null;
  if (service === null) return null;

  const rel = opts.serviceDirOverride ?? path.join('services', service, 'database/migrations');
  return MigrationDiscovery.resolveDir(opts.projectRoot, rel);
};

const discoverMigrations = async (
  opts: D1SqlMigrationsCompileOptions
): Promise<LoadedMigration[]> => {
  const globalDir = MigrationDiscovery.resolveDir(opts.projectRoot, opts.globalDir);
  const includeGlobal = opts.includeGlobal !== false;

  const dirs: string[] = [];
  if (includeGlobal) dirs.push(globalDir);

  const serviceDir = resolveServiceDir(opts);
  if (serviceDir !== null) dirs.push(serviceDir);

  const files = dirs.flatMap((dir) => MigrationDiscovery.listMigrationFiles(dir, opts.extension));

  const loaded: LoadedMigration[] = [];
  let chain = Promise.resolve();
  for (const file of files) {
    chain = chain.then(async () => {
      loaded.push(await MigrationLoader.load(file));
    });
  }
  await chain;

  return loaded.sort((a, b) => a.name.localeCompare(b.name));
};

export const D1SqlMigrations = Object.freeze({
  async compileAndWrite(opts: D1SqlMigrationsCompileOptions): Promise<GeneratedSqlMigration[]> {
    const migrations = await discoverMigrations(opts);

    ensureDir(opts.outputDir);

    const out: GeneratedSqlMigration[] = [];

    await runSerial(migrations, async (m, idx) => {
      const statements: string[] = [];
      const db = createCaptureDb((sql) => statements.push(sql));

      await db.connect();
      try {
        await m.up(db);
      } finally {
        await db.disconnect();
      }

      const outputFileName = getDefaultOutputFileName(m.name, idx);
      const outputFilePath = path.join(opts.outputDir, outputFileName);

      const header = `-- Generated from ${m.name}\n`;
      const body = statements.length > 0 ? `${statements.join('\n')}\n` : '';
      fs.writeFileSync(outputFilePath, `${header}${body}`, 'utf8');

      out.push({
        sourceName: m.name,
        outputFileName,
        outputFilePath,
        statements,
      });
    });

    return out;
  },
});
