import { afterEach, describe, expect, it, vi } from 'vitest';

describe('WorkerStartupDiagnostics', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not report fallback-backed env keys as missing', async () => {
    vi.stubEnv('APP_KEY', 'base64-secret');
    vi.stubEnv('APP_NAME', 'ZinTrust Test');
    vi.stubEnv('QUEUE_DRIVER', 'redis');
    vi.stubEnv('WORKER_AUTO_START', 'true');
    vi.stubEnv('WORKER_PERSISTENCE_DRIVER', 'database');
    vi.stubEnv('USE_REDIS_PROXY', 'true');
    vi.stubEnv('REDIS_PROXY_URL', 'http://127.0.0.1:8800/redis');

    const { WorkerStartupDiagnostics } = await import('@cli/services/WorkerStartupDiagnostics');
    const report = WorkerStartupDiagnostics.collect();

    expect(report.missingEnvKeys).toEqual(['WORKER_ENABLED', 'QUEUE_ENABLED']);
    expect(report.envStatus).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'RUNTIME_MODE',
          present: true,
          resolvedValue: 'node-server',
        }),
        expect.objectContaining({ key: 'QUEUE_ENABLED', present: true, resolvedValue: 'false' }),
        expect.objectContaining({
          key: 'REDIS_PROXY_SECRET',
          present: true,
          resolvedValue: '[set]',
        }),
        expect.objectContaining({
          key: 'REDIS_PROXY_KEY_ID',
          present: true,
          resolvedValue: 'zintrust_test',
        }),
        expect.objectContaining({
          key: 'WORKER_PERSISTENCE_TABLE',
          present: true,
          resolvedValue: 'zintrust_workers',
        }),
      ])
    );
  });
});
