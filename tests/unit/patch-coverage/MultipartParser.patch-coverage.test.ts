import { MultipartParser } from '@http/parsers/MultipartParser';
import { describe, expect, it } from 'vitest';

describe('patch coverage: MultipartParser', () => {
  it('pushes into existing field array for the 3rd repeated field', () => {
    const boundary = 'x';
    const contentType = `multipart/form-data; boundary=${boundary}`;

    const body = [
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="tag"\r\n',
      '\r\n',
      'one\r\n',
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="tag"\r\n',
      '\r\n',
      'two\r\n',
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="tag"\r\n',
      '\r\n',
      'three\r\n',
      `--${boundary}--\r\n`,
    ].join('');

    expect(MultipartParser.isMultipart(contentType)).toBe(true);
    expect(MultipartParser.getBoundary(contentType)).toBe(boundary);

    const parsed = MultipartParser.parse(Buffer.from(body, 'utf-8'), boundary);
    expect(parsed.fields.tag).toEqual(['one', 'two', 'three']);
  });
});
