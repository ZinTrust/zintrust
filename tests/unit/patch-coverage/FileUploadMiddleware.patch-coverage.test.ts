import { fileUploadMiddleware } from '@http/middleware/FileUploadMiddleware';
import { MultipartParserRegistry } from '@http/parsers/MultipartParserRegistry';
import type { IRequest } from '@http/Request';
import type { IResponse } from '@http/Response';
import { describe, expect, it, vi } from 'vitest';

const makeRes = (): IResponse & {
  _status: number;
  _json: unknown;
} => {
  const res = {
    _status: 200,
    _json: undefined as unknown,
    setStatus: (code: number) => {
      res._status = code;
      return res as unknown as IResponse;
    },
    getStatus: () => res._status,
    json: (payload: unknown) => {
      res._json = payload;
      return res as unknown as IResponse;
    },
  } as unknown as IResponse & { _status: number; _json: unknown };

  return res;
};

describe('patch coverage: FileUploadMiddleware', () => {
  it('no-ops for non-multipart requests', async () => {
    MultipartParserRegistry.clear();

    const next = vi.fn(async () => undefined);
    const req = {
      getHeader: () => 'application/json',
    } as unknown as IRequest;
    const res = makeRes();

    await fileUploadMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('throws config error when multipart streams but no provider is registered', async () => {
    MultipartParserRegistry.clear();

    const next = vi.fn(async () => undefined);
    // Pipeable (Node-style) request with no buffered body: requires a streaming parser.
    const req = {
      getHeader: () => 'multipart/form-data; boundary=abc',
      getRaw: () => ({ pipe: () => undefined }) as any,
    } as unknown as IRequest;
    const res = makeRes();

    await expect(fileUploadMiddleware(req, res, next)).rejects.toMatchObject({
      name: 'ConfigError',
      code: 'CONFIG_ERROR',
      message: 'Multipart upload parser is not configured.',
    });
    expect(res.getStatus()).toBe(200);
    expect(res._json).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  it('parses a buffered binary body with the built-in parser (no provider needed)', async () => {
    MultipartParserRegistry.clear();

    // Boundary contains uppercase chars: must be preserved (case-sensitive).
    const boundary = 'BoUnDaRy123';
    const multipartBody = Buffer.from(
      `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="title"\r\n\r\n' +
        'hello world\r\n' +
        `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="doc[reg_cer]"; filename="cert.png"\r\n' +
        'Content-Type: image/png\r\n\r\n' +
        'BINARY\r\n' +
        `--${boundary}--\r\n`
    );

    const next = vi.fn(async () => undefined);
    let body: unknown = {};
    const req = {
      getHeader: () => `multipart/form-data; boundary=${boundary}`,
      getRaw: () => ({ body: multipartBody }) as any,
      getBody: () => body,
      setBody: (nextBody: unknown) => {
        body = nextBody;
      },
    } as unknown as IRequest;
    const res = makeRes();

    await fileUploadMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const parsedBody = body as Record<string, any>;
    expect(parsedBody['title']).toBe('hello world');
    // Original bracket field name and its dotted alias both present.
    expect(parsedBody['__files']['doc[reg_cer]']).toBeDefined();
    expect(parsedBody['__files']['doc.reg_cer']).toBeDefined();
    expect(parsedBody['__files']['doc.reg_cer'][0].originalName).toBe('cert.png');
  });

  it('parses multipart via provider and merges fields/files into body', async () => {
    MultipartParserRegistry.clear();

    const provider = vi.fn(async () => ({
      fields: { title: 'hello' },
      files: {
        upload: [
          {
            fieldName: 'upload',
            originalName: 'a.txt',
            mimeType: 'text/plain',
            size: 5,
            buffer: Buffer.from('hello'),
          },
        ],
      },
    }));
    MultipartParserRegistry.register(provider);

    const next = vi.fn(async () => undefined);

    let body: unknown = { existing: true };
    const req = {
      getHeader: () => 'multipart/form-data; boundary=abc',
      getRaw: () => ({ pipe: () => undefined }) as any,
      getBody: () => body,
      setBody: (nextBody: unknown) => {
        body = nextBody;
      },
    } as unknown as IRequest;

    const res = makeRes();

    await fileUploadMiddleware(req, res, next);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ existing: true, title: 'hello', __files: expect.any(Object) });
    expect(next).toHaveBeenCalledTimes(1);

    MultipartParserRegistry.clear();
  });

  it('continues when provider throws', async () => {
    MultipartParserRegistry.clear();

    const provider = vi.fn(async () => {
      throw new Error('boom');
    });
    MultipartParserRegistry.register(provider);

    const next = vi.fn(async () => undefined);
    const req = {
      getHeader: () => 'multipart/form-data; boundary=abc',
      getRaw: () => ({ pipe: () => undefined }) as any,
      getBody: () => ({ foo: 'bar' }),
      setBody: vi.fn(),
    } as unknown as IRequest;
    const res = makeRes();

    await fileUploadMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    MultipartParserRegistry.clear();
  });

  it('executes debug logging branch when enabled', async () => {
    MultipartParserRegistry.clear();
    process.env['ZIN_DEBUG_FILE_UPLOAD'] = 'true';

    const provider = vi.fn(async () => ({
      fields: { a: '1' },
      files: {},
    }));
    MultipartParserRegistry.register(provider);

    const next = vi.fn(async () => undefined);
    const req = {
      getHeader: () => 'multipart/form-data; boundary=abc',
      getRaw: () => ({ pipe: () => undefined }) as any,
      getBody: () => undefined,
      setBody: vi.fn(),
    } as unknown as IRequest;
    const res = makeRes();

    await fileUploadMiddleware(req, res, next);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);

    delete process.env['ZIN_DEBUG_FILE_UPLOAD'];
    MultipartParserRegistry.clear();
  });
});
