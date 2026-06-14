import { Env } from '@config/env';
import { Logger } from '@config/logger';
import { queueConfig } from '@config/queue';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { isNonEmptyString, isObject } from '@helper/index';

type IssueSeverity = 'error' | 'warn' | 'info';

export type WorkerStartupIssue = Readonly<{
  severity: IssueSeverity;
  message: string;
  envKeys: ReadonlyArray<string>;
}>;

export type WorkerStartupEnvStatus = Readonly<{
  key: string;
  present: boolean;
  resolvedValue: string;
  explicitValue: string;
}>;

export type WorkerStartupDiagnosticsReport = Readonly<{
  flags: Readonly<{
    runtimeMode: string;
    workerEnabled: boolean;
    workerAutoStart: boolean;
    dockerWorker: boolean;
    queueEnabled: boolean;
    queueDriver: string;
    persistenceDriver: string;
  }>;
  issues: ReadonlyArray<WorkerStartupIssue>;
  missingEnvKeys: ReadonlyArray<string>;
  envStatus: ReadonlyArray<WorkerStartupEnvStatus>;
  firstFault: Readonly<{
    message: string;
    code?: string;
  }> | null;
  logPointers: ReadonlyArray<string>;
  nextSteps: ReadonlyArray<string>;
}>;

const SECRET_KEY_PATTERN = /(SECRET|PASSWORD|TOKEN|KEY)$/i;

const uniqueStrings = (values: ReadonlyArray<string>): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!isNonEmptyString(normalized)) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
};

const getSnapshotValue = (snapshot: Record<string, string>, key: string): string => {
  const value = snapshot[key];
  return typeof value === 'string' ? value.trim() : '';
};

const getExplicitEnv = (snapshot: Record<string, string>, key: string): string =>
  getSnapshotValue(snapshot, key);

const getResolvedEnv = (key: string): string => Env.get(key, '').trim();

const resolveRedisProxyKeyId = (snapshot: Record<string, string>): string => {
  const explicit = getExplicitEnv(snapshot, 'REDIS_PROXY_KEY_ID');
  if (isNonEmptyString(explicit)) return explicit;

  const appName = getExplicitEnv(snapshot, 'APP_NAME') || Env.get('APP_NAME', 'zintrust').trim();
  return (appName || 'zintrust').trim().toLowerCase().replaceAll(/\s+/g, '_');
};

const resolveRedisProxySecret = (snapshot: Record<string, string>): string => {
  const explicit = getExplicitEnv(snapshot, 'REDIS_PROXY_SECRET');
  if (isNonEmptyString(explicit)) return explicit;

  return getExplicitEnv(snapshot, 'APP_KEY') || Env.get('APP_KEY', '').trim();
};

const resolveRedisProxyUrl = (snapshot: Record<string, string>): string => {
  const explicit = getExplicitEnv(snapshot, 'REDIS_PROXY_URL');
  if (isNonEmptyString(explicit)) return explicit;

  if (!Env.getBool('USE_REDIS_PROXY', false)) return '';

  const host =
    getExplicitEnv(snapshot, 'REDIS_PROXY_HOST') || Env.get('REDIS_PROXY_HOST', '127.0.0.1').trim();
  const port =
    getExplicitEnv(snapshot, 'REDIS_PROXY_PORT') || Env.get('REDIS_PROXY_PORT', '8791').trim();
  return host === '' || port === '' ? '' : `http://${host}:${port}`;
};

type DiagnosticValueResolver = (
  snapshot: Record<string, string>,
  flags: WorkerStartupDiagnosticsReport['flags']
) => string;

const DIAGNOSTIC_VALUE_RESOLVERS: Readonly<Record<string, DiagnosticValueResolver>> = Object.freeze(
  {
    RUNTIME_MODE: (_snapshot, flags) => flags.runtimeMode,
    WORKER_ENABLED: (_snapshot, flags) => String(flags.workerEnabled),
    WORKER_AUTO_START: (_snapshot, flags) => String(flags.workerAutoStart),
    DOCKER_WORKER: (_snapshot, flags) => String(flags.dockerWorker),
    QUEUE_ENABLED: (_snapshot, flags) => String(flags.queueEnabled),
    QUEUE_DRIVER: (_snapshot, flags) => flags.queueDriver,
    WORKER_PERSISTENCE_DRIVER: (_snapshot, flags) => flags.persistenceDriver,
    REDIS_PROXY_URL: (snapshot) => resolveRedisProxyUrl(snapshot),
    REDIS_PROXY_HOST: (snapshot) =>
      getExplicitEnv(snapshot, 'REDIS_PROXY_HOST') ||
      Env.get('REDIS_PROXY_HOST', '127.0.0.1').trim(),
    REDIS_PROXY_SECRET: (snapshot) => resolveRedisProxySecret(snapshot),
    REDIS_PROXY_KEY_ID: (snapshot) => resolveRedisProxyKeyId(snapshot),
    REDIS_QUEUE_DB: (snapshot) =>
      getExplicitEnv(snapshot, 'REDIS_QUEUE_DB') || Env.get('REDIS_QUEUE_DB', '1').trim(),
    WORKER_PERSISTENCE_DB_CONNECTION: (snapshot) =>
      getExplicitEnv(snapshot, 'WORKER_PERSISTENCE_DB_CONNECTION') ||
      Env.get('WORKER_PERSISTENCE_DB_CONNECTION', 'default').trim(),
    WORKER_PERSISTENCE_TABLE: (snapshot) =>
      getExplicitEnv(snapshot, 'WORKER_PERSISTENCE_TABLE') ||
      Env.get('WORKER_PERSISTENCE_TABLE', 'zintrust_workers').trim(),
    DB_CONNECTION: (snapshot) =>
      getExplicitEnv(snapshot, 'DB_CONNECTION') || Env.get('DB_CONNECTION', '').trim(),
  }
);

