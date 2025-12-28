import { ErrorFactory } from '@exceptions/ZintrustError';
import { createHash, createHmac } from '@node-singletons/crypto';

export type AwsCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

const sha256Hex = (data: string | Uint8Array): string =>
  createHash('sha256').update(data).digest('hex');

const hmac = (key: Uint8Array | string, data: string): Uint8Array =>
  createHmac('sha256', key).update(data).digest();

const toAmzDate = (date: Date): { amzDate: string; dateStamp: string } => {
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');

  const dateStamp = `${yyyy}${mm}${dd}`;
  const amzDate = `${dateStamp}T${hh}${mi}${ss}Z`;
  return { amzDate, dateStamp };
};

const deriveSigningKey = (
  secretAccessKey: string,
  dateStamp: string,
  region: string
): Uint8Array => {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 'secretsmanager');
  return hmac(kService, 'aws4_request');
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

  const sortedHeaderKeys = Object.keys(headers).sort((a, b) => a.localeCompare(b));
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${String(headers[k]).trim().replaceAll(/\s+/g, ' ')}`)
    .join('\n');
  const signedHeaders = sortedHeaderKeys.join(';');

  const payloadHash = sha256Hex(params.body);

  const canonicalRequest = [
    params.method,
    canonicalUri,
    canonicalQueryString,
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${params.dateStamp}/${params.region}/secretsmanager/aws4_request`;
  const stringToSign = [
    algorithm,
    params.amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = deriveSigningKey(
    params.credentials.secretAccessKey,
    params.dateStamp,
    params.region
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorization =
    `${algorithm} Credential=${params.credentials.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { authorization, signedHeaders };
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
  const { amzDate, dateStamp } = toAmzDate(now);
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
    const region = process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'] ?? '';
    const accessKeyId = process.env['AWS_ACCESS_KEY_ID'] ?? '';
    const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'] ?? '';
    const sessionToken = process.env['AWS_SESSION_TOKEN'] ?? undefined;

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

    const region = (process.env['AWS_REGION'] ?? process.env['AWS_DEFAULT_REGION'] ?? '').trim();
    if (region === '') missing.push('AWS_REGION');

    const accessKeyId = (process.env['AWS_ACCESS_KEY_ID'] ?? '').trim();
    if (accessKeyId === '') missing.push('AWS_ACCESS_KEY_ID');

    const secretAccessKey = (process.env['AWS_SECRET_ACCESS_KEY'] ?? '').trim();
    if (secretAccessKey === '') missing.push('AWS_SECRET_ACCESS_KEY');

    return missing;
  },
});

export default AwsSecretsManager;
