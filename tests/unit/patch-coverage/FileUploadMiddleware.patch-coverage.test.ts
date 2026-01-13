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

  it('returns 415 when multipart but no provider is registered', async () => {
    MultipartParserRegistry.clear();

    const next = vi.fn(async () => undefined);
    const req = {
      getHeader: () => 'multipart/form-data; boundary=abc',
    } as unknown as IRequest;
    const res = makeRes();

    await fileUploadMiddleware(req, res, next);
    expect(res.getStatus()).toBe(415);
    expect(res._json).toEqual({
      error: 'multipart/form-data not supported. Install @zintrust/storage to enable uploads.',
    });
    expect(next).not.toHaveBeenCalled();
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
      getRaw: () => ({}) as any,
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
      getRaw: () => ({}) as any,
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
      getRaw: () => ({}) as any,
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
