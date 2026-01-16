import { afterEach, describe, expect, it, vi } from 'vitest';

describe('@zintrust/client-rds-data', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('creates RDS Data client wrapper', async () => {
    vi.doMock('@aws-sdk/client-rds-data', () => ({
      RDSDataClient: class {
        send(command: unknown) {
          return Promise.resolve({ ok: true, command });
        }
      },
      ExecuteStatementCommand: class {
        constructor(public input: unknown) {}
      },
    }));

    const { getRdsDataClient } = await import('../../../packages/client-rds-data/src/index');
    const client = await getRdsDataClient('us-east-1');
    const resp = await client.executeStatement({ sql: 'SELECT 1' });
    expect((resp as any).ok).toBe(true);
  });

  it('creates Secrets Manager client wrapper', async () => {
    vi.doMock('@aws-sdk/client-secrets-manager', () => ({
      SecretsManagerClient: class {
        send(command: unknown) {
          return Promise.resolve({ SecretString: JSON.stringify({ ok: true }), command });
        }
      },
      GetSecretValueCommand: class {
        constructor(public input: unknown) {}
      },
    }));

    const { getSecretsManagerClient } = await import('../../../packages/client-rds-data/src/index');
    const client = await getSecretsManagerClient('us-east-1');
    const resp = await client.getSecretValue('secret');
    expect(resp.SecretString).toContain('ok');
  });

  it('throws a config error when RDS Data SDK is missing', async () => {
    vi.doMock('@aws-sdk/client-rds-data', () => {
      const err = new Error('');
      (err as any).code = 'ERR_MODULE_NOT_FOUND';
      throw err;
    });

    const { getRdsDataClient } = await import('../../../packages/client-rds-data/src/index');

    await expect(getRdsDataClient('us-east-1')).rejects.toThrow(
      /RDS Data API requires '@aws-sdk\/client-rds-data'/
    );
  });

  it('wraps unexpected RDS Data initialization failures', async () => {
    vi.doMock('@aws-sdk/client-rds-data', () => {
      throw new Error('boom');
    });

    const { getRdsDataClient } = await import('../../../packages/client-rds-data/src/index');

    await expect(getRdsDataClient('us-east-1')).rejects.toThrow(
      /Failed to initialize RDS Data API client/
    );
  });

  it('throws a config error when Secrets Manager SDK is missing', async () => {
    vi.doMock('@aws-sdk/client-secrets-manager', () => {
      const err = new Error('');
      (err as any).code = 'ERR_MODULE_NOT_FOUND';
      throw err;
    });

    const { getSecretsManagerClient } = await import('../../../packages/client-rds-data/src/index');

    await expect(getSecretsManagerClient('us-east-1')).rejects.toThrow(
      /Secrets Manager requires '@aws-sdk\/client-secrets-manager'/
    );
  });

  it('wraps unexpected Secrets Manager initialization failures', async () => {
    vi.doMock('@aws-sdk/client-secrets-manager', () => {
      throw new Error('boom');
    });

    const { getSecretsManagerClient } = await import('../../../packages/client-rds-data/src/index');

    await expect(getSecretsManagerClient('us-east-1')).rejects.toThrow(
      /Failed to initialize Secrets Manager client/
    );
  });
});
