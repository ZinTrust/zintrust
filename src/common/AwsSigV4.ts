import { createHash, createHmac } from '@node-singletons/crypto';

export type AwsSigV4Credentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

type CanonicalizedHeaders = {
  canonicalHeaders: string;
  signedHeaders: string;
};

export const AwsSigV4 = Object.freeze({
  sha256Hex(data: string | Uint8Array): string {
    return createHash('sha256').update(data).digest('hex');
  },

  hmacSha256(key: Uint8Array | string, data: string): Uint8Array {
    return createHmac('sha256', key).update(data).digest();
  },

  toAmzDate(date: Date): { amzDate: string; dateStamp: string } {
    const yyyy = String(date.getUTCFullYear());
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const mi = String(date.getUTCMinutes()).padStart(2, '0');
    const ss = String(date.getUTCSeconds()).padStart(2, '0');

    const dateStamp = `${yyyy}${mm}${dd}`;
    const amzDate = `${dateStamp}T${hh}${mi}${ss}Z`;
    return { amzDate, dateStamp };
  },

  deriveSigningKey(params: {
    secretAccessKey: string;
    dateStamp: string;
    region: string;
    service: string;
  }): Uint8Array {
    const kDate = this.hmacSha256(`AWS4${params.secretAccessKey}`, params.dateStamp);
    const kRegion = this.hmacSha256(kDate, params.region);
    const kService = this.hmacSha256(kRegion, params.service);
    return this.hmacSha256(kService, 'aws4_request');
  },

  canonicalizeHeaders(headers: Record<string, string>): CanonicalizedHeaders {
    const sortedHeaderKeys = Object.keys(headers).sort((a, b) => a.localeCompare(b));

    const canonicalHeaders = sortedHeaderKeys
      .map((k) => `${k}:${String(headers[k]).trim().replaceAll(/\s+/g, ' ')}`)
      .join('\n');

    const signedHeaders = sortedHeaderKeys.join(';');

    return { canonicalHeaders, signedHeaders };
  },

  buildAuthorization(params: {
    method: string;
    canonicalUri: string;
    canonicalQueryString: string;
    headers: Record<string, string>;
    payloadHash: string;
    region: string;
    service: string;
    amzDate: string;
    dateStamp: string;
    credentials: AwsSigV4Credentials;
  }): { authorization: string; signedHeaders: string } {
    const sessionToken = params.credentials.sessionToken;
    if (
      typeof sessionToken === 'string' &&
      sessionToken.trim() !== '' &&
      params.headers['x-amz-security-token'] === undefined
    ) {
      params.headers['x-amz-security-token'] = sessionToken;
    }

    const { canonicalHeaders, signedHeaders } = this.canonicalizeHeaders(params.headers);

    const canonicalRequest = [
      params.method,
      params.canonicalUri,
      params.canonicalQueryString,
      `${canonicalHeaders}\n`,
      signedHeaders,
      params.payloadHash,
    ].join('\n');

    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${params.dateStamp}/${params.region}/${params.service}/aws4_request`;
    const stringToSign = [
      algorithm,
      params.amzDate,
      credentialScope,
      this.sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = this.deriveSigningKey({
      secretAccessKey: params.credentials.secretAccessKey,
      dateStamp: params.dateStamp,
      region: params.region,
      service: params.service,
    });

    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const authorization =
      `${algorithm} Credential=${params.credentials.accessKeyId}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return { authorization, signedHeaders };
  },
});