const getDiagnosticResolvedValue = (
  snapshot: Record<string, string>,
  key: string,
  flags: WorkerStartupDiagnosticsReport['flags']
): string => DIAGNOSTIC_VALUE_RESOLVERS[key]?.(snapshot, flags) ?? getResolvedEnv(key);

const maskResolvedValue = (key: string, value: string): string => {
  if (!isNonEmptyString(value)) return '[missing]';
  if (SECRET_KEY_PATTERN.test(key)) return '[set]';
  return value;
};

const getQueueDriver = (): { value: string; issue?: WorkerStartupIssue } => {
  try {
    return { value: queueConfig.default };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      value: Env.get('QUEUE_DRIVER', 'sync').trim() || 'sync',
      issue: {
        severity: 'error',
        message: `Queue config failed to resolve: ${message}`,
        envKeys: extractEnvKeysFromMessage(message),
      },
    };
  }
};

const getPersistenceDriver = (): string => {
  const raw = Env.get('WORKER_PERSISTENCE_DRIVER', '').trim().toLowerCase();
  return raw === '' ? 'memory (implicit)' : raw;
};

const extractEnvKeysFromMessage = (message: string): string[] => {
  const matches = message.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [];
  return uniqueStrings(matches);
};

const inferEnvKeysFromContext = (
  message: string,
  flags: WorkerStartupDiagnosticsReport['flags']
): string[] => {
  const lower = message.toLowerCase();
  const inferred: string[] = [];

  if (lower.includes('redis') && lower.includes('host is required')) {
    inferred.push('REDIS_HOST');
  }

  if (lower.includes('worker persistence') && lower.includes('database client')) {
    inferred.push('WORKER_PERSISTENCE_DB_CONNECTION', 'DB_CONNECTION');
  }

  if (lower.includes('worker persistence') && lower.includes('redis config')) {
    inferred.push('REDIS_HOST', 'REDIS_PORT');
  }

  if (flags.queueDriver === 'sqs') {
    inferred.push('AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_SQS_QUEUE_URL');
  }

  return uniqueStrings(inferred);
};

const getFirstFault = (
  error: unknown,
  flags: WorkerStartupDiagnosticsReport['flags']
): WorkerStartupDiagnosticsReport['firstFault'] => {
  if (!(error instanceof Error)) return null;

  const errorCode =
    isObject(error) && typeof error['code'] === 'string' ? error['code'] : undefined;
  const envKeys = uniqueStrings([
    ...extractEnvKeysFromMessage(error.message),
    ...inferEnvKeysFromContext(error.message, flags),
  ]);

  return {
    message:
      envKeys.length > 0
        ? `${error.message} | likely env keys: ${envKeys.join(', ')}`
        : error.message,
    code: errorCode,
  };
};

const getQueueDriverEnvKeys = (snapshot: Record<string, string>, queueDriver: string): string[] => {
  if (queueDriver === 'sqs') {
    return ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_SQS_QUEUE_URL'];
  }

  if (queueDriver === 'database') {
    return ['QUEUE_DB_CONNECTION', 'DB_CONNECTION'];
  }

  if (queueDriver === 'rabbitmq') {
    return ['RABBITMQ_HOST', 'RABBITMQ_PORT', 'RABBITMQ_USER', 'RABBITMQ_PASSWORD'];
  }

  const usesRedisProxy =
    Env.getBool('USE_REDIS_PROXY', false) &&
    (isNonEmptyString(getExplicitEnv(snapshot, 'REDIS_RPC_URL')) ||
      isNonEmptyString(getExplicitEnv(snapshot, 'REDIS_PROXY_URL')));

  if (queueDriver === 'redis' && usesRedisProxy) {
    return [
      'REDIS_RPC_URL',
      'REDIS_PROXY_URL',
      'REDIS_PROXY_HOST',
      'REDIS_PROXY_SECRET',
      'REDIS_PROXY_KEY_ID',
      'APP_KEY',
      'REDIS_QUEUE_DB',
    ];
  }

  if (queueDriver === 'redis') {
    return ['REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD', 'REDIS_QUEUE_DB'];
  }

  return [];
};

