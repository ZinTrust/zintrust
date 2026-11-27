import { MultipartParser, parseMultipartFormData } from '@http/parsers/MultipartParser';
import { describe, expect, it } from 'vitest';

const buildBody = (parts: Array<{ headers: string; body: string | Buffer; tail?: string }>) => {
  const boundary = 'BOUNDARY123';
  const chunks: string[] = [];
  for (const part of parts) {
    chunks.push(`--${boundary}\r\n${part.headers}\r\n\r\n`);
    if (typeof part.body === 'string') chunks.push(part.body);
    else chunks.push(part.body.toString('latin1'));
    chunks.push(part.tail ?? '\r\n');
  }
  chunks.push(`--${boundary}--\r\n`);
  return { boundary, body: Buffer.from(chunks.join(''), 'latin1') };
};

describe('MultipartParser remaining branches', () => {
  describe('boundary extraction', () => {
    it('returns undefined when no boundary parameter is present', () => {
      expect(MultipartParser.getBoundary('multipart/form-data')).toBeUndefined();
      expect(MultipartParser.getBoundary('text/plain; charset=utf-8')).toBeUndefined();
    });

    it('strips double quotes from the boundary', () => {
      expect(MultipartParser.getBoundary('multipart/form-data; boundary="abc123"')).toBe('abc123');
      expect(MultipartParser.getBoundary('Multipart/Form-Data; boundary=abc123; charset=utf-8')).toBe(
        'abc123'
      );
    });

    it('detects multipart content type case-insensitively', () => {
      expect(MultipartParser.isMultipart('Multipart/Form-Data; boundary=x')).toBe(true);
      expect(MultipartParser.isMultipart('application/json')).toBe(false);
    });
  });

  describe('empty boundary / missing boundary input', () => {
    it('returns empty result for empty boundaries', () => {
      expect(MultipartParser.parse('anything', '')).toEqual({ fields: {}, files: {} });
      expect(parseMultipartFormData('anything', '   ')).toEqual({ fields: {}, files: {} });
    });

    it('returns empty result when the boundary is absent from the body', () => {
      const result = MultipartParser.parse('no boundaries here', 'BOUNDARY123');
      expect(result).toEqual({ fields: {}, files: {} });
    });
  });

  describe('newline trimming around part boundaries', () => {
    it('trims CRLF, a lone LF, or nothing before the closing boundary', () => {
      const crlf = buildBody([
        { headers: 'Content-Disposition: form-data; name="a"', body: 'one', tail: '\r\n' },
      ]);
      expect(MultipartParser.parse(crlf.body, crlf.boundary).fields).toEqual({ a: 'one' });

      const lf = buildBody([
        { headers: 'Content-Disposition: form-data; name="a"', body: 'two', tail: '\n' },
      ]);
      expect(MultipartParser.parse(lf.body, lf.boundary).fields).toEqual({ a: 'two' });

      const none = buildBody([
        { headers: 'Content-Disposition: form-data; name="a"', body: 'three', tail: '' },
      ]);
      expect(MultipartParser.parse(none.body, none.boundary).fields).toEqual({ a: 'three' });
    });

    it('skips zero-length parts between adjacent boundaries', () => {
      const result = MultipartParser.parse(
        Buffer.from('--B\r\n--B\r\nContent-Disposition: form-data; name="a"\r\n\r\nx\r\n--B--\r\n'),
        'B'
      );
      expect(result.fields).toEqual({ a: 'x' });
    });
  });

  describe('header parsing', () => {
    it('supports LF-only header separators', () => {
      const body = Buffer.from(
        '--B\r\nContent-Disposition: form-data; name="a"\n\nvalue\n--B--\n'
      );
      expect(MultipartParser.parse(body, 'B').fields).toEqual({ a: 'value' });
    });

    it('ignores parts with no header separator', () => {
      const body = Buffer.from('--B\r\nContent-Disposition: form-data; name="a"\r\nx\r\n--B--\r\n');
      expect(MultipartParser.parse(body, 'B')).toEqual({ fields: {}, files: {} });
    });

    it('ignores parts whose header section exceeds the size limit', () => {
      const body = Buffer.from(
        `--B\r\nContent-Disposition: form-data; name="a"\r\nX-Pad: ${'p'.repeat(17_000)}\r\n\r\nvalue\r\n--B--\r\n`
      );
      expect(MultipartParser.parse(body, 'B')).toEqual({ fields: {}, files: {} });
    });

    it('ignores parts without a content-disposition header', () => {
      const body = Buffer.from('--B\r\nContent-Type: text/plain\r\n\r\nvalue\r\n--B--\r\n');
      expect(MultipartParser.parse(body, 'B')).toEqual({ fields: {}, files: {} });
    });
  });

  describe('fields and files', () => {
    it('collects repeated fields as an array', () => {
      const { body, boundary } = buildBody([
        { headers: 'Content-Disposition: form-data; name="tag"', body: 'a' },
        { headers: 'Content-Disposition: form-data; name="tag"', body: 'b' },
        { headers: 'Content-Disposition: form-data; name="tag"', body: 'c' },
      ]);

      expect(MultipartParser.parse(body, boundary).fields).toEqual({ tag: ['a', 'b', 'c'] });
    });

    it('uses application/octet-stream when a file part has no content type', () => {
      const binary = Buffer.from([0, 255, 10, 13]);
      const { body, boundary } = buildBody([
        {
          headers: 'Content-Disposition: form-data; name="upload"; filename="raw.bin"',
          body: binary,
        },
        {
          headers:
            'Content-Disposition: form-data; name="photo"; filename="p.png"\r\nContent-Type: image/png',
          body: binary,
        },
      ]);

      const result = MultipartParser.parse(body, boundary);
      expect(result.files['upload']?.[0]).toMatchObject({
        fieldName: 'upload',
        originalName: 'raw.bin',
        mimeType: 'application/octet-stream',
        size: 4,
      });
      expect(result.files['photo']?.[0]?.mimeType).toBe('image/png');
      expect(result.files['upload']?.[0]?.buffer).toEqual(binary);
    });

    it('accepts a string body and trims field values', () => {
      const { body, boundary } = buildBody([
        { headers: 'Content-Disposition: form-data; name="field"', body: '  padded  ' },
      ]);
      expect(parseMultipartFormData(body.toString('latin1'), boundary).fields).toEqual({
        field: 'padded',
      });
    });
  });

  it('stops parsing after the maximum number of parts', () => {
    const boundary = 'B';
    const chunks: string[] = [];
    for (let i = 0; i < 1_005; i += 1) {
      chunks.push(`--B\r\nContent-Disposition: form-data; name="f${i}"\r\n\r\n${i}\r\n`);
    }
    chunks.push('--B--\r\n');

    const result = MultipartParser.parse(Buffer.from(chunks.join('')), boundary);
    expect(Object.keys(result.fields)).toHaveLength(1_000);
  });
});
