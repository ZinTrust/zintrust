import { AwsSigV4 } from '@common/index';
import { ErrorFactory } from '@exceptions/ZintrustError';
import { createHash, createHmac } from '@node-singletons/crypto';

export type S3Config = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  usePathStyle?: boolean;
};

export type GS3Cred = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string | undefined;
};

const sha256Hex = (data: string | Uint8Array): string =>
  createHash('sha256').update(data).digest('hex');

const buildAuthorization = (params: {
  method: string;
  host: string;
  region: string;
  amzDate: string;
  dateStamp: string;
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  payloadHash: string;
  path: string;
}): { authorization: string; signedHeaders: string } => {
  const canonicalUri = params.path;
  const canonicalQueryString = '';

  const headers: Record<string, string> = {
    host: params.host,
    'x-amz-date': params.amzDate,
    'x-amz-content-sha256': params.payloadHash,
  };

  if (params.credentials.sessionToken !== undefined)
    headers['x-amz-security-token'] = params.credentials.sessionToken;

  return AwsSigV4.buildAuthorization({
    method: params.method,
    canonicalUri,
    canonicalQueryString,
    headers,
    payloadHash: params.payloadHash,
    region: params.region,
    service: 's3',
    amzDate: params.amzDate,
    dateStamp: params.dateStamp,
    credentials: params.credentials,
  });
};

const buildHostAndPath = (
  config: S3Config,
  key: string
): { host: string; path: string; url: string } => {
  const endpoint = config.endpoint?.trim() ?? '';
  if (endpoint !== '') {
    // if endpoint provided, prefer path-style
    const host = endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const path = `/${config.bucket}/${key}`;
    return { host, path, url: `${endpoint.replace(/\/$/, '')}/${config.bucket}/${key}` };
  }

  const host = `${config.bucket}.s3.${config.region}.amazonaws.com`;
  const path = `/${key}`;
  const url = `https://${host}${path}`;
  return { host, path, url };
};

const awsEncodeURIComponent = (value: string): string =>
  encodeURIComponent(value).replaceAll(
    /[!'()*]/g,
    (c) => `%${c.codePointAt(0)?.toString(16).toUpperCase()}`
  );

const encodePathSegments = (key: string): string =>
  key
    .split('/')
    .map((seg) => awsEncodeURIComponent(seg))
    .join('/');

const buildCanonicalQueryString = (params: Record<string, string>): string => {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => [awsEncodeURIComponent(k), awsEncodeURIComponent(v)] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));

  return entries.map(([k, v]) => `${k}=${v}`).join('&');
};

const getCredentials = (config: S3Config): GS3Cred => {
  const accessKeyId = config.accessKeyId ?? process.env['AWS_ACCESS_KEY_ID'] ?? '';
  const secretAccessKey = config.secretAccessKey ?? process.env['AWS_SECRET_ACCESS_KEY'] ?? '';
  const sessionToken = process.env['AWS_SESSION_TOKEN'] ?? undefined;

  if (accessKeyId.trim() === '' || secretAccessKey.trim() === '') {
    throw ErrorFactory.createConfigError('S3: missing AWS credentials');
  }
  return { accessKeyId, secretAccessKey, sessionToken };
};

const validateExpiresIn = (expiresIn: number): void => {
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw ErrorFactory.createValidationError('S3: expiresIn must be a positive number', {
      expiresIn,
    });
  }
  if (expiresIn > 604800) {
    throw ErrorFactory.createValidationError('S3: expiresIn exceeds maximum (604800 seconds)', {
      expiresIn,
    });
  }
};