const getPersistenceEnvKeys = (persistenceDriver: string): string[] => {
  if (persistenceDriver === 'database' || persistenceDriver === 'db') {
    return ['WORKER_PERSISTENCE_DB_CONNECTION', 'WORKER_PERSISTENCE_TABLE', 'DB_CONNECTION'];
  }

  if (persistenceDriver === 'redis') {
    return ['WORKER_PERSISTENCE_REDIS_DB', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD'];
  }

  return [];
};

const buildFlags = (): WorkerStartupDiagnosticsReport['flags'] => {
  const queueDriver = getQueueDriver();

  return {
    runtimeMode: Env.get('RUNTIME_MODE', 'node-server').trim() || 'node-server',
    workerEnabled: Env.getBool('WORKER_ENABLED', false),
    workerAutoStart: Env.getBool('WORKER_AUTO_START', false),
    dockerWorker: Env.getBool('DOCKER_WORKER', false),
    queueEnabled: Env.getBool('QUEUE_ENABLED', false),
    queueDriver: queueDriver.value,
    persistenceDriver: getPersistenceDriver(),
  };
};

const buildEnvStatus = (
  snapshot: Record<string, string>,
  flags: WorkerStartupDiagnosticsReport['flags'],
  firstFault: WorkerStartupDiagnosticsReport['firstFault']
): WorkerStartupEnvStatus[] => {
  const relevantKeys = uniqueStrings([
    'RUNTIME_MODE',
    'WORKER_ENABLED',
    'WORKER_AUTO_START',
    'DOCKER_WORKER',
    'QUEUE_ENABLED',
    'QUEUE_DRIVER',
    'WORKER_PERSISTENCE_DRIVER',
    ...getQueueDriverEnvKeys(snapshot, flags.queueDriver),
    ...getPersistenceEnvKeys(flags.persistenceDriver),
    ...(firstFault ? extractEnvKeysFromMessage(firstFault.message) : []),
  ]);

  return relevantKeys.map((key) => {
    const explicitValue = getExplicitEnv(snapshot, key);
    const effectiveValue = getDiagnosticResolvedValue(snapshot, key, flags);
    return {
      key,
      present: isNonEmptyString(explicitValue) || isNonEmptyString(effectiveValue),
      explicitValue,
      resolvedValue: maskResolvedValue(key, effectiveValue),
    };
  });
};

const buildIssues = (
  envStatus: ReadonlyArray<WorkerStartupEnvStatus>,
  flags: WorkerStartupDiagnosticsReport['flags'],
  firstFault: WorkerStartupDiagnosticsReport['firstFault'],
  queueIssue?: WorkerStartupIssue
): WorkerStartupIssue[] => {
  const issues: WorkerStartupIssue[] = [];

  if (queueIssue !== undefined) {
    issues.push(queueIssue);
  }

  if (!flags.workerEnabled) {
    issues.push({
      severity: flags.dockerWorker ? 'error' : 'warn',
      message: 'WORKER_ENABLED is false, so the worker runtime will not process jobs.',
      envKeys: ['WORKER_ENABLED'],
    });
  }

  if (!flags.queueEnabled) {
    issues.push({
      severity: 'warn',
      message: 'QUEUE_ENABLED is false, so queue-backed workers cannot process jobs.',
      envKeys: ['QUEUE_ENABLED'],
    });
  }

  if (flags.workerEnabled && !flags.workerAutoStart) {
    issues.push({
      severity: 'warn',
      message: 'WORKER_AUTO_START is false, so worker:start-all will skip auto-start.',
      envKeys: ['WORKER_AUTO_START'],
    });
  }

  const missingEnvKeys = envStatus.filter((entry) => !entry.present).map((entry) => entry.key);

  if (flags.queueDriver === 'sqs') {
    const sqsMissing = missingEnvKeys.filter((key) =>
      ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_SQS_QUEUE_URL'].includes(
        key
      )
    );
    if (sqsMissing.length > 0) {
      issues.push({
        severity: 'error',
        message: 'SQS queue driver is selected but required AWS queue env keys are missing.',
        envKeys: sqsMissing,
      });
    }
  }

  if (firstFault !== null) {
    const firstFaultKeys = uniqueStrings([
      ...extractEnvKeysFromMessage(firstFault.message),
      ...inferEnvKeysFromContext(firstFault.message, flags),
    ]);

    if (firstFaultKeys.length > 0) {
      issues.push({
        severity: 'error',
        message: 'The first failure points to missing or invalid runtime env configuration.',
        envKeys: firstFaultKeys,
      });
    }
  }

  return issues;
};

