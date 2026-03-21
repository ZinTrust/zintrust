import {
  WranglerConfig,
  type WranglerD1DatabaseConfig,
  type WranglerD1DatabaseResolution,
  type WranglerD1ResolutionMatch,
} from '@cli/d1/WranglerConfig';
import { WranglerD1 } from '@cli/d1/WranglerD1';
import { Logger } from '@config/logger';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isNonEmptyString } from '@helper/index';
import { randomUUID } from '@node-singletons/crypto';
import fs from '@node-singletons/fs';
import * as path from '@node-singletons/path';
import { SQLiteAdapter } from '@orm/adapters/SQLiteAdapter';

const PROBE_TABLE = '__zintrust_d1_probe';

type ResolvedD1Target = {
  config: WranglerD1DatabaseConfig;
  databaseName: string;
  matchedBy: WranglerD1ResolutionMatch;
};

const describeTarget = (database: WranglerD1DatabaseConfig): string => {
  const parts: string[] = [];
  if (isNonEmptyString(database.database_name)) {
    parts.push(`database_name=${database.database_name.trim()}`);
  }
  if (isNonEmptyString(database.binding)) {
    parts.push(`binding=${database.binding.trim()}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'unnamed-d1-entry';
};

const describeTargets = (configured: WranglerD1DatabaseConfig[]): string => {
  const rendered = configured
    .map((database) => {
      return describeTarget(database);
    })
    .filter((entry) => entry.length > 0);

  return rendered.length > 0 ? rendered.join(' | ') : 'none';
};

const getSelectionHint = (
  matchedBy: 'database_name' | 'binding' | 'multiple-configured'
): string => {
  if (matchedBy === 'database_name') return 'database_name';
  if (matchedBy === 'binding') return 'binding';
  return 'configured D1 entry';
};

const createResolutionError = (
  resolution: Exclude<WranglerD1DatabaseResolution, { status: 'resolved' }>
): Error => {
  const configuredTargets = describeTargets(resolution.configured);
  const targetLabel = resolution.target ?? '';

  if (resolution.status === 'ambiguous') {
    if (resolution.matchedBy === 'multiple-configured') {
      return ErrorFactory.createConfigError(
        `Multiple D1 targets are configured in wrangler.jsonc. Specify a target by database_name or binding. Configured D1 targets: ${configuredTargets}`
      );
    }

    return ErrorFactory.createConfigError(
      `D1 target "${targetLabel}" is ambiguous by ${getSelectionHint(resolution.matchedBy)}. Matching entries: ${describeTargets(resolution.matches)}. Configured D1 targets: ${configuredTargets}`
    );
  }

  if (resolution.target === undefined) {
    return ErrorFactory.createConfigError(
      `Unable to resolve a default D1 target from wrangler.jsonc. Configured D1 targets: ${configuredTargets}`
    );
  }

  return ErrorFactory.createConfigError(
    `Unable to resolve D1 target "${targetLabel}" from wrangler.jsonc. Tried database_name first, then binding. Configured D1 targets: ${configuredTargets}`
  );
};

const resolveTarget = (projectRoot: string, target?: string): ResolvedD1Target => {
  const resolution = WranglerConfig.resolveD1Database(projectRoot, target);
  if (resolution.status !== 'resolved') {
    throw createResolutionError(resolution);
  }

  const config = resolution.config;
  const configuredDatabaseName = config?.database_name?.trim();
  const configuredBindingName = config?.binding?.trim();
  const databaseName =
    configuredDatabaseName ??
    (isNonEmptyString(configuredBindingName) ? configuredBindingName : undefined);

  if (!isNonEmptyString(databaseName)) {
    throw ErrorFactory.createConfigError(
      `Resolved D1 target is missing both database_name and binding. Configured D1 targets: ${describeTargets(WranglerConfig.getD1Databases(projectRoot))}`
    );
  }

  return { config, databaseName, matchedBy: resolution.matchedBy };
};

const getLocalStateDir = (projectRoot: string): string =>
  path.join(projectRoot, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject');

const listCandidateSqliteFiles = (projectRoot: string): string[] => {
  const candidateDir = getLocalStateDir(projectRoot);

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
    Logger.info(
      `[LocalD1Resolver] Resolved D1 target (${resolved.matchedBy}): ${describeTarget(resolved.config)}`
    );

    if (listCandidateSqliteFiles(projectRoot).length === 0) {
      Logger.info(
        `[LocalD1Resolver] Local D1 state missing, bootstrapping with Wrangler for ${resolved.databaseName}`
      );
    }

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
      `Unable to resolve actual local D1 SQLite file for target "${resolved.databaseName}" under ${getLocalStateDir(projectRoot)}. Resolved D1 target: ${describeTarget(resolved.config)}`
    );
  },
});