export const S3Driver = Object.freeze({
  async put(config: S3Config, key: string, content: string | Buffer): Promise<string> {
    const { accessKeyId, secretAccessKey, sessionToken } = getCredentials(config);

    const { host, path, url } = buildHostAndPath(config, key);

    const now = new Date();
    const { amzDate, dateStamp } = AwsSigV4.toAmzDate(now);

    const body = typeof content === 'string' ? content : Buffer.from(content);
    const payloadHash = sha256Hex(body);

    const { authorization } = buildAuthorization({
      method: 'PUT',
      host,
      region: config.region,
      amzDate,
      dateStamp,
      credentials: { accessKeyId, secretAccessKey, sessionToken },
      payloadHash,
      path,
    });

    const headers: Record<string, string> = {
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: authorization,
    };
    if (sessionToken !== undefined) headers['x-amz-security-token'] = sessionToken;

    const res = await fetch(`https://${host}${path}`, {
      method: 'PUT',
      headers,
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      throw ErrorFactory.createConnectionError(`S3 put failed (${res.status})`, {
        status: res.status,
        body: text,
      });
    }

    return url;
  },

  async get(config: S3Config, key: string): Promise<Buffer> {
    const { accessKeyId, secretAccessKey, sessionToken } = getCredentials(config);

    const { host, path } = buildHostAndPath(config, key);

    const now = new Date();
    const { amzDate, dateStamp } = AwsSigV4.toAmzDate(now);

    const payloadHash = sha256Hex('');

    const { authorization } = buildAuthorization({
      method: 'GET',
      host,
      region: config.region,
      amzDate,
      dateStamp,
      credentials: { accessKeyId, secretAccessKey, sessionToken },
      payloadHash,
      path,
    });

    const headers: Record<string, string> = {
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: authorization,
    };
    if (sessionToken !== undefined) headers['x-amz-security-token'] = sessionToken;

    const res = await fetch(`https://${host}${path}`, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      const text = await res.text();
      throw ErrorFactory.createNotFoundError('S3 get failed', { status: res.status, body: text });
    }

    const buf = Buffer.from(await res.arrayBuffer());
    return buf;
  },

  async exists(config: S3Config, key: string): Promise<boolean> {
    try {
      const { accessKeyId, secretAccessKey, sessionToken } = getCredentials(config);

      const { host, path } = buildHostAndPath(config, key);
      const now = new Date();
      const { amzDate, dateStamp } = AwsSigV4.toAmzDate(now);
      const payloadHash = sha256Hex('');

      const { authorization } = buildAuthorization({
        method: 'HEAD',
        host,
        region: config.region,
        amzDate,
        dateStamp,
        credentials: { accessKeyId, secretAccessKey, sessionToken },
        payloadHash,
        path,
      });

      const headers: Record<string, string> = {
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        Authorization: authorization,
      };
      if (sessionToken !== undefined) headers['x-amz-security-token'] = sessionToken;

      const res = await fetch(`https://${host}${path}`, { method: 'HEAD', headers });
      return res.ok;
    } catch {
      return false;
    }
  },

  async delete(config: S3Config, key: string): Promise<void> {
    const { accessKeyId, secretAccessKey, sessionToken } = getCredentials(config);

    const { host, path } = buildHostAndPath(config, key);
    const now = new Date();
    const { amzDate, dateStamp } = AwsSigV4.toAmzDate(now);
    const payloadHash = sha256Hex('');

    const { authorization } = buildAuthorization({
      method: 'DELETE',
      host,
      region: config.region,
      amzDate,
      dateStamp,
      credentials: { accessKeyId, secretAccessKey, sessionToken },
      payloadHash,
      path,
    });

    const headers: Record<string, string> = {
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: authorization,
    };
    if (sessionToken !== undefined) headers['x-amz-security-token'] = sessionToken;

    const res = await fetch(`https://${host}${path}`, { method: 'DELETE', headers });
    if (!res.ok) {
      const text = await res.text();
      throw ErrorFactory.createConnectionError(`S3 delete failed (${res.status})`, {
        status: res.status,
        body: text,
      });
    }
  },

  url(config: S3Config, key: string): string {
    const endpoint = config.endpoint?.trim() ?? '';
    if (endpoint !== '') return `${endpoint.replace(/\/$/, '')}/${config.bucket}/${key}`;
    return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
  },

  tempUrl(
    config: S3Config,
    key: string,
    options?: { expiresIn?: number; method?: 'GET' | 'PUT' }
  ): string {
    const { accessKeyId, secretAccessKey, sessionToken } = getCredentials(config);

    const expiresIn = options?.expiresIn ?? 900;
    validateExpiresIn(expiresIn);

    const method = options?.method ?? 'GET';

    const encodedKey = encodePathSegments(key);
    const { host, path } = buildHostAndPath(config, encodedKey);

    const now = new Date();
    const { amzDate, dateStamp } = AwsSigV4.toAmzDate(now);

    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${config.region}/s3/aws4_request`;
    const credential = `${accessKeyId}/${credentialScope}`;

    const queryParams: Record<string, string> = {
      'X-Amz-Algorithm': algorithm,
      'X-Amz-Credential': credential,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(Math.floor(expiresIn)),
      'X-Amz-SignedHeaders': 'host',
    };
    if (sessionToken !== undefined) queryParams['X-Amz-Security-Token'] = sessionToken;

    const canonicalQueryString = buildCanonicalQueryString(queryParams);

    const canonicalRequest = [
      method,
      path,
      canonicalQueryString,
      `host:${host}\n`,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [algorithm, amzDate, credentialScope, sha256Hex(canonicalRequest)].join(
      '\n'
    );

    const signingKey = AwsSigV4.deriveSigningKey({
      secretAccessKey,
      dateStamp,
      region: config.region,
      service: 's3',
    });
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const baseUrl = `https://${host}${path}`;
    return `${baseUrl}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  },
});

export default S3Driver;
