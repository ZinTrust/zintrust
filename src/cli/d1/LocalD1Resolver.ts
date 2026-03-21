import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { WranglerConfig, type WranglerD1DatabaseConfig } from '@cli/d1/WranglerConfig';
import { WranglerD1 } from '@cli/d1/WranglerD1';
import { isNonEmptyString } from '@helper/index';
import { randomUUID } from '@node-singletons/crypto';
import fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { SQLiteAdapter } from '@orm/adapters/SQLiteAdapter';

const PROBE_TABLE = '__zintrust_d1_probe';

type ResolvedD1Target = {
  config: WranglerD1DatabaseConfig;
  databaseName: string;
};

const describeConfiguredTargets = (projectRoot: string): string => {
  const configured = WranglerConfig.getD1Databases(projectRoot)
    .map((database) => {
      const parts: string[] = [];
      if (isNonEmptyString(database.database_name)) {
        parts.push(`database_name=${database.database_name.trim()}`);
      }
      if (isNonEmptyString(database.binding)) {
        parts.push(`binding=${database.binding.trim()}`);
      }
      return parts.length > 0 ? parts.join(', ') : 'unnamed-d1-entry';
    })
    .filter((entry) => entry.length > 0);

  return configured.length > 0 ? configured.join(' | ') : 'none';
};

const resolveTarget = (projectRoot: string, target?: string): ResolvedD1Target => {
  const config = WranglerConfig.getD1Database(projectRoot, target);
  const configuredDatabaseName = config?.database_name?.trim();
  const configuredBindingName = config?.binding?.trim();
  const databaseName =
    configuredDatabaseName ??
    (isNonEmptyString(configuredBindingName) ? configuredBindingName : undefined);

  if (config === undefined || !isNonEmptyString(databaseName)) {
    throw ErrorFactory.createConfigError(
      `Unable to resolve D1 target "${target ?? ''}" from wrangler.jsonc. Configured D1 targets: ${describeConfiguredTargets(projectRoot)}`
    );
  }

  return { config, databaseName };
};

const listCandidateSqliteFiles = (projectRoot: string): string[] => {
  const candidateDir = path.join(
    projectRoot,
    '.wrangler',
    'state',
    'v3',
    'd1',
    'miniflare-D1DatabaseObject'
  );

  if (!fs.existsSync(candidateDir)) return [];

  return fs
    .readdirSync(candidateDir)
    .filter((entry) => entry.endsWith('.sqlite'))
    .map((entry) => path.join(candidateDir, entry));
};

const sqliteContainsProbe = async (sqlitePath: string, token: string): Promise<boolean> => {
  const adapter = SQLiteAdapter.create({ driver: 'sqlite', database: sqlitePath });

  try {
    await adapter.connect();

    const tableCheck = await adapter.query(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${PROBE_TABLE}' LIMIT 1`,
      []
    );
    if (tableCheck.rows.length === 0) return false;

    const probeCheck = await adapter.query(
      `SELECT token FROM ${PROBE_TABLE} WHERE token = ? LIMIT 1`,
      [token]
    );

    return probeCheck.rows.length > 0;
  } catch {
    return false;
  } finally {
    await adapter.disconnect();
  }
};

export const LocalD1Resolver = Object.freeze({
  resolveD1Binding(projectRoot: string, target?: string): ResolvedD1Target {
    return resolveTarget(projectRoot, target);
  },

  ensureLocalD1Ready(projectRoot: string, target?: string): ResolvedD1Target {
    const resolved = resolveTarget(projectRoot, target);
    WranglerD1.executeSql({
      dbName: resolved.databaseName,
      isLocal: true,
      sql: 'SELECT 1',
    });
    return resolved;
  },

  async resolveLocalD1SqlitePath(projectRoot: string, target?: string): Promise<string> {
    const resolved = LocalD1Resolver.ensureLocalD1Ready(projectRoot, target);
    const probeToken = `zintrust-probe-${randomUUID()}`;

    WranglerD1.executeSql({
      dbName: resolved.databaseName,
      isLocal: true,
      sql: `CREATE TABLE IF NOT EXISTS ${PROBE_TABLE} (token TEXT PRIMARY KEY); INSERT OR REPLACE INTO ${PROBE_TABLE} (token) VALUES ('${probeToken}');`,
    });

    try {
      const candidates = listCandidateSqliteFiles(projectRoot);

      for (const candidate of candidates) {
        // eslint-disable-next-line no-await-in-loop
        if (await sqliteContainsProbe(candidate, probeToken)) {
          Logger.info(`[LocalD1Resolver] Resolved Wrangler local D1 SQLite path: ${candidate}`);
          return candidate;
        }
      }
    } finally {
      try {
        WranglerD1.executeSql({
          dbName: resolved.databaseName,
          isLocal: true,
          sql: `DELETE FROM ${PROBE_TABLE} WHERE token = '${probeToken}';`,
        });
      } catch (error) {
        Logger.warn(`[LocalD1Resolver] Failed to remove D1 probe token: ${String(error)}`);
      }
    }

    throw ErrorFactory.createConfigError(
      `Unable to resolve actual local D1 SQLite file for target "${resolved.databaseName}" under .wrangler/state/v3/d1/miniflare-D1DatabaseObject`
    );
  },
});
