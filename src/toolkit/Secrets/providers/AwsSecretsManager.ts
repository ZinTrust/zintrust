import { AwsSigV4 } from '@common/index';
import { Env } from '@config/env';
import { ErrorFactory } from '@exceptions/ZintrustError';

export type AwsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

const sha256Hex = (data: string | Uint8Array): string => AwsSigV4.sha256Hex(data);

const readEnvString = (key: string): string => {
  const anyEnv = Env as { get?: (k: string, d?: string) => string };
  const fromEnv = typeof anyEnv.get === 'function' ? anyEnv.get(key, '') : '';
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv;
  if (typeof process !== 'undefined') {
    const raw = process.env?.[key];
    if (typeof raw === 'string') return raw;
  }
  return fromEnv ?? '';
};

const buildAuthorization = (params: {
  method: string;
  host: string;
  region: string;
  amzDate: string;
  dateStamp: string;
  credentials: AwsCredentials;
  target: string;
  body: string;
}): { authorization: string; signedHeaders: string } => {
  const canonicalUri = '/';
  const canonicalQueryString = '';

  const headers: Record<string, string> = {
    'content-type': 'application/x-amz-json-1.1',
    host: params.host,
    'x-amz-date': params.amzDate,
    'x-amz-target': params.target,
  };

  const sessionToken = params.credentials.sessionToken;
  if (typeof sessionToken === 'string' && sessionToken.trim() !== '') {
    headers['x-amz-security-token'] = sessionToken;
  }

  const payloadHash = sha256Hex(params.body);

  return AwsSigV4.buildAuthorization({
    method: params.method,
    canonicalUri,
    canonicalQueryString,
    headers,
    payloadHash,
    region: params.region,
    service: 'secretsmanager',
    amzDate: params.amzDate,
    dateStamp: params.dateStamp,
    credentials: params.credentials,
  });
};

const parseMaybeJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const requestAwsSecretsManager = async <T>(
  region: string,
  credentials: AwsCredentials,
  target: string,
  body: Record<string, unknown>
): Promise<T> => {
  const host = `secretsmanager.${region}.amazonaws.com`;
  const url = `https://${host}/`;

  const now = new Date();
  const { amzDate, dateStamp } = AwsSigV4.toAmzDate(now);
  const bodyJson = JSON.stringify(body);

  const { authorization } = buildAuthorization({
    method: 'POST',
    host,
    region,
    amzDate,
    dateStamp,
    credentials,
    target,
    body: bodyJson,
  });

  const headers: Record<string, string> = {
    'content-type': 'application/x-amz-json-1.1',
    'x-amz-date': amzDate,
    'x-amz-target': target,
    Authorization: authorization,
  };

  const sessionToken = credentials.sessionToken;
  if (typeof sessionToken === 'string' && sessionToken.trim() !== '') {
    headers['x-amz-security-token'] = sessionToken;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: bodyJson,
  });

  const text = await res.text();
  if (!res.ok) {
    throw ErrorFactory.createCliError(`AWS SecretsManager request failed (${res.status})`, {
      status: res.status,
      body: text,
    });
  }

  return JSON.parse(text) as T;
};

export const AwsSecretsManager = Object.freeze({
  createFromEnv(): {
    getValue: (secretId: string, jsonKey?: string) => Promise<string | null>;
    putValue: (secretId: string, value: string) => Promise<void>;
  } {
    const region = readEnvString('AWS_REGION') || readEnvString('AWS_DEFAULT_REGION');
    const accessKeyId = readEnvString('AWS_ACCESS_KEY_ID');
    const secretAccessKey = readEnvString('AWS_SECRET_ACCESS_KEY');
    const sessionToken = readEnvString('AWS_SESSION_TOKEN') || undefined;

    if (region.trim() === '' || accessKeyId.trim() === '' || secretAccessKey.trim() === '') {
      throw ErrorFactory.createCliError(
        'AWS credentials missing: set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY'
      );
    }

    const credentials: AwsCredentials = { accessKeyId, secretAccessKey, sessionToken };

    const getValue = async (secretId: string, jsonKey?: string): Promise<string | null> => {
      const data = await requestAwsSecretsManager<{ SecretString?: unknown }>(
        region,
        credentials,
        'secretsmanager.GetSecretValue',
        {
          SecretId: secretId,
        }
      );

      if (typeof data.SecretString !== 'string') return null;
      if (jsonKey === undefined) return data.SecretString;

      const parsed = parseMaybeJson(data.SecretString);
      if (typeof parsed === 'object' && parsed !== null) {
        const obj = parsed as Record<string, unknown>;
        if (!(jsonKey in obj)) return null;
        const v = obj[jsonKey];
        if (typeof v === 'string') return v;
        return JSON.stringify(v);
      }

      return null;
    };

    const putValue = async (secretId: string, value: string): Promise<void> => {
      await requestAwsSecretsManager<Record<string, unknown>>(
        region,
        credentials,
        'secretsmanager.PutSecretValue',
        {
          SecretId: secretId,
          SecretString: value,
        }
      );
    };

    return { getValue, putValue };
  },

  doctorEnv(): string[] {
    const missing: string[] = [];

    const region = (readEnvString('AWS_REGION') || readEnvString('AWS_DEFAULT_REGION')).trim();
    if (region === '') missing.push('AWS_REGION');

    const accessKeyId = readEnvString('AWS_ACCESS_KEY_ID').trim();
    if (accessKeyId === '') missing.push('AWS_ACCESS_KEY_ID');

    const secretAccessKey = readEnvString('AWS_SECRET_ACCESS_KEY').trim();
    if (secretAccessKey === '') missing.push('AWS_SECRET_ACCESS_KEY');

    return missing;
  },
});

export default AwsSecretsManager;
