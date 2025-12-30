import { describe, expect, it } from 'vitest';

import { AwsSigV4 } from '@/common/AwsSigV4';

describe('AwsSigV4.buildAuthorization', () => {
  it('injects x-amz-security-token when sessionToken is provided and header is missing', () => {
    const headers: Record<string, string> = {
      host: 'example.amazonaws.com',
      'x-amz-date': '20200101T000000Z',
      'x-amz-content-sha256': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };

    const out = AwsSigV4.buildAuthorization({
      method: 'GET',
      canonicalUri: '/',
      canonicalQueryString: '',
      headers,
      payloadHash: headers['x-amz-content-sha256']!,
      region: 'us-east-1',
      service: 's3',
      amzDate: headers['x-amz-date']!,
      dateStamp: '20200101',
      credentials: {
        accessKeyId: 'AKIDEXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
        sessionToken: 'session-token',
      },
    });

    expect(headers['x-amz-security-token']).toBe('session-token');
    expect(out.authorization).toContain('AWS4-HMAC-SHA256');
    expect(out.signedHeaders).toContain('x-amz-security-token');
  });
});
