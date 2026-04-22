import type { IDatabase } from '@zintrust/core';

type TraceErrorFactory = {
  createConfigError?(message: string, details?: unknown): Error;
};

type TraceErrorApi = {
  ErrorFactory?: TraceErrorFactory;
};

type TraceEnvApi = {
  get(key: string, fallback: string): string;
};

type GlobalTraceConnectionState = {
  __zintrust_system_trace_connection_name__?: string;
  __zintrust_system_trace_plugin_requested__?: boolean;
};

export const TRACE_REQUIRED_TABLES = [
  'zin_trace_entries',
  'zin_trace_entries_tags',
  'zin_trace_monitoring',
] as const;

const createFallbackTraceConfigError = (message: string, details?: unknown): Error => {
  const error = new globalThis.Error(message) as Error & {
    code?: string;
    details?: unknown;
    name?: string;
    statusCode?: number;
  };
  error.name = 'ConfigError';
  error.code = 'CONFIG_ERROR';
  error.statusCode = 500;
  error.details = details;
  return error;
};

export const createTraceConfigError = (
  coreApi: TraceErrorApi,
  message: string,
  details?: unknown
): Error => {
  if (coreApi.ErrorFactory?.createConfigError !== undefined) {
    return coreApi.ErrorFactory.createConfigError(message, details);
  }

  return createFallbackTraceConfigError(message, details);
};

export const getRuntimeTraceConnectionName = (): string | undefined => {
  const runtimeConnection = (
    globalThis as GlobalTraceConnectionState
  ).__zintrust_system_trace_connection_name__?.trim();

  return runtimeConnection === undefined || runtimeConnection === ''
    ? undefined
    : runtimeConnection;
};

export const resolveDashboardTraceConnectionName = (
  coreApi: TraceErrorApi,
  input: {
    explicitConnectionName?: string;
    configuredConnectionName?: string;
  }
): string => {
  const explicitConnection = input.explicitConnectionName?.trim();
  if (explicitConnection !== undefined && explicitConnection !== '') {
    return explicitConnection;
  }

  const runtimeConnection = getRuntimeTraceConnectionName();
  if (runtimeConnection !== undefined) {
    return runtimeConnection;
  }

  const configuredConnection = input.configuredConnectionName?.trim();
  if (configuredConnection !== undefined && configuredConnection !== '') {
    return configuredConnection;
  }

  throw createTraceConfigError(coreApi, 'Trace dashboard connection is not configured.', {
    envKey: 'TRACE_DB_CONNECTION',
    hint: 'Import @zintrust/trace/register before mounting the dashboard, pass connectionName explicitly, or set TRACE_DB_CONNECTION to the trace storage connection.',
  });
};

export const resolveTraceConnectionName = (
  env: Pick<TraceEnvApi, 'get'> | undefined,
  configuredConnection?: string
): string => {
  const resolveDefaultConnection = (): string => {
    const defaultConnection = env?.get('DB_CONNECTION', '').trim() ?? '';
    if (defaultConnection === '' || defaultConnection === 'default') return 'default';
    return defaultConnection;
  };

  const explicitConnection = configuredConnection?.trim();
  if (explicitConnection !== undefined && explicitConnection !== '') {
    return explicitConnection === 'default' ? resolveDefaultConnection() : explicitConnection;
  }

  return resolveDefaultConnection();
};

export const resolveObservedConnectionName = (
  env: Pick<TraceEnvApi, 'get'> | undefined,
  configuredObservedConnection: string | undefined,
  storageConnectionName: string
): string => {
  if (
    typeof configuredObservedConnection === 'string' &&
    configuredObservedConnection.trim() !== ''
  ) {
    return resolveTraceConnectionName(env, configuredObservedConnection);
  }

  const defaultConnectionName = resolveTraceConnectionName(env);
  if (storageConnectionName !== defaultConnectionName) {
    return defaultConnectionName;
  }

  return storageConnectionName;
};

export function assertTraceConnectionResolved(
  coreApi: TraceErrorApi,
  db: IDatabase | undefined,
  params: { connectionName: string; envKey: 'TRACE_DB_CONNECTION' | 'TRACE_QUERY_CONNECTION' }
): asserts db is IDatabase {
  if (db !== undefined) {
    return;
  }

  const pluginRequested =
    (globalThis as GlobalTraceConnectionState).__zintrust_system_trace_plugin_requested__ === true;
  let hint =
    'Configure TRACE_QUERY_CONNECTION, or ensure DB_CONNECTION resolves to an existing database connection.';

  if (params.envKey === 'TRACE_DB_CONNECTION') {
    hint = pluginRequested
      ? 'Configure TRACE_DB_CONNECTION to an existing database connection before enabling TRACE_ENABLED.'
      : 'If this module is being imported from zintrust.plugins.*, switch that import to @zintrust/trace/plugin so trace registration runs after database runtime registration. Otherwise configure TRACE_DB_CONNECTION to an existing database connection before enabling TRACE_ENABLED.';
  }

  throw createTraceConfigError(
    coreApi,
    `Trace connection "${params.connectionName}" could not be resolved.`,
    {
      connectionName: params.connectionName,
      envKey: params.envKey,
      hint,
    }
  );
}

export const assertTraceStorageReady = async (
  coreApi: TraceErrorApi,
  db: IDatabase,
  connectionName: string,
  operation = 'Trace storage connection'
): Promise<void> => {
  try {
    await Promise.all(
      TRACE_REQUIRED_TABLES.map(async (table) => {
        await db.queryOne(`SELECT 1 AS ok FROM ${table} LIMIT 1`, []);
      })
    );
  } catch (error) {
    throw createTraceConfigError(
      coreApi,
      `${operation} "${connectionName}" is not ready. Create the database if needed and run \`zin migrate:trace\` before enabling TRACE_ENABLED.`,
      {
        connectionName,
        error,
        requiredTables: [...TRACE_REQUIRED_TABLES],
      }
    );
  }
};
