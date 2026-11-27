import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  queueDefaultError: undefined as unknown,
  throwQueueDefault: false,
  queueDefaultValue: 'redis',
  envOverrides: {} as Record<string, string>,
}));

vi.mock('@config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@config/env')>();
  const overridden = (key: string): boolean => Object.hasOwn(state.envOverrides, key);

  return {
    ...actual,
    Env: {
      ...actual.Env,
      get: (key: string, defaultValue?: string): string =>
        overridden(key)
          ? state.envOverrides[key] ?? ''
          : actual.Env.get(key, defaultValue),
      getBool: (key: string, defaultValue?: boolean): boolean =>
        overridden(key)
          ? (state.envOverrides[key] ?? '').trim().toLowerCase() === 'true'
          : actual.Env.getBool(key, defaultValue),
      snapshot: (): Record<string, string> => ({
        ...actual.Env.snapshot(),
        ...state.envOverrides,
      }),
    },
  };
});

vi.mock('@config/logger', () => ({
  Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@config/queue', () => ({
  queueConfig: {
    get default(): string {
      if (state.throwQueueDefault) {
        if (state.queueDefaultError instanceof Error) throw state.queueDefaultError;
        throw state.queueDefaultError;
      }
      return state.queueDefaultValue;
    },
  },
}));

import { Logger } from '@config/logger';
import { WorkerStartupDiagnostics } from '@cli/services/WorkerStartupDiagnostics';

const clearWorkerEnv = (): void => {
  for (const key of [
    'RUNTIME_MODE',
    'WORKER_ENABLED',
    'WORKER_AUTO_START',
    'DOCKER_WORKER',
    'QUEUE_ENABLED',
    'QUEUE_DRIVER',
    'WORKER_PERSISTENCE_DRIVER',
    'REDIS_PROXY_KEY_ID',
    'APP_NAME',
    'REDIS_PROXY_SECRET',
    'APP_KEY',
    'REDIS_PROXY_URL',
    'USE_REDIS_PROXY',
    'REDIS_PROXY_HOST',
    'REDIS_PROXY_PORT',
    'REDIS_RPC_URL',
    'WORKER_PERSISTENCE_DB_CONNECTION',
    'WORKER_PERSISTENCE_TABLE',
    'WORKER_PERSISTENCE_REDIS_DB',
    'DB_CONNECTION',
    'QUEUE_DB_CONNECTION',
    'RABBITMQ_HOST',
    'HOST',
    'PORT',
    'CUSTOM_FOO',
  ]) {
    vi.stubEnv(key, '');
  }
};