const buildLogPointers = (flags: WorkerStartupDiagnosticsReport['flags']): string[] =>
  flags.runtimeMode === 'containers'
    ? [
        'worker:start-all stderr/stdout',
        'zin docker --wrangler-config wrangler.containers-proxy.jsonc --env <env> output',
        'worker container logs for the node dist/bin/zin.js worker:start-all process',
      ]
    : ['worker:start-all stderr/stdout'];

const buildNextSteps = (flags: WorkerStartupDiagnosticsReport['flags']): string[] =>
  flags.runtimeMode === 'containers'
    ? [
        'zin worker:doctor --json',
        'node dist/bin/zin.js worker:start-all',
        'node scripts/docker-image-smoke.mjs worker --skip-build --image <image>',
      ]
    : ['zin worker:doctor --json'];

const collect = (error?: unknown): WorkerStartupDiagnosticsReport => {
  const snapshot = Env.snapshot();
  const queueDriver = getQueueDriver();
  const flags = buildFlags();
  const firstFault = getFirstFault(error, flags);
  const envStatus = buildEnvStatus(snapshot, flags, firstFault);
  const issues = buildIssues(envStatus, flags, firstFault, queueDriver.issue);
  const missingFromIssues = issues.flatMap((issue) => issue.envKeys);
  const missingEnvKeys = uniqueStrings(missingFromIssues);

  return {
    flags,
    issues,
    missingEnvKeys,
    envStatus,
    firstFault,
    logPointers: buildLogPointers(flags),
    nextSteps: buildNextSteps(flags),
  };
};

const appendSection = (lines: string[], title: string, items: ReadonlyArray<string>): void => {
  if (items.length === 0) return;
  lines.push('', title, ...items);
};

const renderIssues = (report: WorkerStartupDiagnosticsReport): string[] =>
  report.issues.map((issue) => {
    const envSuffix = issue.envKeys.length > 0 ? ` [${issue.envKeys.join(', ')}]` : '';
    return `- ${issue.severity.toUpperCase()}: ${issue.message}${envSuffix}`;
  });

const renderEnvStatus = (report: WorkerStartupDiagnosticsReport): string[] =>
  report.envStatus.map((entry) => {
    const state = entry.present ? entry.resolvedValue : '[missing]';
    return `- ${entry.key}: ${state}`;
  });

const renderBullets = (items: ReadonlyArray<string>): string[] => items.map((item) => `- ${item}`);

const renderLines = (report: WorkerStartupDiagnosticsReport): string[] => {
  const lines = [
    '=== Worker Startup Diagnostics ===',
    '',
    `Runtime Mode: ${report.flags.runtimeMode}`,
    `Worker Enabled: ${report.flags.workerEnabled}`,
    `Worker Auto Start: ${report.flags.workerAutoStart}`,
    `Docker Worker: ${report.flags.dockerWorker}`,
    `Queue Enabled: ${report.flags.queueEnabled}`,
    `Queue Driver: ${report.flags.queueDriver}`,
    `Persistence Driver: ${report.flags.persistenceDriver}`,
  ];

  appendSection(
    lines,
    'First Fault:',
    report.firstFault === null ? [] : [`- ${report.firstFault.message}`]
  );
  appendSection(lines, 'Issues:', renderIssues(report));
  appendSection(lines, 'Relevant Env:', renderEnvStatus(report));
  appendSection(lines, 'Log Pointers:', renderBullets(report.logPointers));
  appendSection(lines, 'Next Steps:', renderBullets(report.nextSteps));

  return lines;
};

const log = (error?: unknown, context = 'worker startup'): WorkerStartupDiagnosticsReport => {
  const report = collect(error);

  Logger.error(`${context} first-fault summary`, {
    flags: report.flags,
    missingEnvKeys: report.missingEnvKeys,
    firstFault: report.firstFault,
    issues: report.issues,
    logPointers: report.logPointers,
    nextSteps: report.nextSteps,
  });

  if (report.missingEnvKeys.length > 0) {
    Logger.error('Likely missing env keys for worker startup', report.missingEnvKeys);
  }

  return report;
};

const hasBlockingIssues = (report: WorkerStartupDiagnosticsReport): boolean =>
  report.issues.some((issue) => issue.severity === 'error');

export const WorkerStartupDiagnostics = Object.freeze({
  collect,
  renderLines,
  log,
  hasBlockingIssues,
  createCliError(message: string): Error {
    return ErrorFactory.createCliError(message);
  },
});
