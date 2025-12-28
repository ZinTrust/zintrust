import { ErrorFactory } from '@exceptions/ZintrustError';
import { createHash, createHmac } from '@node-singletons/crypto';

export type SesConfig = {
  region: string;
};

export type MailAddress = {
  email: string;
  name?: string;
};

export type MailMessage = {
  to: string | string[];
  from: MailAddress;
  subject: string;
  text: string;
  html?: string;
};

export type SendResult = {
  ok: boolean;
  provider: 'ses';
  messageId?: string;
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
  const kService = hmac(kRegion, 'ses');
  return hmac(kService, 'aws4_request');
};

const buildAuthorization = (params: {
  method: string;
  host: string;
  region: string;
  amzDate: string;
  dateStamp: string;
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  body: string;
  path: string;
}): { authorization: string; signedHeaders: string } => {
  const canonicalUri = params.path;
  const canonicalQueryString = '';

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    host: params.host,
    'x-amz-date': params.amzDate,
  };

  if (params.credentials.sessionToken !== null && params.credentials.sessionToken !== undefined) {
    headers['x-amz-security-token'] = params.credentials.sessionToken;
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
  const credentialScope = `${params.dateStamp}/${params.region}/ses/aws4_request`;
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

const ensureRegion = (config: SesConfig): string => {
  const region = typeof config.region === 'string' ? config.region.trim() : '';
  if (region === '') throw ErrorFactory.createConfigError('SES: missing region in config');
  return region;
};

const ensureCredentials = (): {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
} => {
  const accessKeyId = process.env['AWS_ACCESS_KEY_ID'] ?? '';
  const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'] ?? '';
  const sessionToken = process.env['AWS_SESSION_TOKEN'] ?? undefined;

  if (accessKeyId.trim() === '' || secretAccessKey.trim() === '') {
    throw ErrorFactory.createConfigError(
      'SES: missing AWS credentials (set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY)'
    );
  }

  return { accessKeyId, secretAccessKey, sessionToken };
};

const buildBody = (message: MailMessage): string => {
  const toAddresses = Array.isArray(message.to) ? message.to : [message.to];
  const body = {
    FromEmailAddress: message.from.email,
    Destination: { ToAddresses: toAddresses },
    Content: {
      Simple: {
        Subject: { Data: message.subject },
        Body: {
          Text: { Data: message.text },
          ...(typeof message.html === 'string' && message.html !== ''
            ? { Html: { Data: message.html } }
            : {}),
        },
      },
    },
  };
  return JSON.stringify(body);
};

const buildHeaders = (
  amzDate: string,
  authorization: string,
  sessionToken?: string
): Record<string, string> => {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-amz-date': amzDate,
    Authorization: authorization,
  };
  if (typeof sessionToken === 'string' && sessionToken !== '')
    headers['x-amz-security-token'] = sessionToken;
  return headers;
};

export const SesDriver = Object.freeze({
  async send(config: SesConfig, message: MailMessage): Promise<SendResult> {
    const region = ensureRegion(config);
    const { accessKeyId, secretAccessKey, sessionToken } = ensureCredentials();

    const bodyJson = buildBody(message);

    const host = `email.${region}.amazonaws.com`;
    const path = '/v2/email/outbound-emails';
    const url = `https://${host}${path}`;

    const now = new Date();
    const { amzDate, dateStamp } = toAmzDate(now);

    const { authorization } = buildAuthorization({
      method: 'POST',
      host: host,
      region,
      amzDate,
      dateStamp,
      credentials: { accessKeyId, secretAccessKey, sessionToken },
      body: bodyJson,
      path,
    });

    const headers = buildHeaders(amzDate, authorization, sessionToken);

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: bodyJson,
    });

    if (res.ok) {
      try {
        const json = (await res.json()) as Record<string, unknown>;
        const messageId =
          typeof json?.['MessageId'] === 'string' ? (json['MessageId'] as string) : undefined;
        return { ok: true, provider: 'ses', messageId };
      } catch {
        return { ok: true, provider: 'ses' };
      }
    }

    const text = await res.text();
    throw ErrorFactory.createConnectionError(`SES send failed (${res.status})`, {
      status: res.status,
      body: text,
    });
  },
});

export default SesDriver;