describe('WorkerStartupDiagnostics uncovered branch coverage', () => {
  beforeEach(() => {
    clearWorkerEnv();
    state.envOverrides = {};
    state.throwQueueDefault = false;
    state.queueDefaultValue = 'redis';
    state.queueDefaultError = new Error('queue config failed');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    state.throwQueueDefault = false;
  });

  it('skips blank and duplicate env keys and masks missing or secret values', () => {
    vi.stubEnv('CUSTOM_TOKEN', '  ');
    vi.stubEnv('APP_KEY', 'base64-secret');
    vi.stubEnv('DB_CONNECTION', 'primary');

    const report = WorkerStartupDiagnostics.collect(
      new Error('APP_KEY DB_CONNECTION REDIS_PROXY_URL CUSTOM_FOO')
    );
    const byKey = new Map(report.envStatus.map((entry) => [entry.key, entry]));

    expect(byKey.get('APP_KEY')?.resolvedValue).toBe('[set]');
    expect(byKey.get('DB_CONNECTION')?.resolvedValue).toBe('primary');
    expect(byKey.get('WORKER_ENABLED')?.resolvedValue).toBe('false');
    expect(byKey.get('CUSTOM_FOO')?.resolvedValue).toBe('[missing]');
    expect(byKey.get('CUSTOM_FOO')?.present).toBe(false);
    expect(report.missingEnvKeys).toContain('WORKER_ENABLED');
    expect(Logger.error).not.toHaveBeenCalled();
  });

  it('resolves redis proxy key id and secret from explicit, env, and default values', () => {
    const scenarios = [
      { keyId: 'explicit-id', appName: '', secret: 'explicit-secret', appKey: '' },
      { keyId: '', appName: 'My App', secret: '', appKey: 'explicit-key' },
      { keyId: '', appName: '', secret: '', appKey: '' },
    ];

    for (const scenario of scenarios) {
      vi.stubEnv('REDIS_PROXY_KEY_ID', scenario.keyId);
      vi.stubEnv('APP_NAME', scenario.appName);
      vi.stubEnv('REDIS_PROXY_SECRET', scenario.secret);
      vi.stubEnv('APP_KEY', scenario.appKey);

      const report = WorkerStartupDiagnostics.collect(
        new Error('REDIS_PROXY_KEY_ID REDIS_PROXY_SECRET')
      );
      const values = new Map(
        report.envStatus.map((entry) => [entry.key, entry.resolvedValue] as const)
      );

      if (scenario.keyId !== '') expect(values.get('REDIS_PROXY_KEY_ID')).toBe('explicit-id');
      else if (scenario.appName) expect(values.get('REDIS_PROXY_KEY_ID')).toBe('my_app');
      else expect(values.get('REDIS_PROXY_KEY_ID')).toBe('zintrust');

      if (scenario.secret !== '') expect(values.get('REDIS_PROXY_SECRET')).toBe('[set]');
      else if (scenario.appKey) expect(values.get('REDIS_PROXY_SECRET')).toBe('[set]');
      else expect(values.get('REDIS_PROXY_SECRET')).toBe('[missing]');
    }
  });

  it('resolves redis proxy URL from host/port defaults and treats empty values as missing', () => {
    const scenarios: Array<{
      useProxy: string;
      url: string;
      host: string;
      port: string;
      emptyResolved?: boolean;
      expected: string;
    }> = [
      { useProxy: 'false', url: '', host: 'db', port: '1234', expected: '[missing]' },
      { useProxy: 'true', url: '', host: '', port: '', emptyResolved: true, expected: '[missing]' },
      { useProxy: 'true', url: '', host: 'localhost', port: '8791', expected: 'http://localhost:8791' },
      { useProxy: 'true', url: '', host: 'localhost', port: '', expected: 'http://localhost:8791' },
      { useProxy: 'true', url: 'http://explicit:9000', host: 'db', port: '1', expected: 'http://explicit:9000' },
    ];

    for (const scenario of scenarios) {
      vi.stubEnv('USE_REDIS_PROXY', scenario.useProxy);
      vi.stubEnv('REDIS_PROXY_URL', scenario.url);
      vi.stubEnv('REDIS_PROXY_HOST', scenario.host);
      vi.stubEnv('REDIS_PROXY_PORT', scenario.port);
      state.envOverrides = scenario.emptyResolved
        ? { REDIS_PROXY_HOST: '', REDIS_PROXY_PORT: '' }
        : {};

      const report = WorkerStartupDiagnostics.collect(new Error('REDIS_PROXY_URL'));
      const entry = report.envStatus.find((item) => item.key === 'REDIS_PROXY_URL');
      expect(entry?.resolvedValue).toBe(scenario.expected);
    }
  });

  it('falls back to Env.get for env keys without a dedicated resolver', () => {
    vi.stubEnv('CUSTOM_FOO', 'custom-value');

    const report = WorkerStartupDiagnostics.collect(new Error('CUSTOM_FOO is required'));

    expect(report.envStatus).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'CUSTOM_FOO', resolvedValue: 'custom-value' }),
      ])
    );
  });

  it('reports queue configuration failures and infers env keys from fault messages', () => {
    const messages = [
      'Redis host is required',
      'worker persistence database client unavailable',
      'worker persistence redis config is invalid',
      'plain failure without env hints',
    ];

    for (const message of messages) {
      state.throwQueueDefault = true;
      state.queueDefaultError = new Error(message);

      const report = WorkerStartupDiagnostics.collect(new Error(message));

      expect(report.flags.queueDriver).toBe('sync');
      expect(report.issues.some((issue) => issue.severity === 'error')).toBe(true);
      expect(report.firstFault?.message).toContain(message);
    }

    state.queueDefaultError = 'QUEUE_DRIVER exploded';
    const report = WorkerStartupDiagnostics.collect(new Error('Worker failure'));
    expect(report.issues[0]?.envKeys).toContain('QUEUE_DRIVER');
  });

  it('handles non-Error faults, error codes, and empty-key messages', () => {
    expect(WorkerStartupDiagnostics.collect('a string fault').firstFault).toBeNull();

    const withCode = Object.assign(new Error('no env keys here'), { code: 'E_CLI' });
    const report = WorkerStartupDiagnostics.collect(withCode);
    expect(report.firstFault?.code).toBe('E_CLI');
    expect(report.firstFault?.message).toBe('no env keys here');
  });

  it('collects driver-specific env keys and container-mode flags', () => {
    const cases: Array<{
      env: Record<string, string>;
      expectedKeys: string[];
      logPointer: string;
    }> = [
      {
        env: { QUEUE_DRIVER: 'sqs', RUNTIME_MODE: 'containers', WORKER_PERSISTENCE_DRIVER: 'db' },
        expectedKeys: ['AWS_ACCESS_KEY_ID', 'AWS_SQS_QUEUE_URL', 'DB_CONNECTION'],
        logPointer: 'worker container logs for the node dist/bin/zin.js worker:start-all process',
      },
      {
        env: { QUEUE_DRIVER: 'database', WORKER_PERSISTENCE_DRIVER: 'redis' },
        expectedKeys: ['QUEUE_DB_CONNECTION', 'WORKER_PERSISTENCE_REDIS_DB'],
        logPointer: 'worker:start-all stderr/stdout',
      },
      {
        env: { QUEUE_DRIVER: 'rabbitmq', WORKER_PERSISTENCE_DRIVER: 'memory' },
        expectedKeys: ['RABBITMQ_HOST', 'RABBITMQ_PASSWORD'],
        logPointer: 'worker:start-all stderr/stdout',
      },
      {
        env: {
          QUEUE_DRIVER: 'redis',
          USE_REDIS_PROXY: 'true',
          REDIS_RPC_URL: 'http://rpc',
          WORKER_ENABLED: 'true',
          WORKER_AUTO_START: 'false',
        },
        expectedKeys: ['REDIS_RPC_URL', 'REDIS_PROXY_KEY_ID'],
        logPointer: 'worker:start-all stderr/stdout',
      },
      {
        env: { QUEUE_DRIVER: 'redis' },
        expectedKeys: ['REDIS_HOST', 'REDIS_QUEUE_DB'],
        logPointer: 'worker:start-all stderr/stdout',
      },
    ];

    for (const entry of cases) {
      for (const [key, value] of Object.entries(entry.env)) vi.stubEnv(key, value);

      const report = WorkerStartupDiagnostics.collect(new Error(entry.expectedKeys.join(' ')));

      expect(report.logPointers).toContain(entry.logPointer);
      for (const key of entry.expectedKeys) {
        expect(report.envStatus.some((status) => status.key === key)).toBe(true);
      }
    }
  });

  it('builds issues for docker workers, queue flags, and auto-start', () => {
    const report = WorkerStartupDiagnostics.collect();

    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'warn', envKeys: ['WORKER_ENABLED'] }),
        expect.objectContaining({ severity: 'warn', envKeys: ['QUEUE_ENABLED'] }),
      ])
    );
    expect(report.missingEnvKeys).toContain('WORKER_ENABLED');

    vi.stubEnv('DOCKER_WORKER', 'true');
    const dockerReport = WorkerStartupDiagnostics.collect();
    expect(dockerReport.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'error', envKeys: ['WORKER_ENABLED'] }),
      ])
    );

    vi.stubEnv('WORKER_ENABLED', 'true');
    const autoStartReport = WorkerStartupDiagnostics.collect();
    expect(autoStartReport.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warn',
          message: expect.stringContaining('WORKER_AUTO_START is false'),
        }),
      ])
    );
  });

  it('falls back to the default runtime mode and infers SQS keys from a fault', () => {
    state.envOverrides = { RUNTIME_MODE: '' };
    state.queueDefaultValue = 'sqs';

    const report = WorkerStartupDiagnostics.collect(new Error('worker failed'));

    expect(report.flags.runtimeMode).toBe('node-server');
    expect(report.firstFault?.message).toContain('AWS_ACCESS_KEY_ID');
  });

  it('renders every section, logs missing keys, and reports blocking issues', () => {
    vi.stubEnv('RUNTIME_MODE', 'containers');
    const report = WorkerStartupDiagnostics.collect(new Error('REDIS_HOST is required'));

    const lines = WorkerStartupDiagnostics.renderLines(report);
    expect(lines).toContain('First Fault:');
    expect(lines).toContain('Issues:');
    expect(lines).toContain('Relevant Env:');
    expect(lines).toContain('Log Pointers:');
    expect(lines).toContain('Next Steps:');

    const logged = WorkerStartupDiagnostics.log(new Error('REDIS_HOST is required'));
    expect(Logger.error).toHaveBeenCalledTimes(2);
    expect(WorkerStartupDiagnostics.hasBlockingIssues(logged)).toBe(true);

    const withoutFault = WorkerStartupDiagnostics.renderLines({
      ...report,
      firstFault: null,
      issues: [],
      envStatus: [],
      logPointers: [],
      nextSteps: [],
    });
    expect(withoutFault).not.toContain('First Fault:');
    expect(withoutFault).not.toContain('Issues:');
    expect(WorkerStartupDiagnostics.hasBlockingIssues({ ...report, issues: [] })).toBe(false);

    const withContainerSteps = WorkerStartupDiagnostics.renderLines(report);
    expect(
      withContainerSteps.some((line) => line.includes('zin worker:doctor --json'))
    ).toBe(true);
    expect(WorkerStartupDiagnostics.createCliError('boom')).toBeInstanceOf(Error);
  });

  it('logs an issue with a blank env suffix when an issue has no env keys', () => {
    const lines = WorkerStartupDiagnostics.renderLines({
      ...WorkerStartupDiagnostics.collect(),
      issues: [{ severity: 'info', message: 'all good', envKeys: [] }],
    });

    expect(lines).toContain('- INFO: all good');
  });
});
