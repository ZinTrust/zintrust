import { ErrorFactory } from '@zintrust/core';

type RdsDataModule = {
  RDSDataClient: new (cfg: { region?: string }) => {
    send: (command: unknown) => Promise<unknown>;
  };
  ExecuteStatementCommand: new (input: unknown) => unknown;
};

type SecretsManagerModule = {
  SecretsManagerClient: new (cfg: { region?: string }) => {
    send: (command: unknown) => Promise<unknown>;
  };
  GetSecretValueCommand: new (input: { SecretId: string }) => unknown;
};

export type RdsDataClient = {
  executeStatement: (input: unknown) => Promise<unknown>;
};

export type SecretsManagerClient = {
  getSecretValue: (secretName: string) => Promise<{ SecretString?: string }>;
};

function getErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as Record<string, unknown>).code === 'string'
  ) {
    return (error as Record<string, unknown>).code as string;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as Record<string, unknown>).cause === 'object' &&
    (error as Record<string, unknown>).cause !== null &&
    typeof ((error as Record<string, unknown>).cause as Record<string, unknown>).code === 'string'
  ) {
    return ((error as Record<string, unknown>).cause as Record<string, unknown>).code as string;
  }
  return '';
}

function getErrorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as Record<string, unknown>).message === 'string'
  ) {
    return (error as Record<string, unknown>).message as string;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as Record<string, unknown>).cause === 'object' &&
    (error as Record<string, unknown>).cause !== null &&
    typeof ((error as Record<string, unknown>).cause as Record<string, unknown>).message ===
      'string'
  ) {
    return ((error as Record<string, unknown>).cause as Record<string, unknown>).message as string;
  }
  return '';
}

function isMissingEsmPackage(error: unknown, packageName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = getErrorCode(error);
  const message = getErrorMessage(error);
  if (code === 'ERR_MODULE_NOT_FOUND') return true;
  if (message.includes(packageName)) return true;
  if (message.includes(`Cannot find package '${packageName}'`)) return true;
  return false;
}

async function importRdsDataModule(): Promise<RdsDataModule> {
  const specifier = '@aws-sdk/client-rds-data';
  return (await import(specifier)) as unknown as RdsDataModule;
}

async function importSecretsManagerModule(): Promise<SecretsManagerModule> {
  const specifier = '@aws-sdk/client-secrets-manager';
  return (await import(specifier)) as unknown as SecretsManagerModule;
}

export async function getRdsDataClient(region?: string): Promise<RdsDataClient> {
  try {
    const mod = await importRdsDataModule();
    const client = new mod.RDSDataClient({ region });
    return {
      executeStatement: async (input: unknown) =>
        client.send(new mod.ExecuteStatementCommand(input)),
    };
  } catch (error) {
    if (isMissingEsmPackage(error, '@aws-sdk/client-rds-data')) {
      throw ErrorFactory.createConfigError(
        "RDS Data API requires '@aws-sdk/client-rds-data' (install and configure AWS credentials)."
      );
    }
    throw ErrorFactory.createTryCatchError('Failed to initialize RDS Data API client', {
      cause: error,
    });
  }
}

export async function getSecretsManagerClient(region?: string): Promise<SecretsManagerClient> {
  try {
    const mod = await importSecretsManagerModule();
    const client = new mod.SecretsManagerClient({ region });
    return {
      getSecretValue: async (secretName: string) =>
        (await client.send(new mod.GetSecretValueCommand({ SecretId: secretName }))) as {
          SecretString?: string;
        },
    };
  } catch (error) {
    if (isMissingEsmPackage(error, '@aws-sdk/client-secrets-manager')) {
      throw ErrorFactory.createConfigError(
        "Secrets Manager requires '@aws-sdk/client-secrets-manager' (install and configure AWS credentials)."
      );
    }
    throw ErrorFactory.createTryCatchError('Failed to initialize Secrets Manager client', {
      cause: error,
    });
  }
}

export default Object.freeze({
  getRdsDataClient,
  getSecretsManagerClient,
});

/**
 * Package version and build metadata
 * Available at runtime for debugging and health checks
 */
export const _ZINTRUST_CLIENT_RDS_DATA_VERSION = '0.1.15';
export const _ZINTRUST_CLIENT_RDS_DATA_BUILD_DATE = '__BUILD_DATE__';
