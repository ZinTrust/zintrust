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
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
};

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

  const sortedHeaderKeys = Object.keys(headers).sort((a, b) => a.localeCompare(b));
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${String(headers[k]).trim().replaceAll(/\s+/g, ' ')}`)
    .join('\n');
  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalRequest = [
    params.method,
    canonicalUri,
    canonicalQueryString,
    `${canonicalHeaders}\n`,
    signedHeaders,
    params.payloadHash,
  ].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${params.dateStamp}/${params.region}/s3/aws4_request`;
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

export const S3Driver = Object.freeze({
  async put(config: S3Config, key: string, content: string | Buffer): Promise<string> {
    const accessKeyId = config.accessKeyId ?? process.env['AWS_ACCESS_KEY_ID'] ?? '';
    const secretAccessKey = config.secretAccessKey ?? process.env['AWS_SECRET_ACCESS_KEY'] ?? '';
    const sessionToken = process.env['AWS_SESSION_TOKEN'] ?? undefined;

    if (accessKeyId.trim() === '' || secretAccessKey.trim() === '') {
      throw ErrorFactory.createConfigError('S3: missing AWS credentials');
    }

    const { host, path, url } = buildHostAndPath(config, key);

    const now = new Date();
    const { amzDate, dateStamp } = toAmzDate(now);

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
    const accessKeyId = config.accessKeyId ?? process.env['AWS_ACCESS_KEY_ID'] ?? '';
    const secretAccessKey = config.secretAccessKey ?? process.env['AWS_SECRET_ACCESS_KEY'] ?? '';
    const sessionToken = process.env['AWS_SESSION_TOKEN'] ?? undefined;

    if (accessKeyId.trim() === '' || secretAccessKey.trim() === '') {
      throw ErrorFactory.createConfigError('S3: missing AWS credentials');
    }

    const { host, path } = buildHostAndPath(config, key);

    const now = new Date();
    const { amzDate, dateStamp } = toAmzDate(now);

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
      const accessKeyId = config.accessKeyId ?? process.env['AWS_ACCESS_KEY_ID'] ?? '';
      const secretAccessKey = config.secretAccessKey ?? process.env['AWS_SECRET_ACCESS_KEY'] ?? '';
      const sessionToken = process.env['AWS_SESSION_TOKEN'] ?? undefined;

      if (accessKeyId.trim() === '' || secretAccessKey.trim() === '') {
        throw ErrorFactory.createConfigError('S3: missing AWS credentials');
      }

      const { host, path } = buildHostAndPath(config, key);
      const now = new Date();
      const { amzDate, dateStamp } = toAmzDate(now);
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
    const accessKeyId = config.accessKeyId ?? process.env['AWS_ACCESS_KEY_ID'] ?? '';
    const secretAccessKey = config.secretAccessKey ?? process.env['AWS_SECRET_ACCESS_KEY'] ?? '';
    const sessionToken = process.env['AWS_SESSION_TOKEN'] ?? undefined;

    if (accessKeyId.trim() === '' || secretAccessKey.trim() === '') {
      throw ErrorFactory.createConfigError('S3: missing AWS credentials');
    }

    const { host, path } = buildHostAndPath(config, key);
    const now = new Date();
    const { amzDate, dateStamp } = toAmzDate(now);
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
});

export default S3Driver;
