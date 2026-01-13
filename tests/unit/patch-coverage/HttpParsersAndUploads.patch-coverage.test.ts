import type { UploadedFile } from '@http/FileUpload';
import { FileUpload } from '@http/FileUpload';
import { BodyParsers } from '@http/parsers/BodyParsers';
import { MultipartParser } from '@http/parsers/MultipartParser';
import type { IRequest } from '@http/Request';
import { describe, expect, it } from 'vitest';

describe('patch coverage: BodyParsers', () => {
  it('parses urlencoded form data including repeated keys', () => {
    const result = BodyParsers.parse('application/x-www-form-urlencoded', 'a=1&a=2&b=3');
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ a: ['1', '2'], b: '3' });

    const empty = BodyParsers.parse('application/x-www-form-urlencoded', '   ');
    expect(empty.ok).toBe(true);
    expect(empty.data).toEqual({});
  });

  it('parses plain text', () => {
    const result = BodyParsers.parse('text/plain', Buffer.from('hello'));
    expect(result.ok).toBe(true);
    expect(result.data).toBe('hello');
  });

  it('parses CSV including quotes and escaped quotes', () => {
    const csv = ['name,quote', 'Alice,"Hello, world"', 'Bob,"He said ""wow"""'].join('\n');
    const result = BodyParsers.parse('text/csv', csv);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual([
      { name: 'Alice', quote: 'Hello, world' },
      { name: 'Bob', quote: 'He said "wow"' },
    ]);

    const empty = BodyParsers.parse('text/csv', '');
    expect(empty.ok).toBe(true);
    expect(empty.data).toEqual([]);
  });

  it('returns error when no parser matches', () => {
    const result = BodyParsers.parse('application/octet-stream', 'abc');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No parser found');
  });
});

describe('patch coverage: MultipartParser', () => {
  it('extracts boundary and parses fields + files', () => {
    const boundary = '----zintrust-boundary';
    const contentType = `multipart/form-data; boundary="${boundary}"`;

    expect(MultipartParser.isMultipart(contentType)).toBe(true);
    expect(MultipartParser.getBoundary(contentType)).toBe(boundary);

    const body = [
      `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="field"\r\n' +
        '\r\n' +
        'value\r\n',
      `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="file"; filename="a.txt"\r\n' +
        'Content-Type: text/plain\r\n' +
        '\r\n' +
        'hello\r\n',
      `--${boundary}--\r\n`,
    ].join('');

    const parsed = MultipartParser.parse(Buffer.from(body, 'utf-8'), boundary);

    expect(parsed.fields['field']).toBe('value');
    expect(parsed.files['file']).toHaveLength(1);
    expect(parsed.files['file']?.[0]?.originalName).toBe('a.txt');
    expect(parsed.files['file']?.[0]?.mimeType).toBe('text/plain');
    expect(parsed.files['file']?.[0]?.buffer?.toString('utf-8')).toContain('hello');
  });
});

describe('patch coverage: FileUpload', () => {
  const makeReq = (filesByField: Record<string, UploadedFile[]>): IRequest => {
    const body = { __files: filesByField };
    return {
      context: {},
      getBody: () => body,
    } as unknown as IRequest;
  };

  it('creates handler and filters by mime/size', () => {
    const file: UploadedFile = {
      fieldName: 'avatar',
      originalName: 'a.png',
      mimeType: 'image/png',
      size: 100,
      buffer: Buffer.from('x'),
    };

    const req = makeReq({ avatar: [file] });
    const handler = FileUpload.createHandler(req);

    expect(handler.hasFile('avatar')).toBe(true);
    expect(handler.file('avatar')).toBeDefined();

    // Wildcard mime allow
    expect(handler.file('avatar', { mimeTypes: ['image/*'] })?.originalName).toBe('a.png');

    // Mime reject
    expect(handler.file('avatar', { mimeTypes: ['text/plain'] })).toBeUndefined();

    // Size reject
    expect(handler.file('avatar', { maxSize: 10 })).toBeUndefined();

    // files() filtering mirrors file() validation
    expect(handler.files('avatar', { mimeTypes: ['image/*'], maxSize: 1000 })).toHaveLength(1);
    expect(handler.files('avatar', { mimeTypes: ['text/plain'] })).toHaveLength(0);
  });

  it('validates files with required/count/mime/size options', () => {
    const file: UploadedFile = {
      fieldName: 'docs',
      originalName: 'a.txt',
      mimeType: 'text/plain',
      size: 5,
      buffer: Buffer.from('hello'),
    };

    expect(FileUpload.validateFiles([], { required: true }).valid).toBe(false);
    expect(FileUpload.validateFiles([file], { minCount: 2 }).valid).toBe(false);
    expect(FileUpload.validateFiles([file, file], { maxCount: 1 }).valid).toBe(false);

    expect(FileUpload.validateFiles([file], { mimeTypes: ['text/csv'] }).valid).toBe(false);

    expect(FileUpload.validateFiles([{ ...file, size: 11 }], { maxSize: 10 }).valid).toBe(false);

    expect(FileUpload.validateFiles([file], { mimeTypes: ['text/*'], maxSize: 10 }).valid).toBe(
      true
    );
  });
});
