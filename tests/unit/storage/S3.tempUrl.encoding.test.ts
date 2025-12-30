import { describe, expect, it } from 'vitest';

import S3Driver from '@tools/storage/drivers/S3';

describe('S3Driver.tempUrl encoding', () => {
  it("percent-encodes AWS-reserved characters in path segments (e.g. '!')", () => {
    const url = S3Driver.tempUrl(
      {
        bucket: 'my-bucket',
        region: 'us-east-1',
        accessKeyId: 'AKIDEXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      },
      'folder/hello!.txt',
      { expiresIn: 60, method: 'GET' }
    );

    // `!` must be encoded for AWS canonical encoding
    expect(url).toContain('hello%21.txt');
  });
});
